-- NAT Gestão: portfolio identity, sale snapshots and sporadic expenses.
begin;

alter table public.products add column if not exists portfolio_key text;
alter table public.sale_items add column if not exists portfolio_key_snapshot text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_portfolio_key_length_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_portfolio_key_length_check
      check (portfolio_key is null or char_length(btrim(portfolio_key)) between 1 and 80);
  end if;
end $$;

create unique index if not exists products_business_portfolio_key_active_idx
  on public.products(business_id, portfolio_key)
  where active = true and portfolio_key is not null;

create table if not exists public.sporadic_expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  amount numeric(12,2) not null check (amount >= 0),
  spent_at date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sporadic_expenses_business_date_idx
  on public.sporadic_expenses(business_id, spent_at desc);

alter table public.sporadic_expenses enable row level security;
drop policy if exists sporadic_expenses_select on public.sporadic_expenses;
create policy sporadic_expenses_select on public.sporadic_expenses
  for select to authenticated
  using (private.is_business_member(business_id));

revoke all on table public.sporadic_expenses from public, anon, authenticated;
grant select on table public.sporadic_expenses to authenticated;

drop trigger if exists sporadic_expenses_audit on public.sporadic_expenses;
create trigger sporadic_expenses_audit
after insert or update or delete on public.sporadic_expenses
for each row execute function private.audit_row_change();

create or replace function public.save_sporadic_expense(
  p_business_id uuid,
  p_id uuid,
  p_name text,
  p_amount numeric,
  p_spent_at date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_id is null
     or char_length(btrim(coalesce(p_name,''))) not between 1 and 160
     or p_amount is null or p_amount < 0
     or p_spent_at is null then
    raise exception 'Dados do gasto inválidos.' using errcode = '22023';
  end if;

  insert into public.sporadic_expenses(id,business_id,name,amount,spent_at)
  values (p_id,p_business_id,btrim(p_name),p_amount,p_spent_at)
  on conflict (id) do update set
    name = excluded.name,
    amount = excluded.amount,
    spent_at = excluded.spent_at,
    updated_at = now()
  where public.sporadic_expenses.business_id = p_business_id;

  if not exists (
    select 1 from public.sporadic_expenses e
    where e.id = p_id and e.business_id = p_business_id
  ) then
    raise exception 'O identificador do gasto pertence a outra empresa.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.delete_sporadic_expense(p_business_id uuid,p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  delete from public.sporadic_expenses
  where business_id = p_business_id and id = p_id;
end;
$$;

revoke all on function public.save_sporadic_expense(uuid,uuid,text,numeric,date) from public,anon;
revoke all on function public.delete_sporadic_expense(uuid,uuid) from public,anon;
grant execute on function public.save_sporadic_expense(uuid,uuid,text,numeric,date) to authenticated;
grant execute on function public.delete_sporadic_expense(uuid,uuid) to authenticated;

-- Keep the reviewed 10-argument product RPC for compatibility and add a portfolio-aware form.
create or replace function public.save_product(
  p_business_id uuid,
  p_id uuid,
  p_name text,
  p_batch_yield numeric,
  p_selling_price numeric,
  p_loss_percent numeric,
  p_production_cost_per_batch numeric,
  p_minimum_margin_percent numeric,
  p_target_margin_percent numeric,
  p_recipe jsonb,
  p_portfolio_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_portfolio_key is not null
     and char_length(btrim(p_portfolio_key)) not between 1 and 80 then
    raise exception 'Identificador de portfólio inválido.' using errcode = '22023';
  end if;

  perform public.save_product(
    p_business_id,p_id,p_name,p_batch_yield,p_selling_price,p_loss_percent,
    p_production_cost_per_batch,p_minimum_margin_percent,p_target_margin_percent,p_recipe
  );

  update public.products
  set portfolio_key = nullif(btrim(p_portfolio_key),'')
  where business_id = p_business_id and id = p_id;
end;
$$;

revoke all on function public.save_product(uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,jsonb,text) from public,anon;
grant execute on function public.save_product(uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,jsonb,text) to authenticated;

-- Remove the obsolete client-snapshot sale RPC. It is no longer part of the supported write surface.
drop function if exists public.save_sale(uuid,uuid,uuid,text,numeric,numeric,text,timestamp with time zone,numeric,numeric,numeric);

create or replace function public.save_sale(
  p_business_id uuid,
  p_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_total_received numeric,
  p_payment_method text,
  p_sold_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_item record;
  v_package record;
  v_inputs numeric := 0;
  v_before_loss numeric;
  v_total_batch numeric;
  v_unit_cost numeric;
  v_fee_percent numeric := 0;
  v_variable_fee numeric;
  v_contribution numeric;
  v_package_base numeric;
  v_usage_base numeric;
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0
     or p_total_received is null or p_total_received < 0
     or p_payment_method not in ('pix','cash','card','other') then
    raise exception 'Dados da venda inválidos.' using errcode = '22023';
  end if;

  select * into v_product
  from public.products
  where business_id = p_business_id and id = p_product_id and active = true;
  if not found then
    raise exception 'Produto não encontrado ou inativo.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.recipe_items ri
    where ri.business_id = p_business_id and ri.product_id = p_product_id
  ) then
    raise exception 'Complete a receita antes de registrar uma venda.' using errcode = '22023';
  end if;

  for v_item in
    select ri.supply_id, ri.quantity, ri.unit
    from public.recipe_items ri
    where ri.business_id = p_business_id and ri.product_id = p_product_id
  loop
    select sp.package_quantity, sp.package_unit, sp.package_price
      into v_package
    from public.supply_purchases sp
    where sp.business_id = p_business_id and sp.supply_id = v_item.supply_id
    order by sp.purchased_at desc, sp.created_at desc
    limit 1;

    if not found then
      raise exception 'A receita contém item sem compra cadastrada.' using errcode = '22023';
    end if;
    if private.unit_dimension(v_item.unit) is null
       or private.unit_dimension(v_item.unit) <> private.unit_dimension(v_package.package_unit) then
      raise exception 'A receita contém unidade incompatível.' using errcode = '22023';
    end if;

    v_package_base := private.unit_base_amount(v_package.package_quantity, v_package.package_unit);
    v_usage_base := private.unit_base_amount(v_item.quantity, v_item.unit);
    if v_package_base is null or v_package_base <= 0 or v_usage_base is null or v_usage_base <= 0 then
      raise exception 'Quantidade inválida na receita.' using errcode = '22023';
    end if;
    v_inputs := v_inputs + (v_package.package_price / v_package_base) * v_usage_base;
  end loop;

  v_before_loss := v_inputs + v_product.production_cost_per_batch;
  v_total_batch := v_before_loss * (1 + v_product.loss_percent / 100);
  v_unit_cost := v_total_batch / v_product.batch_yield;

  select payment_fee_percent into v_fee_percent
  from public.business_settings
  where business_id = p_business_id;
  v_fee_percent := coalesce(v_fee_percent,0);
  v_variable_fee := p_total_received * v_fee_percent / 100;
  v_contribution := p_total_received - (v_unit_cost * p_quantity) - v_variable_fee;

  insert into public.sales(
    id,business_id,sold_at,total_received,payment_method,variable_fee_snapshot,contribution_snapshot
  ) values (
    p_id,p_business_id,p_sold_at,p_total_received,p_payment_method,v_variable_fee,v_contribution
  );

  insert into public.sale_items(
    business_id,sale_id,product_id,product_name_snapshot,portfolio_key_snapshot,
    quantity,unit_cost_snapshot,unit_price_snapshot
  ) values (
    p_business_id,p_id,p_product_id,v_product.name,v_product.portfolio_key,
    p_quantity,v_unit_cost,case when p_quantity > 0 then p_total_received / p_quantity else 0 end
  );
end;
$$;

revoke all on function public.save_sale(uuid,uuid,uuid,numeric,numeric,text,timestamptz) from public,anon;
grant execute on function public.save_sale(uuid,uuid,uuid,numeric,numeric,text,timestamptz) to authenticated;

-- Remove obsolete write policies as defense in depth; reviewed RPCs remain the only mutation path.
drop policy if exists supplies_insert on public.supplies;
drop policy if exists supplies_update on public.supplies;
drop policy if exists supplies_delete on public.supplies;
drop policy if exists supply_purchases_insert on public.supply_purchases;
drop policy if exists supply_purchases_update on public.supply_purchases;
drop policy if exists supply_purchases_delete on public.supply_purchases;
drop policy if exists products_insert on public.products;
drop policy if exists products_update on public.products;
drop policy if exists products_delete on public.products;
drop policy if exists recipe_items_insert on public.recipe_items;
drop policy if exists recipe_items_update on public.recipe_items;
drop policy if exists recipe_items_delete on public.recipe_items;

revoke insert,update,delete on public.supplies from authenticated;
revoke insert,update,delete on public.supply_purchases from authenticated;
revoke insert,update,delete on public.products from authenticated;
revoke insert,update,delete on public.recipe_items from authenticated;
revoke insert,update,delete on public.sporadic_expenses from authenticated;

commit;

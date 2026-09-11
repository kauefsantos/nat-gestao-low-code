-- NAT Gestão: integrity hardening, shared-business bootstrap and immutable history.
begin;

-- Allowlisted accounts can be pre-assigned to the same business before first login.
alter table private.allowed_auth_emails add column if not exists business_id uuid;
alter table private.allowed_auth_emails add column if not exists role text not null default 'member';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'allowed_auth_emails_role_check'
      and conrelid = 'private.allowed_auth_emails'::regclass
  ) then
    alter table private.allowed_auth_emails
      add constraint allowed_auth_emails_role_check check (role in ('admin','member'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'allowed_auth_emails_business_id_fkey'
      and conrelid = 'private.allowed_auth_emails'::regclass
  ) then
    alter table private.allowed_auth_emails
      add constraint allowed_auth_emails_business_id_fkey
      foreign key (business_id) references public.businesses(id) on delete set null;
  end if;
end $$;

-- Preserve audit history even if a business is administratively removed.
alter table public.audit_log alter column business_id drop not null;
alter table public.audit_log drop constraint if exists audit_log_business_id_fkey;
alter table public.audit_log
  add constraint audit_log_business_id_fkey
  foreign key (business_id) references public.businesses(id) on delete set null;

create table if not exists private.allowed_auth_email_audit (
  id bigint generated always as identity primary key,
  email text,
  business_id uuid,
  role text,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  actor_user_id uuid,
  changed_at timestamptz not null default now()
);
revoke all on private.allowed_auth_email_audit from public, anon, authenticated;

create or replace function private.audit_allowed_auth_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_row jsonb;
begin
  source_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into private.allowed_auth_email_audit(email,business_id,role,action,actor_user_id)
  values (
    source_row ->> 'email',
    nullif(source_row ->> 'business_id','')::uuid,
    source_row ->> 'role',
    tg_op,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;
revoke all on function private.audit_allowed_auth_email() from public, anon, authenticated;

drop trigger if exists allowed_auth_emails_audit on private.allowed_auth_emails;
create trigger allowed_auth_emails_audit
after insert or update or delete on private.allowed_auth_emails
for each row execute function private.audit_allowed_auth_email();

-- Audit businesses as well as their child entities.
create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_source jsonb;
  v_business_id uuid;
  v_entity_id uuid;
begin
  if tg_op = 'INSERT' then
    v_after := to_jsonb(new);
    v_source := v_after;
  elsif tg_op = 'UPDATE' then
    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
    v_source := v_after;
  else
    v_before := to_jsonb(old);
    v_source := v_before;
  end if;

  if tg_table_name = 'businesses' then
    v_business_id := nullif(v_source ->> 'id', '')::uuid;
  else
    v_business_id := nullif(v_source ->> 'business_id', '')::uuid;
  end if;
  v_entity_id := nullif(coalesce(v_source ->> 'id', v_source ->> 'user_id', v_source ->> 'business_id'), '')::uuid;

  insert into public.audit_log(
    business_id, actor_user_id, action, entity_table, entity_id, before_data, after_data
  ) values (
    v_business_id, auth.uid(), tg_op, tg_table_name, v_entity_id, v_before, v_after
  );
  return coalesce(new, old);
end;
$$;
revoke all on function private.audit_row_change() from public, anon, authenticated;

drop trigger if exists businesses_audit on public.businesses;
create trigger businesses_audit
after insert or update or delete on public.businesses
for each row execute function private.audit_row_change();

-- Unit validation helpers. Invalid dimensions must fail closed instead of becoming cost zero.
create or replace function private.unit_dimension(p_unit text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_unit in ('g','kg') then 'mass'
    when p_unit in ('ml','l') then 'volume'
    when p_unit = 'unit' then 'unit'
    else null
  end;
$$;
revoke all on function private.unit_dimension(text) from public, anon;
grant execute on function private.unit_dimension(text) to authenticated;

create or replace function private.unit_base_amount(p_quantity numeric, p_unit text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case p_unit
    when 'kg' then p_quantity * 1000
    when 'g' then p_quantity
    when 'l' then p_quantity * 1000
    when 'ml' then p_quantity
    when 'unit' then p_quantity
    else null
  end;
$$;
revoke all on function private.unit_base_amount(numeric,text) from public, anon;
grant execute on function private.unit_base_amount(numeric,text) to authenticated;

-- Cross-table margin invariants cannot be expressed as CHECK constraints.
create or replace function private.validate_product_margin()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_fee numeric := 0;
begin
  select payment_fee_percent into v_fee
  from public.business_settings
  where business_id = new.business_id;
  v_fee := coalesce(v_fee, 0);
  if new.minimum_margin_percent + v_fee >= 100
     or new.target_margin_percent + v_fee >= 100 then
    raise exception 'Margem e taxa somadas precisam ser menores que 100%%.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists products_validate_margin on public.products;
create trigger products_validate_margin
before insert or update of minimum_margin_percent,target_margin_percent,business_id on public.products
for each row execute function private.validate_product_margin();

create or replace function private.validate_settings_margin()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_max_margin numeric := 0;
begin
  select coalesce(max(greatest(minimum_margin_percent,target_margin_percent)),0)
  into v_max_margin
  from public.products
  where business_id = new.business_id and active = true;
  if v_max_margin + new.payment_fee_percent >= 100 then
    raise exception 'A taxa torna a margem de um produto impossível. Ajuste a taxa ou as margens.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists settings_validate_margin on public.business_settings;
create trigger settings_validate_margin
before insert or update of payment_fee_percent on public.business_settings
for each row execute function private.validate_settings_margin();

-- Historical rows are append-only for ordinary authenticated sessions.
create or replace function private.prevent_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('postgres','supabase_admin') then
    return coalesce(new, old);
  end if;
  raise exception 'Registros históricos não podem ser alterados diretamente.' using errcode = '42501';
end;
$$;

drop trigger if exists supply_purchases_immutable on public.supply_purchases;
create trigger supply_purchases_immutable
before update or delete on public.supply_purchases
for each row execute function private.prevent_history_mutation();

drop trigger if exists sales_immutable on public.sales;
create trigger sales_immutable
before update or delete on public.sales
for each row execute function private.prevent_history_mutation();

drop trigger if exists sale_items_immutable on public.sale_items;
create trigger sale_items_immutable
before update or delete on public.sale_items
for each row execute function private.prevent_history_mutation();

-- The current application intentionally models one product per sale.
create unique index if not exists sale_items_one_item_per_sale_idx
on public.sale_items(business_id, sale_id);

-- First login joins the business pre-assigned to the allowlisted email.
create or replace function public.bootstrap_nat_business(
  p_name text default 'NAT',
  p_owner_name text default 'NAT'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_business_id uuid;
  v_role text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'MFA required' using errcode = '42501';
  end if;

  select bm.business_id into v_business_id
  from public.business_members bm
  where bm.user_id = v_user_id
  order by bm.created_at
  limit 1;
  if v_business_id is not null then
    return v_business_id;
  end if;

  select lower(btrim(u.email)) into v_email
  from auth.users u where u.id = v_user_id;

  select a.business_id, a.role
    into v_business_id, v_role
  from private.allowed_auth_emails a
  where a.email = v_email
  for update;

  if not found then
    raise exception 'Cadastro não autorizado para este e-mail.' using errcode = '42501';
  end if;

  if v_business_id is null then
    insert into public.businesses(name)
    values (left(coalesce(nullif(btrim(p_name),''),'NAT'),120))
    returning id into v_business_id;
    insert into public.business_settings(business_id,owner_name)
    values (v_business_id,left(coalesce(nullif(btrim(p_owner_name),''),'NAT'),120));
    update private.allowed_auth_emails
    set business_id = v_business_id, role = 'admin'
    where email = v_email;
    v_role := 'admin';
  end if;

  insert into public.business_members(business_id,user_id,role)
  values (v_business_id,v_user_id,coalesce(v_role,'member'))
  on conflict (business_id,user_id) do nothing;

  return v_business_id;
end;
$$;
revoke all on function public.bootstrap_nat_business(text,text) from public, anon;
grant execute on function public.bootstrap_nat_business(text,text) to authenticated;

-- Do not allow an ingredient used by an active recipe to disappear from cost calculations.
create or replace function public.delete_supply(p_business_id uuid, p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.recipe_items ri
    join public.products p
      on p.business_id = ri.business_id and p.id = ri.product_id
    where ri.business_id = p_business_id
      and ri.supply_id = p_id
      and p.active = true
  ) then
    raise exception 'Este item está em uma receita ativa e não pode ser arquivado.' using errcode = '23503';
  end if;
  update public.supplies set active = false
  where business_id = p_business_id and id = p_id;
end;
$$;

-- Validate every recipe before replacing the stored recipe.
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
  p_recipe jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  v_supply_id uuid;
  v_quantity numeric;
  v_unit text;
  v_package_unit text;
begin
  if jsonb_typeof(coalesce(p_recipe,'[]'::jsonb)) <> 'array' then
    raise exception 'Receita inválida.' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(coalesce(p_recipe,'[]'::jsonb)) loop
    v_supply_id := nullif(item ->> 'supplyId','')::uuid;
    v_quantity := nullif(item ->> 'quantity','')::numeric;
    v_unit := item ->> 'unit';
    if v_supply_id is null or v_quantity is null or v_quantity <= 0 then
      raise exception 'Todo item da receita precisa de ingrediente e quantidade maior que zero.' using errcode = '22023';
    end if;

    select sp.package_unit into v_package_unit
    from public.supply_purchases sp
    where sp.business_id = p_business_id and sp.supply_id = v_supply_id
    order by sp.purchased_at desc, sp.created_at desc
    limit 1;

    if v_package_unit is null then
      raise exception 'Ingrediente sem compra válida cadastrada.' using errcode = '22023';
    end if;
    if private.unit_dimension(v_unit) is null
       or private.unit_dimension(v_unit) <> private.unit_dimension(v_package_unit) then
      raise exception 'Unidade incompatível com a unidade de compra do ingrediente.' using errcode = '22023';
    end if;
  end loop;

  insert into public.products(
    id,business_id,name,batch_yield,selling_price,loss_percent,
    production_cost_per_batch,minimum_margin_percent,target_margin_percent,active
  ) values (
    p_id,p_business_id,p_name,p_batch_yield,p_selling_price,p_loss_percent,
    p_production_cost_per_batch,p_minimum_margin_percent,p_target_margin_percent,true
  )
  on conflict (id) do update set
    business_id = excluded.business_id,
    name = excluded.name,
    batch_yield = excluded.batch_yield,
    selling_price = excluded.selling_price,
    loss_percent = excluded.loss_percent,
    production_cost_per_batch = excluded.production_cost_per_batch,
    minimum_margin_percent = excluded.minimum_margin_percent,
    target_margin_percent = excluded.target_margin_percent,
    active = true;

  delete from public.recipe_items
  where business_id = p_business_id and product_id = p_id;

  insert into public.recipe_items(id,business_id,product_id,supply_id,quantity,unit)
  select
    coalesce(nullif(x ->> 'id','')::uuid,gen_random_uuid()),
    p_business_id,
    p_id,
    (x ->> 'supplyId')::uuid,
    (x ->> 'quantity')::numeric,
    x ->> 'unit'
  from jsonb_array_elements(coalesce(p_recipe,'[]'::jsonb)) x;
end;
$$;

-- Sales are authoritative on the server: the browser never supplies cost/profit snapshots.
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
    business_id,sale_id,product_id,product_name_snapshot,quantity,unit_cost_snapshot,unit_price_snapshot
  ) values (
    p_business_id,p_id,p_product_id,v_product.name,p_quantity,v_unit_cost,
    case when p_quantity > 0 then p_total_received / p_quantity else 0 end
  );
end;
$$;
revoke all on function public.save_sale(uuid,uuid,uuid,numeric,numeric,text,timestamptz) from public, anon;
grant execute on function public.save_sale(uuid,uuid,uuid,numeric,numeric,text,timestamptz) to authenticated;

create or replace function public.delete_sale(p_business_id uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  delete from public.sales where business_id = p_business_id and id = p_id;
end;
$$;
revoke all on function public.delete_sale(uuid,uuid) from public, anon;
grant execute on function public.delete_sale(uuid,uuid) to authenticated;

-- Defense in depth: no direct mutation path for authoritative sale history.
drop policy if exists sales_insert on public.sales;
drop policy if exists sales_update on public.sales;
drop policy if exists sales_delete on public.sales;
drop policy if exists sale_items_insert on public.sale_items;
drop policy if exists sale_items_update on public.sale_items;
drop policy if exists sale_items_delete on public.sale_items;
revoke insert, update, delete on public.sales from authenticated;
revoke insert, update, delete on public.sale_items from authenticated;

-- Purchases can be appended but their past cannot be rewritten by the client.
drop policy if exists supply_purchases_update on public.supply_purchases;
drop policy if exists supply_purchases_delete on public.supply_purchases;
revoke update, delete on public.supply_purchases from authenticated;

commit;

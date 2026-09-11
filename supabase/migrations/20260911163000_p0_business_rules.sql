begin;

-- P0 business rules: customers/CRM, transaction types, explicit labor, and finance separation.

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  phone text,
  instagram text,
  source text,
  marketing_consent boolean not null default false,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id,id),
  check (phone is null or char_length(btrim(phone)) between 1 and 40),
  check (instagram is null or char_length(btrim(instagram)) between 1 and 80),
  check (source is null or char_length(btrim(source)) between 1 and 120),
  check (notes is null or char_length(btrim(notes)) between 1 and 1000)
);

alter table public.customers enable row level security;
revoke all on public.customers from public,anon,authenticated;
grant select on public.customers to authenticated;
grant all on public.customers to service_role;
drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers for select to authenticated using (private.is_business_member(business_id));

drop trigger if exists customers_touch_updated_at on public.customers;
create trigger customers_touch_updated_at before update on public.customers for each row execute function private.set_updated_at();
drop trigger if exists customers_audit on public.customers;
create trigger customers_audit after insert or update or delete on public.customers for each row execute function private.audit_row_change();

alter table public.products add column if not exists labor_cost_per_batch numeric(14,2) not null default 0 check (labor_cost_per_batch >= 0);
alter table public.business_settings add column if not exists owner_hourly_rate numeric(14,2) not null default 20 check (owner_hourly_rate >= 0);
alter table public.business_settings add column if not exists owner_daily_hours numeric(8,2) not null default 3 check (owner_daily_hours >= 0 and owner_daily_hours <= 24);
alter table public.sales add column if not exists customer_id uuid;
alter table public.sales add column if not exists transaction_type text not null default 'sale';
alter table public.sale_items add column if not exists labor_cost_snapshot numeric(14,4) not null default 0 check (labor_cost_snapshot >= 0);

alter table public.sales drop constraint if exists sales_customer_business_fk;
alter table public.sales add constraint sales_customer_business_fk foreign key (business_id,customer_id) references public.customers(business_id,id) on delete set null;
alter table public.sales drop constraint if exists sales_transaction_type_check;
alter table public.sales add constraint sales_transaction_type_check check (transaction_type in ('sale','courtesy','personal_consumption','loss'));
alter table public.sales drop constraint if exists sales_noncommercial_zero_received_check;
alter table public.sales add constraint sales_noncommercial_zero_received_check check (transaction_type='sale' or total_received=0);

create index if not exists customers_business_name_idx on public.customers(business_id,name);
create index if not exists sales_business_customer_idx on public.sales(business_id,customer_id,sold_at desc) where customer_id is not null;
create index if not exists sales_business_transaction_type_idx on public.sales(business_id,transaction_type,sold_at desc);

-- Existing brigadeiro operating model: R$30 was labor, not gas/energy.
update public.products
set labor_cost_per_batch=30,
    production_cost_per_batch=0,
    updated_at=now()
where name like 'Brigadeiro •%'
  and name not like 'Base técnica%'
  and production_cost_per_batch=30
  and labor_cost_per_batch=0;

-- Historical sale item snapshots preserve the labor component separately.
update public.sale_items si
set labor_cost_snapshot = round((p.labor_cost_per_batch / nullif(p.batch_yield,0))::numeric,4)
from public.products p
where p.business_id=si.business_id
  and p.id=si.product_id
  and si.labor_cost_snapshot=0;

-- Free technical unit remains available only for historical references/courtesy records.
update public.products
set available=false, updated_at=now()
where name='Brigadeiro • Ninho • Unitário';

-- Business rule: recommended/target margin cannot be below minimum margin.
create or replace function private.validate_product_margin()
returns trigger
language plpgsql
set search_path=''
as $$
declare v_fee numeric:=0;
begin
  select payment_fee_percent into v_fee from public.business_settings where business_id=new.business_id;
  v_fee:=coalesce(v_fee,0);
  if new.target_margin_percent < new.minimum_margin_percent then
    raise exception 'A margem recomendada não pode ser menor que a margem mínima.' using errcode='22023';
  end if;
  if new.minimum_margin_percent+v_fee>=100 or new.target_margin_percent+v_fee>=100 then
    raise exception 'Margem e taxa somadas precisam ser menores que 100%%.' using errcode='22023';
  end if;
  return new;
end;
$$;

-- Cost = ingredients + ingredient loss + packaging + labor + production overhead.
create or replace function private.product_unit_cost_at_date(
  p_business_id uuid,
  p_product_id uuid,
  p_sale_date date
)
returns numeric
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_product public.products%rowtype;
  v_item record;
  v_package record;
  v_ingredients numeric:=0;
  v_packaging numeric:=0;
  v_package_base numeric;
  v_usage_base numeric;
  v_item_cost numeric;
begin
  select * into v_product from public.products where business_id=p_business_id and id=p_product_id and active=true;
  if not found then raise exception 'Produto não encontrado ou inativo.' using errcode='22023'; end if;
  if not exists(select 1 from public.recipe_items where business_id=p_business_id and product_id=p_product_id) then
    raise exception 'Complete a receita antes de registrar uma venda.' using errcode='22023';
  end if;
  for v_item in
    select ri.supply_id,ri.quantity,ri.unit,s.category
    from public.recipe_items ri
    join public.supplies s on s.business_id=ri.business_id and s.id=ri.supply_id
    where ri.business_id=p_business_id and ri.product_id=p_product_id
  loop
    select sp.package_quantity,sp.package_unit,sp.package_price into v_package
    from public.supply_purchases sp
    where sp.business_id=p_business_id and sp.supply_id=v_item.supply_id and sp.purchased_at<=p_sale_date
    order by sp.purchased_at desc,sp.created_at desc limit 1;
    if not found then raise exception 'Não há compra válida do ingrediente na data desta venda.' using errcode='22023'; end if;
    if private.unit_dimension(v_item.unit) is null or private.unit_dimension(v_item.unit)<>private.unit_dimension(v_package.package_unit) then
      raise exception 'A receita contém unidade incompatível.' using errcode='22023';
    end if;
    v_package_base:=private.unit_base_amount(v_package.package_quantity,v_package.package_unit);
    v_usage_base:=private.unit_base_amount(v_item.quantity,v_item.unit);
    if v_package_base is null or v_package_base<=0 or v_usage_base is null or v_usage_base<=0 then
      raise exception 'Quantidade inválida na receita.' using errcode='22023';
    end if;
    v_item_cost:=(v_package.package_price/v_package_base)*v_usage_base;
    if v_item.category='packaging' then v_packaging:=v_packaging+v_item_cost; else v_ingredients:=v_ingredients+v_item_cost; end if;
  end loop;
  return ((v_ingredients*(1+v_product.loss_percent/100))+v_packaging+v_product.labor_cost_per_batch+v_product.production_cost_per_batch)/v_product.batch_yield;
end;
$$;

create or replace function public.save_customer(
  p_business_id uuid,
  p_id uuid,
  p_name text,
  p_phone text default null,
  p_instagram text default null,
  p_source text default null,
  p_marketing_consent boolean default false,
  p_notes text default null,
  p_active boolean default true
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_id is null or char_length(btrim(coalesce(p_name,''))) not between 1 and 160 then raise exception 'Dados do cliente inválidos.' using errcode='22023'; end if;
  insert into public.customers(id,business_id,name,phone,instagram,source,marketing_consent,notes,active)
  values(p_id,p_business_id,btrim(p_name),nullif(btrim(coalesce(p_phone,'')),''),nullif(btrim(coalesce(p_instagram,'')),''),nullif(btrim(coalesce(p_source,'')),''),coalesce(p_marketing_consent,false),nullif(btrim(coalesce(p_notes,'')),''),coalesce(p_active,true))
  on conflict(id) do update set
    name=excluded.name,phone=excluded.phone,instagram=excluded.instagram,source=excluded.source,
    marketing_consent=excluded.marketing_consent,notes=excluded.notes,active=excluded.active,updated_at=now()
  where public.customers.business_id=p_business_id;
  if not exists(select 1 from public.customers c where c.id=p_id and c.business_id=p_business_id) then raise exception 'O identificador do cliente pertence a outra empresa.' using errcode='42501'; end if;
end;
$$;
revoke all on function public.save_customer(uuid,uuid,text,text,text,text,boolean,text,boolean) from public,anon;
grant execute on function public.save_customer(uuid,uuid,text,text,text,text,boolean,text,boolean) to authenticated,service_role;

create or replace function public.save_business_settings_v2(
  p_business_id uuid,
  p_owner_name text,
  p_monthly_fixed_costs numeric,
  p_payment_fee_percent numeric,
  p_default_minimum_margin_percent numeric,
  p_default_target_margin_percent numeric,
  p_owner_hourly_rate numeric,
  p_owner_daily_hours numeric
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_default_target_margin_percent<p_default_minimum_margin_percent then raise exception 'A margem recomendada não pode ser menor que a margem mínima.' using errcode='22023'; end if;
  if p_owner_hourly_rate<0 or p_owner_daily_hours<0 or p_owner_daily_hours>24 then raise exception 'Referência de trabalho inválida.' using errcode='22023'; end if;
  perform public.save_business_settings(p_business_id,p_owner_name,p_monthly_fixed_costs,p_payment_fee_percent,p_default_minimum_margin_percent,p_default_target_margin_percent);
  update public.business_settings set owner_hourly_rate=p_owner_hourly_rate,owner_daily_hours=p_owner_daily_hours,updated_at=now() where business_id=p_business_id;
end;
$$;

create or replace function public.save_product_v2(
  p_business_id uuid,
  p_id uuid,
  p_name text,
  p_batch_yield numeric,
  p_selling_price numeric,
  p_loss_percent numeric,
  p_labor_cost_per_batch numeric,
  p_production_cost_per_batch numeric,
  p_minimum_margin_percent numeric,
  p_target_margin_percent numeric,
  p_recipe jsonb,
  p_portfolio_key text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if p_labor_cost_per_batch is null or p_labor_cost_per_batch<0 then raise exception 'Custo de mão de obra inválido.' using errcode='22023'; end if;
  if p_target_margin_percent<p_minimum_margin_percent then raise exception 'A margem recomendada não pode ser menor que a margem mínima.' using errcode='22023'; end if;
  perform public.save_product(p_business_id,p_id,p_name,p_batch_yield,p_selling_price,p_loss_percent,p_production_cost_per_batch,p_minimum_margin_percent,p_target_margin_percent,p_recipe,p_portfolio_key);
  update public.products set labor_cost_per_batch=p_labor_cost_per_batch,updated_at=now() where business_id=p_business_id and id=p_id;
end;
$$;

create or replace function public.save_sale_items_v2(
  p_business_id uuid,
  p_id uuid,
  p_items jsonb,
  p_total_received numeric,
  p_payment_method text,
  p_sold_at timestamptz,
  p_customer_id uuid default null,
  p_transaction_type text default 'sale'
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_item jsonb; v_line jsonb; v_product public.products%rowtype; v_product_id uuid; v_quantity numeric;
  v_unit_cost numeric; v_unit_labor numeric; v_line_list numeric; v_line_revenue numeric; v_total_list numeric:=0;
  v_total_quantity numeric:=0; v_total_cost numeric:=0; v_fee_percent numeric:=0; v_variable_fee numeric; v_contribution numeric;
  v_sale_date date; v_seen uuid[]:=array[]::uuid[]; v_lines jsonb:='[]'::jsonb;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_transaction_type not in('sale','courtesy','personal_consumption','loss') then raise exception 'Tipo de movimentação inválido.' using errcode='22023'; end if;
  if p_transaction_type<>'sale' and coalesce(p_total_received,0)<>0 then raise exception 'Movimentações sem venda precisam ter valor recebido igual a zero.' using errcode='22023'; end if;
  if p_customer_id is not null and not exists(select 1 from public.customers c where c.business_id=p_business_id and c.id=p_customer_id and c.active=true) then raise exception 'Cliente não encontrado ou inativo.' using errcode='22023'; end if;
  if p_id is null or p_sold_at is null or p_total_received is null or p_total_received<0 or p_payment_method not in('pix','cash','card','other') or jsonb_typeof(coalesce(p_items,'null'::jsonb))<>'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'Dados da movimentação inválidos.' using errcode='22023'; end if;
  v_sale_date:=(p_sold_at at time zone 'America/Sao_Paulo')::date;
  for v_item in select value from jsonb_array_elements(p_items) loop
    begin v_product_id:=nullif(v_item->>'productId','')::uuid; v_quantity:=nullif(v_item->>'quantity','')::numeric; exception when others then raise exception 'Item inválido.' using errcode='22023'; end;
    if v_product_id is null or v_quantity is null or v_quantity<=0 then raise exception 'Cada item precisa de produto e quantidade maior que zero.' using errcode='22023'; end if;
    if v_product_id=any(v_seen) then raise exception 'O mesmo produto não pode aparecer duas vezes.' using errcode='22023'; end if;
    v_seen:=array_append(v_seen,v_product_id);
    select * into v_product from public.products where business_id=p_business_id and id=v_product_id and active=true;
    if not found then raise exception 'Produto não encontrado ou inativo.' using errcode='22023'; end if;
    if p_transaction_type='sale' and v_product.available=false then raise exception 'Produto temporariamente indisponível para venda.' using errcode='22023'; end if;
    v_unit_cost:=private.product_unit_cost_at_date(p_business_id,v_product_id,v_sale_date);
    v_unit_labor:=v_product.labor_cost_per_batch/v_product.batch_yield;
    v_line_list:=v_product.selling_price*v_quantity;
    v_total_list:=v_total_list+v_line_list; v_total_quantity:=v_total_quantity+v_quantity; v_total_cost:=v_total_cost+(v_unit_cost*v_quantity);
    v_lines:=v_lines||jsonb_build_array(jsonb_build_object('productId',v_product.id,'productName',v_product.name,'portfolioKey',v_product.portfolio_key,'quantity',v_quantity,'unitCost',v_unit_cost,'unitLabor',v_unit_labor,'listTotal',v_line_list));
  end loop;
  select payment_fee_percent into v_fee_percent from public.business_settings where business_id=p_business_id; v_fee_percent:=coalesce(v_fee_percent,0);
  v_variable_fee:=case when p_transaction_type='sale' then p_total_received*v_fee_percent/100 else 0 end;
  v_contribution:=case when p_transaction_type='sale' then p_total_received else 0 end-v_total_cost-v_variable_fee;
  insert into public.sales(id,business_id,sold_at,total_received,payment_method,variable_fee_snapshot,contribution_snapshot,status,customer_id,transaction_type)
  values(p_id,p_business_id,p_sold_at,p_total_received,p_payment_method,v_variable_fee,v_contribution,'completed',p_customer_id,p_transaction_type);
  for v_line in select value from jsonb_array_elements(v_lines) loop
    if p_transaction_type='sale' then
      if v_total_list>0 then v_line_revenue:=p_total_received*((v_line->>'listTotal')::numeric/v_total_list); else v_line_revenue:=p_total_received*((v_line->>'quantity')::numeric/v_total_quantity); end if;
    else v_line_revenue:=0; end if;
    insert into public.sale_items(business_id,sale_id,product_id,product_name_snapshot,portfolio_key_snapshot,quantity,unit_cost_snapshot,labor_cost_snapshot,unit_price_snapshot)
    values(p_business_id,p_id,(v_line->>'productId')::uuid,v_line->>'productName',nullif(v_line->>'portfolioKey',''),(v_line->>'quantity')::numeric,(v_line->>'unitCost')::numeric,(v_line->>'unitLabor')::numeric,v_line_revenue/(v_line->>'quantity')::numeric);
  end loop;
end;
$$;

-- Authoritative transition dispatcher now uses P0-aware functions.
create or replace function public.apply_nat_transition(p_business_id uuid,p_operations jsonb)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_operation jsonb; v_payload jsonb; v_type text; v_expected text; v_id uuid;
begin
 if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
 if p_operations is null or jsonb_typeof(p_operations)<>'array' then raise exception 'Operações inválidas.' using errcode='22023'; end if;
 if jsonb_array_length(p_operations)>500 then raise exception 'Muitas operações em uma única alteração.' using errcode='22023'; end if;
 for v_operation in select value from jsonb_array_elements(p_operations) loop
  v_type:=v_operation->>'type'; v_payload:=coalesce(v_operation->'payload','{}'::jsonb); v_expected:=nullif(v_operation->>'expectedUpdatedAt','');
  if v_type='save_business_settings' then
    perform private.assert_nat_version('settings',p_business_id,null,v_expected);
    perform public.save_business_settings_v2(p_business_id,v_payload->>'ownerName',(v_payload->>'monthlyFixedCosts')::numeric,(v_payload->>'paymentFeePercent')::numeric,(v_payload->>'defaultMinimumMarginPercent')::numeric,(v_payload->>'defaultTargetMarginPercent')::numeric,coalesce((v_payload->>'ownerHourlyRate')::numeric,20),coalesce((v_payload->>'ownerDailyHours')::numeric,3)); continue;
  elsif v_type='save_customer' then
    perform public.save_customer(p_business_id,(v_payload->>'id')::uuid,v_payload->>'name',v_payload->>'phone',v_payload->>'instagram',v_payload->>'source',coalesce((v_payload->>'marketingConsent')::boolean,false),v_payload->>'notes',coalesce((v_payload->>'active')::boolean,true)); continue;
  end if;
  begin v_id:=(v_payload->>'id')::uuid; exception when others then raise exception 'Identificador inválido em %.',coalesce(v_type,'operação') using errcode='22023'; end;
  case v_type
   when 'cancel_sale' then perform private.assert_nat_version('sale',p_business_id,v_id,v_expected); perform public.cancel_sale(p_business_id,v_id,coalesce(nullif(v_payload->>'reason',''),'Cancelada pelo usuário'));
   when 'archive_product' then perform private.assert_nat_version('product',p_business_id,v_id,v_expected); perform public.archive_product(p_business_id,v_id);
   when 'delete_supply' then perform private.assert_nat_version('supply',p_business_id,v_id,v_expected); perform public.delete_supply(p_business_id,v_id);
   when 'delete_sporadic_expense' then perform private.assert_nat_version('expense',p_business_id,v_id,v_expected); perform public.delete_sporadic_expense(p_business_id,v_id);
   when 'save_supply' then perform private.assert_nat_version('supply',p_business_id,v_id,v_expected); perform public.save_supply(p_business_id,v_id,v_payload->>'name',v_payload->>'category',(v_payload->>'packageQuantity')::numeric,v_payload->>'packageUnit',(v_payload->>'packagePrice')::numeric,(v_payload->>'purchasedAt')::date);
   when 'save_product' then perform private.assert_nat_version('product',p_business_id,v_id,v_expected); perform public.save_product_v2(p_business_id,v_id,v_payload->>'name',(v_payload->>'batchYield')::numeric,(v_payload->>'sellingPrice')::numeric,(v_payload->>'lossPercent')::numeric,coalesce((v_payload->>'laborCostPerBatch')::numeric,0),(v_payload->>'productionCostPerBatch')::numeric,(v_payload->>'minimumMarginPercent')::numeric,(v_payload->>'targetMarginPercent')::numeric,coalesce(v_payload->'recipe','[]'::jsonb),nullif(v_payload->>'portfolioKey',''));
   when 'save_sale_items' then perform private.assert_nat_version('sale',p_business_id,v_id,v_expected); perform public.save_sale_items_v2(p_business_id,v_id,coalesce(v_payload->'items','[]'::jsonb),(v_payload->>'totalReceived')::numeric,v_payload->>'paymentMethod',(v_payload->>'soldAt')::timestamptz,nullif(v_payload->>'customerId','')::uuid,coalesce(nullif(v_payload->>'transactionType',''),'sale'));
   when 'save_sporadic_expense' then perform private.assert_nat_version('expense',p_business_id,v_id,v_expected); perform public.save_sporadic_expense(p_business_id,v_id,v_payload->>'name',(v_payload->>'amount')::numeric,(v_payload->>'spentAt')::date);
   else raise exception 'Operação não suportada: %.',coalesce(v_type,'(vazia)') using errcode='22023';
  end case;
 end loop;
end;
$$;

-- CRM snapshot used by the frontend without widening generated Supabase types by hand.
create or replace function public.get_customers_snapshot(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',c.id,'name',c.name,'phone',c.phone,'instagram',c.instagram,'source',c.source,
    'marketingConsent',c.marketing_consent,'notes',c.notes,'active',c.active,
    'createdAt',c.created_at,'updatedAt',c.updated_at
  ) order by c.name) from public.customers c where c.business_id=p_business_id),'[]'::jsonb);
end;
$$;
revoke all on function public.get_customers_snapshot(uuid) from public,anon;
grant execute on function public.get_customers_snapshot(uuid) to authenticated,service_role;

-- Backfill real first-day customers and transactions without inventing contact data.
with b as (select business_id from public.business_settings limit 1), ins as (
  insert into public.customers(business_id,name) select b.business_id,v.name from b cross join (values('Maria'),('Manu'),('Pedrosa')) v(name)
  where not exists(select 1 from public.customers c where c.business_id=b.business_id and lower(c.name)=lower(v.name))
  returning id,business_id,name
)
select 1;

update public.sales s set customer_id=(select c.id from public.customers c where c.business_id=s.business_id and c.name='Maria' limit 1),transaction_type='sale'
where s.id='af80e1e2-1444-4398-a6ed-b08e2b0f18a3';
update public.sales s set customer_id=(select c.id from public.customers c where c.business_id=s.business_id and c.name='Manu' limit 1),transaction_type='sale'
where s.id='03bc1401-53fc-401b-a18f-aa7cf8d0d2d5';
update public.sales s set customer_id=(select c.id from public.customers c where c.business_id=s.business_id and c.name='Pedrosa' limit 1),transaction_type='courtesy',total_received=0,variable_fee_snapshot=0
where s.id='ad45f4a1-983c-4963-bf7a-53745720eeca';

commit;

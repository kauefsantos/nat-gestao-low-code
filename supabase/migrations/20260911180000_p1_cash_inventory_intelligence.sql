begin;

-- P1: owner cash movements, payment-method fees, physical-loss inventory rules,
-- packaging at dispatch, frozen production costing and FIFO product-cost layers.

create table if not exists public.owner_cash_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  movement_type text not null check (movement_type in ('contribution','withdrawal')),
  amount numeric(14,2) not null check (amount > 0),
  occurred_at date not null default current_date,
  note text check (note is null or char_length(btrim(note)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id,id)
);
create index if not exists owner_cash_movements_business_date_idx on public.owner_cash_movements(business_id,occurred_at desc,created_at desc);
alter table public.owner_cash_movements enable row level security;
revoke all on public.owner_cash_movements from public,anon,authenticated;
grant select on public.owner_cash_movements to authenticated;
grant all on public.owner_cash_movements to service_role;
drop policy if exists owner_cash_movements_select on public.owner_cash_movements;
create policy owner_cash_movements_select on public.owner_cash_movements for select to authenticated using (private.is_business_member(business_id));
drop trigger if exists owner_cash_movements_touch_updated_at on public.owner_cash_movements;
create trigger owner_cash_movements_touch_updated_at before update on public.owner_cash_movements for each row execute function private.set_updated_at();
drop trigger if exists owner_cash_movements_audit on public.owner_cash_movements;
create trigger owner_cash_movements_audit after insert or update or delete on public.owner_cash_movements for each row execute function private.audit_row_change();

alter table public.business_settings add column if not exists pix_fee_percent numeric(8,4) not null default 0 check (pix_fee_percent between 0 and 100);
alter table public.business_settings add column if not exists cash_fee_percent numeric(8,4) not null default 0 check (cash_fee_percent between 0 and 100);
alter table public.business_settings add column if not exists card_fee_percent numeric(8,4) not null default 0 check (card_fee_percent between 0 and 100);
update public.business_settings
set pix_fee_percent=coalesce(pix_fee_percent,payment_fee_percent,0),
    cash_fee_percent=coalesce(cash_fee_percent,payment_fee_percent,0),
    card_fee_percent=coalesce(card_fee_percent,payment_fee_percent,0);

alter table public.inventory_productions add column if not exists ingredient_cost_snapshot numeric(14,4) not null default 0 check (ingredient_cost_snapshot >= 0);
alter table public.inventory_productions add column if not exists packaging_cost_snapshot numeric(14,4) not null default 0 check (packaging_cost_snapshot >= 0);
alter table public.inventory_productions add column if not exists labor_cost_snapshot numeric(14,4) not null default 0 check (labor_cost_snapshot >= 0);
alter table public.inventory_productions add column if not exists production_overhead_snapshot numeric(14,4) not null default 0 check (production_overhead_snapshot >= 0);
alter table public.inventory_productions add column if not exists total_batch_cost_snapshot numeric(14,4) not null default 0 check (total_batch_cost_snapshot >= 0);
alter table public.inventory_productions add column if not exists unit_cost_snapshot numeric(14,6) not null default 0 check (unit_cost_snapshot >= 0);

create table if not exists public.inventory_product_cost_layers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null,
  production_id uuid,
  source_key text not null,
  units_original numeric(14,4) not null check (units_original > 0),
  units_remaining numeric(14,4) not null check (units_remaining >= 0 and units_remaining <= units_original),
  unit_cost_snapshot numeric(14,6) not null check (unit_cost_snapshot >= 0),
  produced_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (business_id,source_key),
  foreign key (business_id,product_id) references public.products(business_id,id) on delete restrict,
  foreign key (production_id) references public.inventory_productions(id) on delete restrict
);
create index if not exists inventory_product_cost_layers_fifo_idx on public.inventory_product_cost_layers(business_id,product_id,produced_at,id) where units_remaining > 0;
alter table public.inventory_product_cost_layers enable row level security;
revoke all on public.inventory_product_cost_layers from public,anon,authenticated;
grant select on public.inventory_product_cost_layers to authenticated;
grant all on public.inventory_product_cost_layers to service_role;
drop policy if exists inventory_product_cost_layers_select on public.inventory_product_cost_layers;
create policy inventory_product_cost_layers_select on public.inventory_product_cost_layers for select to authenticated using (private.is_business_member(business_id));
drop trigger if exists inventory_product_cost_layers_audit on public.inventory_product_cost_layers;
create trigger inventory_product_cost_layers_audit after insert or update or delete on public.inventory_product_cost_layers for each row execute function private.audit_row_change();

create table if not exists public.inventory_sale_cost_allocations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  sale_item_id uuid not null,
  cost_layer_id uuid not null,
  quantity numeric(14,4) not null check (quantity > 0),
  unit_cost_snapshot numeric(14,6) not null check (unit_cost_snapshot >= 0),
  created_at timestamptz not null default now(),
  unique (business_id,sale_item_id,cost_layer_id),
  foreign key (business_id,sale_item_id) references public.sale_items(business_id,id) on delete restrict,
  foreign key (cost_layer_id) references public.inventory_product_cost_layers(id) on delete restrict
);
create index if not exists inventory_sale_cost_allocations_sale_idx on public.inventory_sale_cost_allocations(business_id,sale_item_id);
alter table public.inventory_sale_cost_allocations enable row level security;
revoke all on public.inventory_sale_cost_allocations from public,anon,authenticated;
grant select on public.inventory_sale_cost_allocations to authenticated;
grant all on public.inventory_sale_cost_allocations to service_role;
drop policy if exists inventory_sale_cost_allocations_select on public.inventory_sale_cost_allocations;
create policy inventory_sale_cost_allocations_select on public.inventory_sale_cost_allocations for select to authenticated using (private.is_business_member(business_id));

create or replace function private.payment_fee_for_method(p_business_id uuid,p_method text)
returns numeric
language sql
stable
security definer
set search_path=''
as $$
  select case p_method
    when 'pix' then coalesce(s.pix_fee_percent,0)
    when 'cash' then coalesce(s.cash_fee_percent,0)
    when 'card' then coalesce(s.card_fee_percent,0)
    else coalesce(s.payment_fee_percent,0)
  end
  from public.business_settings s
  where s.business_id=p_business_id;
$$;
revoke all on function private.payment_fee_for_method(uuid,text) from public,anon,authenticated;

create or replace function private.maximum_payment_fee(p_business_id uuid)
returns numeric
language sql
stable
security definer
set search_path=''
as $$
  select greatest(coalesce(pix_fee_percent,0),coalesce(cash_fee_percent,0),coalesce(card_fee_percent,0),coalesce(payment_fee_percent,0))
  from public.business_settings where business_id=p_business_id;
$$;
revoke all on function private.maximum_payment_fee(uuid) from public,anon,authenticated;

create or replace function private.validate_product_margin()
returns trigger
language plpgsql
set search_path=''
as $$
declare v_fee numeric:=0;
begin
  select greatest(coalesce(pix_fee_percent,0),coalesce(cash_fee_percent,0),coalesce(card_fee_percent,0),coalesce(payment_fee_percent,0))
    into v_fee from public.business_settings where business_id=new.business_id;
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

create or replace function private.product_material_cost_at_date(
  p_business_id uuid,p_product_id uuid,p_cost_date date,p_include_packaging boolean
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
  v_purchase record;
  v_package_base numeric;
  v_usage_base numeric;
  v_cost numeric:=0;
  v_line numeric;
begin
  select * into v_product from public.products where business_id=p_business_id and id=p_product_id and active=true;
  if not found then raise exception 'Produto não encontrado ou inativo.' using errcode='22023'; end if;
  for v_item in
    select ri.supply_id,ri.quantity,ri.unit,s.category
    from public.recipe_items ri
    join public.supplies s on s.business_id=ri.business_id and s.id=ri.supply_id
    where ri.business_id=p_business_id and ri.product_id=p_product_id
      and ((p_include_packaging and s.category='packaging') or (not p_include_packaging and s.category<>'packaging'))
  loop
    select sp.package_quantity,sp.package_unit,sp.package_price into v_purchase
    from public.supply_purchases sp
    where sp.business_id=p_business_id and sp.supply_id=v_item.supply_id and sp.purchased_at<=p_cost_date
    order by sp.purchased_at desc,sp.created_at desc limit 1;
    if not found then raise exception 'Não há compra válida do insumo na data informada.' using errcode='22023'; end if;
    if private.unit_dimension(v_item.unit) is null or private.unit_dimension(v_item.unit)<>private.unit_dimension(v_purchase.package_unit) then
      raise exception 'A receita contém unidade incompatível.' using errcode='22023';
    end if;
    v_package_base:=private.unit_base_amount(v_purchase.package_quantity,v_purchase.package_unit);
    v_usage_base:=private.unit_base_amount(v_item.quantity,v_item.unit);
    if v_package_base is null or v_package_base<=0 or v_usage_base is null or v_usage_base<=0 then raise exception 'Quantidade inválida na receita.' using errcode='22023'; end if;
    v_line:=(v_purchase.package_price/v_package_base)*v_usage_base;
    if not p_include_packaging and v_item.category='ingredient' then v_line:=v_line*(1+v_product.loss_percent/100); end if;
    v_cost:=v_cost+v_line;
  end loop;
  return v_cost;
end;
$$;
revoke all on function private.product_material_cost_at_date(uuid,uuid,date,boolean) from public,anon,authenticated;

create or replace function private.product_production_unit_cost_at_date(p_business_id uuid,p_product_id uuid,p_cost_date date)
returns numeric
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_product public.products%rowtype; v_material numeric;
begin
  select * into v_product from public.products where business_id=p_business_id and id=p_product_id and active=true;
  if not found or v_product.batch_yield<=0 then raise exception 'Produto inválido para custeio.' using errcode='22023'; end if;
  v_material:=private.product_material_cost_at_date(p_business_id,p_product_id,p_cost_date,false);
  return (v_material+v_product.labor_cost_per_batch+v_product.production_cost_per_batch)/v_product.batch_yield;
end;
$$;
revoke all on function private.product_production_unit_cost_at_date(uuid,uuid,date) from public,anon,authenticated;

create or replace function private.product_packaging_unit_cost_at_date(p_business_id uuid,p_product_id uuid,p_cost_date date)
returns numeric
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_product public.products%rowtype; v_packaging numeric;
begin
  select * into v_product from public.products where business_id=p_business_id and id=p_product_id and active=true;
  if not found or v_product.batch_yield<=0 then raise exception 'Produto inválido para custeio.' using errcode='22023'; end if;
  v_packaging:=private.product_material_cost_at_date(p_business_id,p_product_id,p_cost_date,true);
  return v_packaging/v_product.batch_yield;
end;
$$;
revoke all on function private.product_packaging_unit_cost_at_date(uuid,uuid,date) from public,anon,authenticated;

create or replace function private.product_unit_cost_at_date(p_business_id uuid,p_product_id uuid,p_sale_date date)
returns numeric
language sql
stable
security definer
set search_path=''
as $$
  select private.product_production_unit_cost_at_date(p_business_id,p_product_id,p_sale_date)
       + private.product_packaging_unit_cost_at_date(p_business_id,p_product_id,p_sale_date);
$$;
revoke all on function private.product_unit_cost_at_date(uuid,uuid,date) from public,anon,authenticated;

create or replace function private.inventory_layer_available(p_business_id uuid,p_product_id uuid)
returns numeric
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(sum(units_remaining),0) from public.inventory_product_cost_layers
  where business_id=p_business_id and product_id=p_product_id and units_remaining>0;
$$;
revoke all on function private.inventory_layer_available(uuid,uuid) from public,anon,authenticated;

create or replace function private.inventory_fifo_unit_cost(p_business_id uuid,p_product_id uuid,p_quantity numeric)
returns numeric
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_layer record; v_left numeric:=p_quantity; v_take numeric; v_total numeric:=0;
begin
  if p_quantity is null or p_quantity<=0 then raise exception 'Quantidade inválida para custeio.' using errcode='22023'; end if;
  for v_layer in
    select units_remaining,unit_cost_snapshot from public.inventory_product_cost_layers
    where business_id=p_business_id and product_id=p_product_id and units_remaining>0
    order by produced_at,id
  loop
    exit when v_left<=0;
    v_take:=least(v_left,v_layer.units_remaining);
    v_total:=v_total+v_take*v_layer.unit_cost_snapshot;
    v_left:=v_left-v_take;
  end loop;
  if v_left>0 then raise exception 'Camadas de custo insuficientes para o estoque informado.' using errcode='22023'; end if;
  return v_total/p_quantity;
end;
$$;
revoke all on function private.inventory_fifo_unit_cost(uuid,uuid,numeric) from public,anon,authenticated;

create or replace function private.consume_inventory_cost_layers(
  p_business_id uuid,p_product_id uuid,p_sale_item_id uuid,p_quantity numeric
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_layer record; v_left numeric:=p_quantity; v_take numeric;
begin
  if private.inventory_layer_available(p_business_id,p_product_id)<p_quantity then return; end if;
  for v_layer in
    select * from public.inventory_product_cost_layers
    where business_id=p_business_id and product_id=p_product_id and units_remaining>0
    order by produced_at,id for update
  loop
    exit when v_left<=0;
    v_take:=least(v_left,v_layer.units_remaining);
    update public.inventory_product_cost_layers set units_remaining=units_remaining-v_take where id=v_layer.id;
    insert into public.inventory_sale_cost_allocations(business_id,sale_item_id,cost_layer_id,quantity,unit_cost_snapshot)
    values(p_business_id,p_sale_item_id,v_layer.id,v_take,v_layer.unit_cost_snapshot)
    on conflict (business_id,sale_item_id,cost_layer_id) do nothing;
    v_left:=v_left-v_take;
  end loop;
end;
$$;
revoke all on function private.consume_inventory_cost_layers(uuid,uuid,uuid,numeric) from public,anon,authenticated;

create or replace function private.restore_inventory_cost_layers(p_business_id uuid,p_sale_item_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_alloc record;
begin
  for v_alloc in select * from public.inventory_sale_cost_allocations where business_id=p_business_id and sale_item_id=p_sale_item_id loop
    update public.inventory_product_cost_layers set units_remaining=least(units_original,units_remaining+v_alloc.quantity) where id=v_alloc.cost_layer_id;
  end loop;
end;
$$;
revoke all on function private.restore_inventory_cost_layers(uuid,uuid) from public,anon,authenticated;

create or replace function private.product_unit_cost_for_sale(p_business_id uuid,p_product_id uuid,p_quantity numeric,p_sale_date date)
returns numeric
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_production numeric; v_packaging numeric;
begin
  if exists(select 1 from public.inventory_tracking where business_id=p_business_id and product_id=p_product_id)
     and private.inventory_layer_available(p_business_id,p_product_id)>=p_quantity then
    v_production:=private.inventory_fifo_unit_cost(p_business_id,p_product_id,p_quantity);
  else
    v_production:=private.product_production_unit_cost_at_date(p_business_id,p_product_id,p_sale_date);
  end if;
  v_packaging:=private.product_packaging_unit_cost_at_date(p_business_id,p_product_id,p_sale_date);
  return v_production+v_packaging;
end;
$$;
revoke all on function private.product_unit_cost_for_sale(uuid,uuid,numeric,date) from public,anon,authenticated;

create or replace function public.save_owner_cash_movement(
  p_business_id uuid,p_id uuid,p_movement_type text,p_amount numeric,p_occurred_at date,p_note text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_id is null or p_movement_type not in ('contribution','withdrawal') or p_amount is null or p_amount<=0 or p_occurred_at is null then
    raise exception 'Dados do movimento de caixa inválidos.' using errcode='22023';
  end if;
  insert into public.owner_cash_movements(id,business_id,movement_type,amount,occurred_at,note)
  values(p_id,p_business_id,p_movement_type,p_amount,p_occurred_at,nullif(left(btrim(coalesce(p_note,'')),500),''))
  on conflict(id) do update set movement_type=excluded.movement_type,amount=excluded.amount,occurred_at=excluded.occurred_at,note=excluded.note,updated_at=now()
  where public.owner_cash_movements.business_id=p_business_id;
  if not exists(select 1 from public.owner_cash_movements where business_id=p_business_id and id=p_id) then raise exception 'Movimento pertence a outra empresa.' using errcode='42501'; end if;
end;
$$;
revoke all on function public.save_owner_cash_movement(uuid,uuid,text,numeric,date,text) from public,anon;
grant execute on function public.save_owner_cash_movement(uuid,uuid,text,numeric,date,text) to authenticated,service_role;

create or replace function public.delete_owner_cash_movement(p_business_id uuid,p_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  delete from public.owner_cash_movements where business_id=p_business_id and id=p_id;
end;
$$;
revoke all on function public.delete_owner_cash_movement(uuid,uuid) from public,anon;
grant execute on function public.delete_owner_cash_movement(uuid,uuid) to authenticated,service_role;

create or replace function public.get_owner_cash_movements_snapshot(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',m.id,'movementType',m.movement_type,'amount',m.amount,'occurredAt',m.occurred_at,'note',m.note,
    'createdAt',m.created_at,'updatedAt',m.updated_at
  ) order by m.occurred_at desc,m.created_at desc) from public.owner_cash_movements m where m.business_id=p_business_id),'[]'::jsonb);
end;
$$;
revoke all on function public.get_owner_cash_movements_snapshot(uuid) from public,anon;
grant execute on function public.get_owner_cash_movements_snapshot(uuid) to authenticated,service_role;

create or replace function public.save_business_settings_v3(
  p_business_id uuid,p_owner_name text,p_monthly_fixed_costs numeric,p_payment_fee_percent numeric,
  p_pix_fee_percent numeric,p_cash_fee_percent numeric,p_card_fee_percent numeric,
  p_default_minimum_margin_percent numeric,p_default_target_margin_percent numeric,
  p_owner_hourly_rate numeric,p_owner_daily_hours numeric
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_max_fee numeric;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_pix_fee_percent not between 0 and 100 or p_cash_fee_percent not between 0 and 100 or p_card_fee_percent not between 0 and 100 then raise exception 'Taxas por pagamento inválidas.' using errcode='22023'; end if;
  if p_default_target_margin_percent<p_default_minimum_margin_percent then raise exception 'A margem recomendada não pode ser menor que a margem mínima.' using errcode='22023'; end if;
  v_max_fee:=greatest(p_pix_fee_percent,p_cash_fee_percent,p_card_fee_percent,coalesce(p_payment_fee_percent,0));
  if p_default_minimum_margin_percent+v_max_fee>=100 or p_default_target_margin_percent+v_max_fee>=100 then raise exception 'Margem e taxa somadas precisam ser menores que 100%%.' using errcode='22023'; end if;
  if p_owner_hourly_rate<0 or p_owner_daily_hours<0 or p_owner_daily_hours>24 then raise exception 'Referência de trabalho inválida.' using errcode='22023'; end if;
  perform public.save_business_settings(p_business_id,p_owner_name,p_monthly_fixed_costs,v_max_fee,p_default_minimum_margin_percent,p_default_target_margin_percent);
  update public.business_settings set pix_fee_percent=p_pix_fee_percent,cash_fee_percent=p_cash_fee_percent,card_fee_percent=p_card_fee_percent,
    owner_hourly_rate=p_owner_hourly_rate,owner_daily_hours=p_owner_daily_hours,updated_at=now()
  where business_id=p_business_id;
end;
$$;

-- Production consumes ingredients/other consumables only. Packaging is dispatched when a movement leaves stock.
create or replace function public.record_inventory_production(
  p_business_id uuid,p_product_id uuid,p_batches numeric,p_produced_at timestamptz,p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_product public.products%rowtype; v_item record; v_units numeric; v_balance numeric; v_production_id uuid:=gen_random_uuid();
  v_note text:=nullif(left(btrim(coalesce(p_note,'')),500),''); v_material numeric; v_labor numeric; v_overhead numeric; v_total numeric; v_unit numeric;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_batches is null or p_batches<=0 or p_produced_at is null then raise exception 'Informe uma quantidade de produção maior que zero.' using errcode='22023'; end if;
  select * into v_product from public.products where business_id=p_business_id and id=p_product_id and active=true;
  if not found or v_product.batch_yield<=0 then raise exception 'Produto não encontrado ou inválido.' using errcode='22023'; end if;
  if not exists(select 1 from public.inventory_tracking where business_id=p_business_id and product_id=p_product_id) then raise exception 'Defina primeiro o saldo inicial deste produto no Estoque.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':product:'||p_product_id::text,0));
  v_units:=v_product.batch_yield*p_batches;

  for v_item in
    select r.supply_id,t.base_unit,s.category,
      sum(private.unit_base_amount(r.quantity,r.unit) * case when s.category='ingredient' then (1+v_product.loss_percent/100) else 1 end)*p_batches as required_quantity
    from public.recipe_items r
    join public.supplies s on s.business_id=r.business_id and s.id=r.supply_id and s.category<>'packaging'
    join public.inventory_tracking t on t.business_id=r.business_id and t.supply_id=r.supply_id
    where r.business_id=p_business_id and r.product_id=p_product_id
    group by r.supply_id,t.base_unit,s.category
    order by r.supply_id
  loop
    if v_item.required_quantity is null or v_item.required_quantity<=0 then raise exception 'Quantidade inválida na receita.' using errcode='22023'; end if;
    perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':supply:'||v_item.supply_id::text,0));
    v_balance:=private.inventory_balance(p_business_id,'supply',v_item.supply_id);
    if v_balance<v_item.required_quantity then raise exception 'Estoque insuficiente de insumo para esta produção.' using errcode='22023'; end if;
  end loop;

  v_material:=private.product_material_cost_at_date(p_business_id,p_product_id,(p_produced_at at time zone 'America/Sao_Paulo')::date,false)*p_batches;
  v_labor:=v_product.labor_cost_per_batch*p_batches;
  v_overhead:=v_product.production_cost_per_batch*p_batches;
  v_total:=v_material+v_labor+v_overhead;
  v_unit:=v_total/v_units;

  insert into public.inventory_productions(id,business_id,product_id,batches,units_produced,produced_at,note,created_by,
    ingredient_cost_snapshot,packaging_cost_snapshot,labor_cost_snapshot,production_overhead_snapshot,total_batch_cost_snapshot,unit_cost_snapshot)
  values(v_production_id,p_business_id,p_product_id,p_batches,v_units,p_produced_at,v_note,auth.uid(),
    v_material,0,v_labor,v_overhead,v_total,v_unit);

  for v_item in
    select r.supply_id,t.base_unit,s.category,
      sum(private.unit_base_amount(r.quantity,r.unit) * case when s.category='ingredient' then (1+v_product.loss_percent/100) else 1 end)*p_batches as required_quantity
    from public.recipe_items r
    join public.supplies s on s.business_id=r.business_id and s.id=r.supply_id and s.category<>'packaging'
    join public.inventory_tracking t on t.business_id=r.business_id and t.supply_id=r.supply_id
    where r.business_id=p_business_id and r.product_id=p_product_id
    group by r.supply_id,t.base_unit,s.category
    order by r.supply_id
  loop
    insert into public.inventory_movements(business_id,supply_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at,created_by)
    values(p_business_id,v_item.supply_id,-v_item.required_quantity,v_item.base_unit,'production_out',
      'production:'||v_production_id::text||':supply:'||v_item.supply_id::text,'Consumo na produção de '||v_product.name,p_produced_at,auth.uid());
  end loop;

  insert into public.inventory_movements(business_id,product_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at,created_by)
  values(p_business_id,p_product_id,v_units,'unit','production_in','production:'||v_production_id::text||':product:'||p_product_id::text,coalesce(v_note,'Produção registrada'),p_produced_at,auth.uid());
  insert into public.inventory_product_cost_layers(business_id,product_id,production_id,source_key,units_original,units_remaining,unit_cost_snapshot,produced_at)
  values(p_business_id,p_product_id,v_production_id,'production:'||v_production_id::text,v_units,v_units,v_unit,p_produced_at);
  return v_production_id;
end;
$$;

-- Dispatch finished goods and tracked packaging for every outgoing movement.
create or replace function private.inventory_after_sale_item()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_tracking public.inventory_tracking%rowtype; v_balance numeric; v_pack record; v_sale public.sales%rowtype; v_required numeric;
begin
  select * into v_sale from public.sales where business_id=new.business_id and id=new.sale_id;
  select * into v_tracking from public.inventory_tracking where business_id=new.business_id and product_id=new.product_id;
  if found then
    perform pg_advisory_xact_lock(hashtextextended(new.business_id::text||':product:'||new.product_id::text,0));
    v_balance:=private.inventory_balance(new.business_id,'product',new.product_id);
    if v_balance<new.quantity then raise exception 'Estoque insuficiente do produto acabado para concluir a movimentação.' using errcode='22023'; end if;
    insert into public.inventory_movements(business_id,product_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at,created_by)
    values(new.business_id,new.product_id,-new.quantity,'unit','sale','sale:'||new.id::text,'Saída: '||coalesce(v_sale.transaction_type,'sale'),v_sale.sold_at,auth.uid())
    on conflict (business_id,source_key) where source_key is not null do nothing;
  end if;

  for v_pack in
    select r.supply_id,t.base_unit,sum(private.unit_base_amount(r.quantity,r.unit)/p.batch_yield*new.quantity) as required_quantity
    from public.recipe_items r
    join public.supplies s on s.business_id=r.business_id and s.id=r.supply_id and s.category='packaging'
    join public.inventory_tracking t on t.business_id=r.business_id and t.supply_id=r.supply_id
    join public.products p on p.business_id=r.business_id and p.id=r.product_id
    where r.business_id=new.business_id and r.product_id=new.product_id
    group by r.supply_id,t.base_unit
  loop
    v_required:=v_pack.required_quantity;
    perform pg_advisory_xact_lock(hashtextextended(new.business_id::text||':supply:'||v_pack.supply_id::text,0));
    v_balance:=private.inventory_balance(new.business_id,'supply',v_pack.supply_id);
    if v_balance<v_required then raise exception 'Estoque insuficiente de embalagem para concluir a movimentação.' using errcode='22023'; end if;
    insert into public.inventory_movements(business_id,supply_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at,created_by)
    values(new.business_id,v_pack.supply_id,-v_required,v_pack.base_unit,'sale','sale:'||new.id::text||':packaging:'||v_pack.supply_id::text,'Embalagem usada na saída',v_sale.sold_at,auth.uid())
    on conflict (business_id,source_key) where source_key is not null do nothing;
  end loop;
  return new;
end;
$$;
revoke all on function private.inventory_after_sale_item() from public,anon,authenticated;

create or replace function private.inventory_after_sale_cancel()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_item record; v_move record;
begin
  if old.status='completed' and new.status='cancelled' then
    for v_item in select si.* from public.sale_items si where si.business_id=new.business_id and si.sale_id=new.id loop
      for v_move in select * from public.inventory_movements m where m.business_id=new.business_id and m.movement_type='sale' and m.source_key like 'sale:'||v_item.id::text||'%' loop
        if v_move.product_id is not null then perform pg_advisory_xact_lock(hashtextextended(new.business_id::text||':product:'||v_move.product_id::text,0));
        else perform pg_advisory_xact_lock(hashtextextended(new.business_id::text||':supply:'||v_move.supply_id::text,0)); end if;
        insert into public.inventory_movements(business_id,supply_id,product_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at,created_by)
        values(new.business_id,v_move.supply_id,v_move.product_id,-v_move.quantity_delta,v_move.base_unit,'sale_cancel','sale-cancel:'||v_move.id::text,'Estorno por cancelamento',now(),auth.uid())
        on conflict (business_id,source_key) where source_key is not null do nothing;
      end loop;
      perform private.restore_inventory_cost_layers(new.business_id,v_item.id);
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function private.inventory_after_sale_cancel() from public,anon,authenticated;

create or replace function public.save_sale_items_v3(
  p_business_id uuid,p_id uuid,p_items jsonb,p_total_received numeric,p_payment_method text,p_sold_at timestamptz,
  p_customer_id uuid default null,p_transaction_type text default 'sale'
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_item jsonb; v_line jsonb; v_product public.products%rowtype; v_product_id uuid; v_quantity numeric; v_sale_item_id uuid;
  v_unit_cost numeric; v_unit_labor numeric; v_line_list numeric; v_line_revenue numeric; v_total_list numeric:=0; v_total_quantity numeric:=0; v_total_cost numeric:=0;
  v_fee_percent numeric:=0; v_variable_fee numeric; v_contribution numeric; v_sale_date date; v_seen uuid[]:=array[]::uuid[]; v_lines jsonb:='[]'::jsonb; v_use_layers boolean;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_transaction_type not in('sale','courtesy','personal_consumption','loss') then raise exception 'Tipo de movimentação inválido.' using errcode='22023'; end if;
  if p_transaction_type<>'sale' and coalesce(p_total_received,0)<>0 then raise exception 'Movimentações sem venda precisam ter valor recebido igual a zero.' using errcode='22023'; end if;
  if p_customer_id is not null and not exists(select 1 from public.customers where business_id=p_business_id and id=p_customer_id and active=true) then raise exception 'Cliente não encontrado ou inativo.' using errcode='22023'; end if;
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
    v_use_layers:=exists(select 1 from public.inventory_tracking where business_id=p_business_id and product_id=v_product_id) and private.inventory_layer_available(p_business_id,v_product_id)>=v_quantity;
    v_unit_cost:=private.product_unit_cost_for_sale(p_business_id,v_product_id,v_quantity,v_sale_date);
    v_unit_labor:=v_product.labor_cost_per_batch/v_product.batch_yield;
    v_line_list:=v_product.selling_price*v_quantity;
    v_total_list:=v_total_list+v_line_list; v_total_quantity:=v_total_quantity+v_quantity; v_total_cost:=v_total_cost+(v_unit_cost*v_quantity);
    v_lines:=v_lines||jsonb_build_array(jsonb_build_object('productId',v_product.id,'productName',v_product.name,'portfolioKey',v_product.portfolio_key,'quantity',v_quantity,'unitCost',v_unit_cost,'unitLabor',v_unit_labor,'listTotal',v_line_list,'useLayers',v_use_layers));
  end loop;
  v_fee_percent:=coalesce(private.payment_fee_for_method(p_business_id,p_payment_method),0);
  v_variable_fee:=case when p_transaction_type='sale' then p_total_received*v_fee_percent/100 else 0 end;
  v_contribution:=case when p_transaction_type='sale' then p_total_received else 0 end-v_total_cost-v_variable_fee;
  insert into public.sales(id,business_id,sold_at,total_received,payment_method,variable_fee_snapshot,contribution_snapshot,status,customer_id,transaction_type)
  values(p_id,p_business_id,p_sold_at,p_total_received,p_payment_method,v_variable_fee,v_contribution,'completed',p_customer_id,p_transaction_type);
  for v_line in select value from jsonb_array_elements(v_lines) loop
    if p_transaction_type='sale' then
      if v_total_list>0 then v_line_revenue:=p_total_received*((v_line->>'listTotal')::numeric/v_total_list); else v_line_revenue:=p_total_received*((v_line->>'quantity')::numeric/v_total_quantity); end if;
    else v_line_revenue:=0; end if;
    v_sale_item_id:=gen_random_uuid();
    insert into public.sale_items(id,business_id,sale_id,product_id,product_name_snapshot,portfolio_key_snapshot,quantity,unit_cost_snapshot,labor_cost_snapshot,unit_price_snapshot)
    values(v_sale_item_id,p_business_id,p_id,(v_line->>'productId')::uuid,v_line->>'productName',nullif(v_line->>'portfolioKey',''),(v_line->>'quantity')::numeric,(v_line->>'unitCost')::numeric,(v_line->>'unitLabor')::numeric,v_line_revenue/(v_line->>'quantity')::numeric);
    if coalesce((v_line->>'useLayers')::boolean,false) then
      perform private.consume_inventory_cost_layers(p_business_id,(v_line->>'productId')::uuid,v_sale_item_id,(v_line->>'quantity')::numeric);
    end if;
  end loop;
end;
$$;

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
    perform public.save_business_settings_v3(p_business_id,v_payload->>'ownerName',(v_payload->>'monthlyFixedCosts')::numeric,coalesce((v_payload->>'paymentFeePercent')::numeric,0),coalesce((v_payload->>'pixFeePercent')::numeric,0),coalesce((v_payload->>'cashFeePercent')::numeric,0),coalesce((v_payload->>'cardFeePercent')::numeric,0),(v_payload->>'defaultMinimumMarginPercent')::numeric,(v_payload->>'defaultTargetMarginPercent')::numeric,coalesce((v_payload->>'ownerHourlyRate')::numeric,20),coalesce((v_payload->>'ownerDailyHours')::numeric,3)); continue;
  elsif v_type='save_customer' then
    perform public.save_customer(p_business_id,(v_payload->>'id')::uuid,v_payload->>'name',v_payload->>'phone',v_payload->>'instagram',v_payload->>'source',coalesce((v_payload->>'marketingConsent')::boolean,false),v_payload->>'notes',coalesce((v_payload->>'active')::boolean,true)); continue;
  end if;
  begin v_id:=(v_payload->>'id')::uuid; exception when others then raise exception 'Identificador inválido em %.',coalesce(v_type,'operação') using errcode='22023'; end;
  case v_type
   when 'cancel_sale' then perform private.assert_nat_version('sale',p_business_id,v_id,v_expected); perform public.cancel_sale(p_business_id,v_id,coalesce(nullif(v_payload->>'reason',''),'Cancelada pelo usuário'));
   when 'archive_product' then perform private.assert_nat_version('product',p_business_id,v_id,v_expected); perform public.archive_product(p_business_id,v_id);
   when 'delete_supply' then perform private.assert_nat_version('supply',p_business_id,v_id,v_expected); perform public.delete_supply(p_business_id,v_id);
   when 'delete_sporadic_expense' then perform private.assert_nat_version('expense',p_business_id,v_id,v_expected); perform public.delete_sporadic_expense(p_business_id,v_id);
   when 'delete_owner_cash_movement' then perform public.delete_owner_cash_movement(p_business_id,v_id);
   when 'save_owner_cash_movement' then perform public.save_owner_cash_movement(p_business_id,v_id,v_payload->>'movementType',(v_payload->>'amount')::numeric,(v_payload->>'occurredAt')::date,v_payload->>'note');
   when 'save_supply' then perform private.assert_nat_version('supply',p_business_id,v_id,v_expected); perform public.save_supply(p_business_id,v_id,v_payload->>'name',v_payload->>'category',(v_payload->>'packageQuantity')::numeric,v_payload->>'packageUnit',(v_payload->>'packagePrice')::numeric,(v_payload->>'purchasedAt')::date);
   when 'save_product' then perform private.assert_nat_version('product',p_business_id,v_id,v_expected); perform public.save_product_v2(p_business_id,v_id,v_payload->>'name',(v_payload->>'batchYield')::numeric,(v_payload->>'sellingPrice')::numeric,(v_payload->>'lossPercent')::numeric,coalesce((v_payload->>'laborCostPerBatch')::numeric,0),(v_payload->>'productionCostPerBatch')::numeric,(v_payload->>'minimumMarginPercent')::numeric,(v_payload->>'targetMarginPercent')::numeric,coalesce(v_payload->'recipe','[]'::jsonb),nullif(v_payload->>'portfolioKey',''));
   when 'save_sale_items' then perform private.assert_nat_version('sale',p_business_id,v_id,v_expected); perform public.save_sale_items_v3(p_business_id,v_id,coalesce(v_payload->'items','[]'::jsonb),(v_payload->>'totalReceived')::numeric,v_payload->>'paymentMethod',(v_payload->>'soldAt')::timestamptz,nullif(v_payload->>'customerId','')::uuid,coalesce(nullif(v_payload->>'transactionType',''),'sale'));
   when 'save_sporadic_expense' then perform private.assert_nat_version('expense',p_business_id,v_id,v_expected); perform public.save_sporadic_expense(p_business_id,v_id,v_payload->>'name',(v_payload->>'amount')::numeric,(v_payload->>'spentAt')::date);
   else raise exception 'Operação não suportada: %.',coalesce(v_type,'(vazia)') using errcode='22023';
  end case;
 end loop;
end;
$$;

revoke all on function public.get_owner_cash_movements_snapshot(uuid) from public,anon;
revoke all on function public.save_business_settings_v3(uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) from public,anon;
revoke all on function public.save_sale_items_v3(uuid,uuid,jsonb,numeric,text,timestamptz,uuid,text) from public,anon;
grant execute on function public.save_business_settings_v3(uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) to authenticated,service_role;
grant execute on function public.save_sale_items_v3(uuid,uuid,jsonb,numeric,text,timestamptz,uuid,text) to authenticated,service_role;

commit;

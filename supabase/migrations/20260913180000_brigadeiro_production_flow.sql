begin;

update private.nat_schema_release
set version='2026-09-13.brigadeiro-production-flow.1', applied_at=now()
where singleton=true;

alter table public.sales
  add column if not exists packaging_format text,
  add column if not exists packaging_cost_snapshot numeric not null default 0;

alter table public.sales drop constraint if exists sales_packaging_format_check;
alter table public.sales add constraint sales_packaging_format_check
  check (packaging_format is null or packaging_format in ('unit','quartet'));
alter table public.sales drop constraint if exists sales_packaging_cost_snapshot_check;
alter table public.sales add constraint sales_packaging_cost_snapshot_check
  check (packaging_cost_snapshot>=0);

create table if not exists private.brigadeiro_mass_definitions(
  business_id uuid not null references public.businesses(id) on delete cascade,
  mass_key text not null,
  name text not null,
  mass_supply_id uuid not null,
  flavor_supply_id uuid not null,
  cream_supply_id uuid not null,
  yield_g numeric not null default 800 check(yield_g>0),
  condensed_g numeric not null default 396 check(condensed_g>0),
  cream_g numeric not null default 100 check(cream_g>0),
  flavor_g numeric not null default 46 check(flavor_g>0),
  available boolean not null default true,
  badge text,
  primary key(business_id,mass_key),
  unique(business_id,mass_supply_id),
  foreign key(business_id,mass_supply_id) references public.supplies(business_id,id) on delete restrict,
  foreign key(business_id,flavor_supply_id) references public.supplies(business_id,id) on delete restrict,
  foreign key(business_id,cream_supply_id) references public.supplies(business_id,id) on delete restrict
);

create table if not exists private.brigadeiro_condensed_milk_options(
  business_id uuid not null references public.businesses(id) on delete cascade,
  supply_id uuid not null,
  priority integer not null default 100,
  primary key(business_id,supply_id),
  foreign key(business_id,supply_id) references public.supplies(business_id,id) on delete restrict
);

create table if not exists private.brigadeiro_mass_productions(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  mass_key text not null,
  batches integer not null check(batches>0),
  grams_produced numeric not null check(grams_produced>0),
  ingredient_cost_snapshot numeric not null default 0 check(ingredient_cost_snapshot>=0),
  unit_cost_snapshot numeric not null default 0 check(unit_cost_snapshot>=0),
  produced_at timestamptz not null,
  note text,
  request_id uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(business_id,request_id),
  foreign key(business_id,mass_key) references private.brigadeiro_mass_definitions(business_id,mass_key) on delete restrict
);

create table if not exists private.brigadeiro_mass_cost_layers(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  mass_supply_id uuid not null,
  production_id uuid references private.brigadeiro_mass_productions(id) on delete set null,
  source_key text not null,
  grams_original numeric not null check(grams_original>0),
  grams_remaining numeric not null check(grams_remaining>=0 and grams_remaining<=grams_original),
  unit_cost_snapshot numeric not null check(unit_cost_snapshot>=0),
  produced_at timestamptz not null,
  note text,
  created_at timestamptz not null default now(),
  unique(business_id,source_key),
  foreign key(business_id,mass_supply_id) references public.supplies(business_id,id) on delete restrict
);

create table if not exists private.brigadeiro_packaging_profile(
  business_id uuid not null references public.businesses(id) on delete cascade,
  packaging_format text not null check(packaging_format in ('unit','quartet')),
  supply_id uuid not null,
  quantity_per_package numeric not null check(quantity_per_package>0),
  package_capacity integer not null check(package_capacity in (1,4)),
  primary key(business_id,packaging_format,supply_id),
  foreign key(business_id,supply_id) references public.supplies(business_id,id) on delete restrict
);

create or replace function private.inventory_supply_balance(p_business_id uuid,p_supply_id uuid)
returns numeric language sql stable security definer set search_path='' as $$
  select coalesce(sum(quantity_delta),0) from public.inventory_movements
  where business_id=p_business_id and supply_id=p_supply_id;
$$;

create or replace function private.supply_unit_cost_at_date(p_business_id uuid,p_supply_id uuid,p_cost_date date)
returns numeric language plpgsql stable security definer set search_path='' as $$
declare v_purchase record;v_base numeric;
begin
  select package_quantity,package_unit,package_price into v_purchase
  from public.supply_purchases
  where business_id=p_business_id and supply_id=p_supply_id and purchased_at<=p_cost_date
  order by purchased_at desc,created_at desc limit 1;
  if not found then raise exception 'Não há compra válida do insumo na data informada.' using errcode='22023'; end if;
  v_base:=private.unit_base_amount(v_purchase.package_quantity,v_purchase.package_unit);
  if v_base is null or v_base<=0 then raise exception 'Compra com unidade inválida.' using errcode='22023'; end if;
  return v_purchase.package_price/v_base;
end $$;

create or replace function private.mass_fifo_cost(p_business_id uuid,p_mass_supply_id uuid,p_grams numeric)
returns numeric language plpgsql stable security definer set search_path='' as $$
declare v_layer record;v_left numeric:=p_grams;v_take numeric;v_total numeric:=0;
begin
  if p_grams<=0 then return 0; end if;
  for v_layer in
    select grams_remaining,unit_cost_snapshot from private.brigadeiro_mass_cost_layers
    where business_id=p_business_id and mass_supply_id=p_mass_supply_id and grams_remaining>0
    order by produced_at,created_at,id
  loop
    exit when v_left<=0;
    v_take:=least(v_left,v_layer.grams_remaining);
    v_total:=v_total+v_take*v_layer.unit_cost_snapshot;
    v_left:=v_left-v_take;
  end loop;
  if v_left>0.0001 then raise exception 'Camada de custo insuficiente para a massa.' using errcode='22023'; end if;
  return v_total;
end $$;

create or replace function private.consume_mass_layers(p_business_id uuid,p_mass_supply_id uuid,p_grams numeric)
returns void language plpgsql security definer set search_path='' as $$
declare v_layer record;v_left numeric:=p_grams;v_take numeric;
begin
  for v_layer in
    select id,grams_remaining from private.brigadeiro_mass_cost_layers
    where business_id=p_business_id and mass_supply_id=p_mass_supply_id and grams_remaining>0
    order by produced_at,created_at,id for update
  loop
    exit when v_left<=0;
    v_take:=least(v_left,v_layer.grams_remaining);
    update private.brigadeiro_mass_cost_layers set grams_remaining=grams_remaining-v_take where id=v_layer.id;
    v_left:=v_left-v_take;
  end loop;
  if v_left>0.0001 then raise exception 'Camada de custo insuficiente para a massa.' using errcode='22023'; end if;
end $$;

create or replace function public.record_brigadeiro_mass_production_v1(
  p_business_id uuid,p_request_id uuid,p_mass_key text,p_batches integer,p_produced_at timestamptz,p_note text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_def private.brigadeiro_mass_definitions%rowtype;v_existing jsonb;v_production_id uuid:=gen_random_uuid();
  v_hash text;v_date date;v_condensed uuid;v_batch integer;v_total_cost numeric:=0;v_cost numeric;v_grams numeric;
  v_cream_need numeric;v_flavor_need numeric;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_request_id is null or p_batches is null or p_batches<=0 or p_batches>50 or p_produced_at is null then raise exception 'Produção de massa inválida.' using errcode='22023'; end if;
  select * into v_def from private.brigadeiro_mass_definitions where business_id=p_business_id and mass_key=p_mass_key;
  if not found then raise exception 'Massa não encontrada.' using errcode='22023'; end if;
  if not v_def.available then raise exception 'Esta massa ainda não está liberada para produção.' using errcode='22023'; end if;
  v_hash:=md5(p_mass_key||':'||p_batches::text||':'||p_produced_at::text||':'||coalesce(p_note,''));
  select result into v_existing from public.api_idempotency_requests where business_id=p_business_id and request_id=p_request_id and operation='brigadeiro_mass_production';
  if found then
    if (select request_hash from public.api_idempotency_requests where business_id=p_business_id and request_id=p_request_id and operation='brigadeiro_mass_production')<>v_hash then raise exception 'REQUEST_ID_REUSED_WITH_DIFFERENT_PAYLOAD' using errcode='22023'; end if;
    return (v_existing->>'productionId')::uuid;
  end if;
  insert into public.api_idempotency_requests(business_id,request_id,operation,request_hash) values(p_business_id,p_request_id,'brigadeiro_mass_production',v_hash);
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':supply:'||v_def.cream_supply_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':supply:'||v_def.flavor_supply_id::text,0));
  for v_condensed in select supply_id from private.brigadeiro_condensed_milk_options where business_id=p_business_id order by priority,supply_id loop
    perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':supply:'||v_condensed::text,0));
  end loop;
  v_cream_need:=v_def.cream_g*p_batches;v_flavor_need:=v_def.flavor_g*p_batches;
  if private.inventory_supply_balance(p_business_id,v_def.cream_supply_id)+0.0001<v_cream_need then raise exception 'Estoque insuficiente de creme de leite.' using errcode='22023'; end if;
  if private.inventory_supply_balance(p_business_id,v_def.flavor_supply_id)+0.0001<v_flavor_need then raise exception 'Estoque insuficiente do ingrediente de sabor.' using errcode='22023'; end if;
  if (select coalesce(sum(floor(greatest(private.inventory_supply_balance(p_business_id,o.supply_id),0)/v_def.condensed_g)),0) from private.brigadeiro_condensed_milk_options o where o.business_id=p_business_id)<p_batches then raise exception 'Estoque insuficiente de leite condensado.' using errcode='22023'; end if;
  v_date:=(p_produced_at at time zone 'America/Sao_Paulo')::date;
  for v_batch in 1..p_batches loop
    select o.supply_id into v_condensed from private.brigadeiro_condensed_milk_options o
    where o.business_id=p_business_id and private.inventory_supply_balance(p_business_id,o.supply_id)+0.0001>=v_def.condensed_g
    order by o.priority,o.supply_id limit 1;
    if v_condensed is null then raise exception 'Estoque insuficiente de leite condensado.' using errcode='22023'; end if;
    v_cost:=private.supply_unit_cost_at_date(p_business_id,v_condensed,v_date)*v_def.condensed_g
      +private.supply_unit_cost_at_date(p_business_id,v_def.cream_supply_id,v_date)*v_def.cream_g
      +private.supply_unit_cost_at_date(p_business_id,v_def.flavor_supply_id,v_date)*v_def.flavor_g;
    v_total_cost:=v_total_cost+v_cost;
    insert into public.inventory_movements(business_id,supply_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at,created_by)
    values(p_business_id,v_condensed,-v_def.condensed_g,'g','production_out','mass:'||p_request_id::text||':condensed:'||v_batch,'Massa '||v_def.name,p_produced_at,auth.uid());
  end loop;
  insert into public.inventory_movements(business_id,supply_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at,created_by) values
    (p_business_id,v_def.cream_supply_id,-v_cream_need,'g','production_out','mass:'||p_request_id::text||':cream','Massa '||v_def.name,p_produced_at,auth.uid()),
    (p_business_id,v_def.flavor_supply_id,-v_flavor_need,'g','production_out','mass:'||p_request_id::text||':flavor','Massa '||v_def.name,p_produced_at,auth.uid());
  v_grams:=v_def.yield_g*p_batches;
  insert into public.inventory_movements(business_id,supply_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at,created_by)
  values(p_business_id,v_def.mass_supply_id,v_grams,'g','production_in','mass:'||p_request_id::text||':in',coalesce(p_note,'Produção de '||v_def.name),p_produced_at,auth.uid());
  insert into private.brigadeiro_mass_productions(id,business_id,mass_key,batches,grams_produced,ingredient_cost_snapshot,unit_cost_snapshot,produced_at,note,request_id,created_by)
  values(v_production_id,p_business_id,p_mass_key,p_batches,v_grams,v_total_cost,v_total_cost/v_grams,p_produced_at,p_note,p_request_id,auth.uid());
  insert into private.brigadeiro_mass_cost_layers(business_id,mass_supply_id,production_id,source_key,grams_original,grams_remaining,unit_cost_snapshot,produced_at,note)
  values(p_business_id,v_def.mass_supply_id,v_production_id,'mass-layer:'||p_request_id::text,v_grams,v_grams,v_total_cost/v_grams,p_produced_at,'Custo congelado da massa');
  update public.api_idempotency_requests set result=jsonb_build_object('productionId',v_production_id),completed_at=now() where business_id=p_business_id and request_id=p_request_id and operation='brigadeiro_mass_production';
  return v_production_id;
end $$;

create or replace function public.record_brigadeiro_production_v1(
  p_business_id uuid,p_request_id uuid,p_product_id uuid,p_units integer,p_produced_at timestamptz,p_note text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_product public.products%rowtype;v_existing jsonb;v_hash text;v_production_id uuid:=gen_random_uuid();v_item record;
  v_need numeric;v_material numeric:=0;v_line numeric;v_date date;v_labor numeric;v_overhead numeric;v_total numeric;v_unit_cost numeric;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_request_id is null or p_units is null or p_units<=0 or p_units>1000 or p_produced_at is null then raise exception 'Produção de brigadeiro inválida.' using errcode='22023'; end if;
  select * into v_product from public.products where business_id=p_business_id and id=p_product_id and active=true and portfolio_key in ('brigadeiro-tradicional','brigadeiro-prestigio','brigadeiro-dois-amores','surpresa-uva','brigadeiro-oreo','brigadeiro-ninho');
  if not found then raise exception 'Brigadeiro não encontrado ou não liberado.' using errcode='22023'; end if;
  v_hash:=md5(p_product_id::text||':'||p_units::text||':'||p_produced_at::text||':'||coalesce(p_note,''));
  select result into v_existing from public.api_idempotency_requests where business_id=p_business_id and request_id=p_request_id and operation='brigadeiro_finished_production';
  if found then
    if (select request_hash from public.api_idempotency_requests where business_id=p_business_id and request_id=p_request_id and operation='brigadeiro_finished_production')<>v_hash then raise exception 'REQUEST_ID_REUSED_WITH_DIFFERENT_PAYLOAD' using errcode='22023'; end if;
    return (v_existing->>'productionId')::uuid;
  end if;
  insert into public.api_idempotency_requests(business_id,request_id,operation,request_hash) values(p_business_id,p_request_id,'brigadeiro_finished_production',v_hash);
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':product:'||p_product_id::text,0));
  v_date:=(p_produced_at at time zone 'America/Sao_Paulo')::date;
  for v_item in
    select ri.supply_id,ri.quantity,ri.unit,(md.mass_supply_id is not null) is_mass
    from public.recipe_items ri left join private.brigadeiro_mass_definitions md on md.business_id=ri.business_id and md.mass_supply_id=ri.supply_id
    where ri.business_id=p_business_id and ri.product_id=p_product_id
    order by ri.supply_id
  loop
    if v_item.unit<>'g' then raise exception 'Receita de brigadeiro precisa estar em gramas.' using errcode='22023'; end if;
    perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':supply:'||v_item.supply_id::text,0));
    v_need:=v_item.quantity*p_units;
    if private.inventory_supply_balance(p_business_id,v_item.supply_id)+0.0001<v_need then raise exception 'Estoque insuficiente para produzir %.',v_product.name using errcode='22023'; end if;
    if v_item.is_mass then v_line:=private.mass_fifo_cost(p_business_id,v_item.supply_id,v_need); else v_line:=private.supply_unit_cost_at_date(p_business_id,v_item.supply_id,v_date)*v_need; end if;
    v_material:=v_material+v_line;
  end loop;
  v_labor:=coalesce(v_product.labor_cost_per_batch,0)*p_units;
  v_overhead:=coalesce(v_product.production_cost_per_batch,0)*p_units;
  v_total:=v_material+v_labor+v_overhead;v_unit_cost:=v_total/p_units;
  insert into public.inventory_productions(id,business_id,product_id,batches,units_produced,produced_at,note,created_by,ingredient_cost_snapshot,packaging_cost_snapshot,labor_cost_snapshot,production_overhead_snapshot,total_batch_cost_snapshot,unit_cost_snapshot)
  values(v_production_id,p_business_id,p_product_id,p_units,p_units,p_produced_at,p_note,auth.uid(),v_material,0,v_labor,v_overhead,v_total,v_unit_cost);
  for v_item in
    select ri.supply_id,ri.quantity,ri.unit,(md.mass_supply_id is not null) is_mass
    from public.recipe_items ri left join private.brigadeiro_mass_definitions md on md.business_id=ri.business_id and md.mass_supply_id=ri.supply_id
    where ri.business_id=p_business_id and ri.product_id=p_product_id order by ri.supply_id
  loop
    v_need:=v_item.quantity*p_units;
    insert into public.inventory_movements(business_id,supply_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at,created_by)
    values(p_business_id,v_item.supply_id,-v_need,'g','production_out','brigadeiro:'||p_request_id::text||':supply:'||v_item.supply_id::text,'Produção de '||v_product.name,p_produced_at,auth.uid());
    if v_item.is_mass then perform private.consume_mass_layers(p_business_id,v_item.supply_id,v_need); end if;
  end loop;
  insert into public.inventory_movements(business_id,product_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at,created_by)
  values(p_business_id,p_product_id,p_units,'unit','production_in','brigadeiro:'||p_request_id::text||':product','Produção de '||v_product.name,p_produced_at,auth.uid());
  insert into public.inventory_product_cost_layers(business_id,product_id,production_id,source_key,units_original,units_remaining,unit_cost_snapshot,labor_unit_snapshot,produced_at)
  values(p_business_id,p_product_id,v_production_id,'production:'||v_production_id::text,p_units,p_units,v_unit_cost,coalesce(v_product.labor_cost_per_batch,0),p_produced_at);
  update public.api_idempotency_requests set result=jsonb_build_object('productionId',v_production_id),completed_at=now() where business_id=p_business_id and request_id=p_request_id and operation='brigadeiro_finished_production';
  return v_production_id;
end $$;

create or replace function private.brigadeiro_packaging_cost(p_business_id uuid,p_format text,p_units numeric,p_cost_date date)
returns numeric language plpgsql stable security definer set search_path='' as $$
declare v_sets numeric;v_row record;v_total numeric:=0;
begin
  if p_format not in ('unit','quartet') then raise exception 'Escolha a embalagem da venda.' using errcode='22023'; end if;
  if p_units<=0 or trunc(p_units)<>p_units then raise exception 'Quantidade inválida para embalagem.' using errcode='22023'; end if;
  if p_format='quartet' and mod(p_units::integer,4)<>0 then raise exception 'A embalagem quarteto exige quantidade total múltipla de 4.' using errcode='22023'; end if;
  v_sets:=case when p_format='quartet' then p_units/4 else p_units end;
  for v_row in select * from private.brigadeiro_packaging_profile where business_id=p_business_id and packaging_format=p_format loop
    v_total:=v_total+private.supply_unit_cost_at_date(p_business_id,v_row.supply_id,p_cost_date)*v_row.quantity_per_package*v_sets;
  end loop;
  return v_total;
end $$;

create or replace function private.consume_brigadeiro_packaging(p_business_id uuid,p_sale_id uuid,p_format text,p_units numeric,p_occurred_at timestamptz)
returns numeric language plpgsql security definer set search_path='' as $$
declare v_sets numeric;v_row record;v_need numeric;v_cost numeric:=0;v_date date;
begin
  if p_format not in ('unit','quartet') then raise exception 'Escolha a embalagem da venda.' using errcode='22023'; end if;
  if p_format='quartet' and mod(p_units::integer,4)<>0 then raise exception 'A embalagem quarteto exige quantidade total múltipla de 4.' using errcode='22023'; end if;
  v_sets:=case when p_format='quartet' then p_units/4 else p_units end;v_date:=(p_occurred_at at time zone 'America/Sao_Paulo')::date;
  for v_row in select * from private.brigadeiro_packaging_profile where business_id=p_business_id and packaging_format=p_format order by supply_id loop
    perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':supply:'||v_row.supply_id::text,0));
    v_need:=v_row.quantity_per_package*v_sets;
    if private.inventory_supply_balance(p_business_id,v_row.supply_id)+0.0001<v_need then raise exception 'Embalagem insuficiente para confirmar a venda.' using errcode='22023'; end if;
    v_cost:=v_cost+private.supply_unit_cost_at_date(p_business_id,v_row.supply_id,v_date)*v_need;
    insert into public.inventory_movements(business_id,supply_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at,created_by)
    values(p_business_id,v_row.supply_id,-v_need,'unit','sale','sale:'||p_sale_id::text||':packaging:'||v_row.supply_id::text,'Embalagem '||p_format,p_occurred_at,auth.uid())
    on conflict (business_id,source_key) where source_key is not null do nothing;
  end loop;
  return v_cost;
end $$;

create or replace function public.quote_sale_v2(
  p_business_id uuid,p_items jsonb,p_total_received numeric,p_payment_method text,p_sold_at timestamptz,p_transaction_type text default 'sale',p_delivery_cost numeric default 0,p_packaging_format text default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_base jsonb;v_pack numeric:=0;v_cost numeric;v_contribution numeric;v_fee numeric;v_min numeric;v_target numeric;v_min_required numeric;v_target_required numeric;v_status text;v_den numeric;
begin
  v_base:=public.quote_sale_v1(p_business_id,p_items,p_total_received,p_payment_method,p_sold_at,p_transaction_type,p_delivery_cost);
  if p_transaction_type='sale' then
    v_pack:=private.brigadeiro_packaging_cost(p_business_id,p_packaging_format,(v_base->>'totalQuantity')::numeric,(p_sold_at at time zone 'America/Sao_Paulo')::date);
  end if;
  v_cost:=(v_base->>'totalCost')::numeric+v_pack;v_contribution:=(v_base->>'contribution')::numeric-v_pack;
  v_fee:=coalesce(private.payment_fee_for_method(p_business_id,p_payment_method),0);v_min:=coalesce((v_base->>'minimumMarginPercent')::numeric,0);v_target:=coalesce((v_base->>'targetMarginPercent')::numeric,v_min);
  v_min_required:=(v_base->>'minimumRequiredValue')::numeric;v_target_required:=(v_base->>'recommendedRequiredValue')::numeric;
  if p_transaction_type='sale' and v_pack>0 then
    v_den:=1-(v_min+v_fee)/100;if v_den<=0 then raise exception 'Margem mínima e embalagem tornam a venda inviável.' using errcode='22023';end if;v_min_required:=v_min_required+v_pack/v_den;
    v_den:=1-(v_target+v_fee)/100;if v_den<=0 then raise exception 'Margem recomendada e embalagem tornam a venda inviável.' using errcode='22023';end if;v_target_required:=v_target_required+v_pack/v_den;
  end if;
  if p_transaction_type<>'sale' then v_status:='not_applicable';elsif v_contribution<0 then v_status:='below_cost';elsif p_total_received+0.005<v_min_required then v_status:='below_minimum';elsif p_total_received+0.005<v_target_required then v_status:='below_target';else v_status:='healthy';end if;
  return v_base||jsonb_build_object('packagingCost',v_pack,'totalCost',v_cost,'contribution',v_contribution,'marginPercent',case when p_transaction_type='sale' and p_total_received>0 then v_contribution/p_total_received*100 else 0 end,'belowCost',(p_transaction_type='sale' and v_contribution<0),'minimumRequiredValue',v_min_required,'recommendedRequiredValue',v_target_required,'marginStatus',v_status);
end $$;

create or replace function public.apply_nat_transition_v5(p_business_id uuid,p_request_id uuid,p_operations jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_op jsonb;v_payload jsonb;v_quote jsonb;v_status text;v_reason text;v_result jsonb;v_sale_id uuid;v_units numeric;v_pack_cost numeric;v_sold_at timestamptz;v_updated text;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501';end if;
  for v_op in select value from jsonb_array_elements(p_operations) loop
    if v_op->>'type'<>'create_sale' then continue;end if;v_payload:=coalesce(v_op->'payload','{}'::jsonb);
    if coalesce(v_payload->>'transactionType','sale')<>'sale' then continue;end if;
    v_quote:=public.quote_sale_v2(p_business_id,coalesce(v_payload->'items','[]'::jsonb),coalesce(nullif(v_payload->>'saleValue','')::numeric,nullif(v_payload->>'totalReceived','')::numeric,0),coalesce(nullif(v_payload->>'paymentMethod',''),'other'),(v_payload->>'soldAt')::timestamptz,'sale',coalesce(nullif(v_payload->>'deliveryCost','')::numeric,0),nullif(v_payload->>'packagingFormat',''));
    v_status:=v_quote->>'marginStatus';v_reason:=btrim(coalesce(v_payload->>'discountReason',''));
    if v_status='below_cost' and not coalesce(nullif(v_payload->>'belowCostOverride','')::boolean,false) then raise exception 'Venda abaixo do custo exige confirmação explícita.' using errcode='22023';end if;
    if v_status='below_minimum' and not coalesce(nullif(v_payload->>'marginOverride','')::boolean,false) then raise exception 'Venda abaixo da margem mínima exige confirmação explícita.' using errcode='22023';end if;
    if v_status in('below_cost','below_minimum') and char_length(v_reason)<2 then raise exception 'Explique a decisão de vender abaixo da margem protegida.' using errcode='22023';end if;
  end loop;
  v_result:=public.apply_nat_transition_v4(p_business_id,p_request_id,p_operations);
  for v_op in select value from jsonb_array_elements(p_operations) loop
    if v_op->>'type'<>'create_sale' then continue;end if;v_payload:=coalesce(v_op->'payload','{}'::jsonb);
    if coalesce(v_payload->>'transactionType','sale')<>'sale' then continue;end if;
    v_sale_id:=(v_payload->>'id')::uuid;v_sold_at:=(v_payload->>'soldAt')::timestamptz;
    select coalesce(sum(quantity),0) into v_units from public.sale_items where business_id=p_business_id and sale_id=v_sale_id;
    v_pack_cost:=private.consume_brigadeiro_packaging(p_business_id,v_sale_id,nullif(v_payload->>'packagingFormat',''),v_units,v_sold_at);
    update public.sales set packaging_format=v_payload->>'packagingFormat',packaging_cost_snapshot=v_pack_cost,contribution_snapshot=contribution_snapshot-v_pack_cost,updated_at=now() where business_id=p_business_id and id=v_sale_id;
    select updated_at::text into v_updated from public.sales where business_id=p_business_id and id=v_sale_id;
    v_result:=jsonb_set(v_result,array['sales',v_sale_id::text],to_jsonb(v_updated),true);
  end loop;
  return v_result;
end $$;

create or replace function private.inventory_after_sale_cancel()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_item record;v_move record;
begin
  if old.status='completed' and new.status='cancelled' then
    for v_item in select si.* from public.sale_items si where si.business_id=new.business_id and si.sale_id=new.id loop
      for v_move in select * from public.inventory_movements m where m.business_id=new.business_id and m.movement_type='sale' and m.source_key like 'sale:'||v_item.id::text||'%' loop
        if v_move.product_id is not null then perform pg_advisory_xact_lock(hashtextextended(new.business_id::text||':product:'||v_move.product_id::text,0));else perform pg_advisory_xact_lock(hashtextextended(new.business_id::text||':supply:'||v_move.supply_id::text,0));end if;
        insert into public.inventory_movements(business_id,supply_id,product_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at,created_by) values(new.business_id,v_move.supply_id,v_move.product_id,-v_move.quantity_delta,v_move.base_unit,'sale_cancel','sale-cancel:'||v_move.id::text,'Estorno por cancelamento',now(),auth.uid()) on conflict (business_id,source_key) where source_key is not null do nothing;
      end loop;
      perform private.restore_inventory_cost_layers(new.business_id,v_item.id);
    end loop;
    for v_move in select * from public.inventory_movements m where m.business_id=new.business_id and m.movement_type='sale' and m.source_key like 'sale:'||new.id::text||':packaging:%' loop
      perform pg_advisory_xact_lock(hashtextextended(new.business_id::text||':supply:'||v_move.supply_id::text,0));
      insert into public.inventory_movements(business_id,supply_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at,created_by) values(new.business_id,v_move.supply_id,null,-v_move.quantity_delta,v_move.base_unit,'sale_cancel','sale-cancel:'||v_move.id::text,'Estorno de embalagem por cancelamento',now(),auth.uid()) on conflict (business_id,source_key) where source_key is not null do nothing;
    end loop;
  end if;return new;
end $$;

revoke all on function public.record_brigadeiro_mass_production_v1(uuid,uuid,text,integer,timestamptz,text) from public,anon;
grant execute on function public.record_brigadeiro_mass_production_v1(uuid,uuid,text,integer,timestamptz,text) to authenticated;
revoke all on function public.record_brigadeiro_production_v1(uuid,uuid,uuid,integer,timestamptz,text) from public,anon;
grant execute on function public.record_brigadeiro_production_v1(uuid,uuid,uuid,integer,timestamptz,text) to authenticated;
revoke all on function public.quote_sale_v2(uuid,jsonb,numeric,text,timestamptz,text,numeric,text) from public,anon;
grant execute on function public.quote_sale_v2(uuid,jsonb,numeric,text,timestamptz,text,numeric,text) to authenticated;
revoke all on function public.apply_nat_transition_v5(uuid,uuid,jsonb) from public,anon;
grant execute on function public.apply_nat_transition_v5(uuid,uuid,jsonb) to authenticated;

-- Reconfiguração do negócio real da NAT: preserva histórico e reabre o estoque físico a partir do mapeamento de 13/09/2026.
do $$
declare
  b uuid:='4b8f4ef8-a9a4-41c1-b4e2-18443ae4c638';
  pirac uuid:='7ce8d5b4-891e-4dc3-bd7b-01a730dbb521';nesquik uuid:='b135ce66-cb45-4e76-9e14-ec1851a2fcb4';
  mt uuid:='94de9b45-4540-48c0-96ee-4dd57c0b0cd0';ml uuid:='548f9d63-54e7-4564-bc1e-cc6058742169';mb uuid:='ca8a9c16-cd7e-4898-8d54-97020ec30656';mp uuid:='967d496d-53cf-43bf-b3d0-2245fef55066';
  prestigio uuid:='f446ef8e-328e-46e4-8857-33aa90cb8089';r record;bal numeric;cost numeric;
  italac uuid:='f5e623df-05d5-42ee-8ced-247de327a0be';cream uuid:='c5b783f8-3670-46e7-986a-ecbbf60b2a8b';choc uuid:='b9ad51ed-d2b2-4db4-8fdc-61f353548e41';ninho uuid:='c3476964-76f7-421f-b492-fa01c5b91fca';coco uuid:='ef690d1e-410f-45a7-b56d-ae5e6b4bff71';dori uuid:='c9f625b8-13b4-43f2-8c7b-c32f40d89a05';uva uuid:='7f8a4a2c-1f2a-4d1f-a1c4-6b4d2dd7ce12';oreo uuid:='b154bb91-dea5-49a0-8ece-b006d63ad32b';mini uuid:='394db1b2-a1b8-43df-bc28-c508d68a7c4b';
  box1 uuid:='19f19ce7-36b3-4d2b-aee4-cf0f6b655a3f';forminha uuid:='519a8960-e416-4058-b2a7-e38e35e7c77f';bag uuid:='c24d0e18-a3ab-4d6e-b301-6988b623d880';box4 uuid:='a1f13f53-4a25-440a-9bee-e981aff7cb61';support uuid:='bb0d85a8-f6df-473e-8702-72a4edd7b0eb';validity uuid:='f52e7a79-3835-40c8-b1f7-ea981537a916';contact uuid:='4186f00f-a67f-4c5e-bb22-5a059b502f54';
begin
  if not exists(select 1 from public.businesses where id=b) then return;end if;
  update public.supplies set active=false,updated_at=now() where business_id=b;
  insert into public.supplies(id,business_id,name,category,active) values
    (pirac,b,'Leite condensado Piracanjuba','ingredient',true),(nesquik,b,'Nesquik','ingredient',true),
    (mt,b,'Massa • Tradicional','other',true),(ml,b,'Massa • Leite em pó','other',true),(mb,b,'Massa • Beijinho','other',true),(mp,b,'Massa • Bicho de pé','other',true)
  on conflict(id) do update set name=excluded.name,category=excluded.category,active=true,updated_at=now();
  update public.supplies set active=true,updated_at=now() where business_id=b and id in (italac,cream,choc,ninho,coco,dori,uva,oreo,mini,box1,forminha,bag,box4,support,validity,contact,pirac,nesquik,mt,ml,mb,mp);
  update public.supplies set name=case id when coco then 'Coco ralado Menina' when ninho then 'Leite em pó Ninho' when dori then 'Granulado Dori' when box1 then 'Caixinha unitária' when forminha then 'Forminha de brigadeiro' when bag then 'Sacola' when box4 then 'Caixinha para 4 brigadeiros' when support then 'Suporte de forminha' else name end where business_id=b;
  insert into public.inventory_tracking(business_id,supply_id,base_unit,minimum_quantity)
  select b,x.id,x.unit,0 from (values(italac,'g'),(pirac,'g'),(cream,'g'),(choc,'g'),(ninho,'g'),(coco,'g'),(nesquik,'g'),(dori,'g'),(uva,'g'),(oreo,'g'),(mini,'g'),(mt,'g'),(ml,'g'),(mb,'g'),(mp,'g'),(box1,'unit'),(forminha,'unit'),(bag,'unit'),(box4,'unit'),(support,'unit'),(validity,'unit'),(contact,'unit')) x(id,unit)
  on conflict do nothing;
  insert into private.brigadeiro_mass_definitions(business_id,mass_key,name,mass_supply_id,flavor_supply_id,cream_supply_id,available,badge) values
    (b,'traditional','Tradicional',mt,choc,cream,true,null),(b,'milk','Leite em pó',ml,ninho,cream,true,null),(b,'beijinho','Beijinho',mb,coco,cream,false,'A liberar'),(b,'bicho_pe','Bicho de pé',mp,nesquik,cream,false,'A liberar')
  on conflict(business_id,mass_key) do update set name=excluded.name,mass_supply_id=excluded.mass_supply_id,flavor_supply_id=excluded.flavor_supply_id,cream_supply_id=excluded.cream_supply_id,available=excluded.available,badge=excluded.badge;
  insert into private.brigadeiro_condensed_milk_options(business_id,supply_id,priority) values(b,italac,10),(b,pirac,20) on conflict do nothing;
  insert into private.brigadeiro_packaging_profile(business_id,packaging_format,supply_id,quantity_per_package,package_capacity) values
    (b,'unit',box1,1,1),(b,'unit',forminha,1,1),(b,'unit',bag,1,1),(b,'quartet',box4,1,4),(b,'quartet',forminha,4,4),(b,'quartet',support,4,4),(b,'quartet',validity,1,4),(b,'quartet',contact,1,4)
  on conflict(business_id,packaging_format,supply_id) do update set quantity_per_package=excluded.quantity_per_package,package_capacity=excluded.package_capacity;
  for r in select t.supply_id,t.product_id,t.base_unit from public.inventory_tracking t where t.business_id=b loop
    select coalesce(sum(quantity_delta),0) into bal from public.inventory_movements where business_id=b and ((r.supply_id is not null and supply_id=r.supply_id) or (r.product_id is not null and product_id=r.product_id));
    if abs(bal)>0.0001 then insert into public.inventory_movements(business_id,supply_id,product_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at) values(b,r.supply_id,r.product_id,-bal,r.base_unit,'adjustment','rebaseline:2026-09-13:'||coalesce(r.supply_id::text,r.product_id::text),'Recontagem física do processo produtivo',timestamptz '2026-09-13 16:00:00-03') on conflict(business_id,source_key) where source_key is not null do nothing;end if;
  end loop;
  update public.inventory_product_cost_layers set units_remaining=0 where business_id=b and units_remaining>0;
  update private.brigadeiro_mass_cost_layers set grams_remaining=0 where business_id=b and grams_remaining>0;
  for r in select * from (values(cream,200::numeric,'g'),(choc,100,'g'),(ninho,575,'g'),(coco,200,'g'),(dori,400,'g'),(uva,500,'g'),(oreo,50,'g'),(mini,800,'g'),(box1,50,'unit'),(forminha,80,'unit'),(bag,45,'unit'),(box4,11,'unit'),(support,11,'unit'),(validity,16,'unit'),(contact,16,'unit'),(mt,132,'g'),(ml,157,'g')) x(id,qty,unit) loop
    insert into public.inventory_movements(business_id,supply_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at) values(b,r.id,r.qty,r.unit,'opening','opening:process-map:2026-09-13:'||r.id::text,'Saldo físico informado no mapeamento do processo',timestamptz '2026-09-13 16:00:00-03') on conflict(business_id,source_key) where source_key is not null do nothing;
  end loop;
  cost:=private.supply_unit_cost_at_date(b,italac,date '2026-09-13')*396+private.supply_unit_cost_at_date(b,cream,date '2026-09-13')*100+private.supply_unit_cost_at_date(b,choc,date '2026-09-13')*46;
  insert into private.brigadeiro_mass_cost_layers(business_id,mass_supply_id,source_key,grams_original,grams_remaining,unit_cost_snapshot,produced_at,note) values(b,mt,'opening-mass:traditional:2026-09-13',132,132,cost/800,timestamptz '2026-09-13 16:00:00-03','Estimativa de custo do saldo inicial com os custos vigentes') on conflict do nothing;
  cost:=private.supply_unit_cost_at_date(b,italac,date '2026-09-13')*396+private.supply_unit_cost_at_date(b,cream,date '2026-09-13')*100+private.supply_unit_cost_at_date(b,ninho,date '2026-09-13')*46;
  insert into private.brigadeiro_mass_cost_layers(business_id,mass_supply_id,source_key,grams_original,grams_remaining,unit_cost_snapshot,produced_at,note) values(b,ml,'opening-mass:milk:2026-09-13',157,157,cost/800,timestamptz '2026-09-13 16:00:00-03','Estimativa de custo do saldo inicial com os custos vigentes') on conflict do nothing;
  update public.products set active=false,available=false,updated_at=now() where business_id=b;
  insert into public.products(id,business_id,name,portfolio_key,batch_yield,selling_price,loss_percent,labor_cost_per_batch,production_cost_per_batch,minimum_margin_percent,target_margin_percent,available,active) values(prestigio,b,'Brigadeiro • Prestígio','brigadeiro-prestigio',1,3.75,0,1.50,0,10,15,true,true) on conflict(id) do update set name=excluded.name,portfolio_key=excluded.portfolio_key,batch_yield=1,selling_price=excluded.selling_price,loss_percent=0,labor_cost_per_batch=1.50,minimum_margin_percent=10,target_margin_percent=15,available=true,active=true,updated_at=now();
  update public.products set active=true,available=true,batch_yield=1,loss_percent=0,labor_cost_per_batch=1.50,production_cost_per_batch=0,updated_at=now() where business_id=b and portfolio_key in ('brigadeiro-tradicional','brigadeiro-dois-amores','surpresa-uva','brigadeiro-oreo','brigadeiro-ninho');
  delete from public.recipe_items where business_id=b and product_id in (select id from public.products where business_id=b and active=true);
  insert into public.recipe_items(business_id,product_id,supply_id,quantity,unit)
  select b,p.id,x.supply_id,x.qty,'g' from public.products p join (values
    ('brigadeiro-tradicional',mt,20::numeric),('brigadeiro-tradicional',dori,6),
    ('brigadeiro-prestigio',mt,12),('brigadeiro-prestigio',ml,8),('brigadeiro-prestigio',coco,6),
    ('brigadeiro-dois-amores',mt,10),('brigadeiro-dois-amores',ml,10),
    ('surpresa-uva',ml,20),('surpresa-uva',uva,3),('surpresa-uva',ninho,6),
    ('brigadeiro-oreo',ml,10),('brigadeiro-oreo',oreo,10),('brigadeiro-oreo',ninho,6),('brigadeiro-oreo',mini,1.5),
    ('brigadeiro-ninho',ml,20),('brigadeiro-ninho',ninho,6)
  ) x(portfolio_key,supply_id,qty) on x.portfolio_key=p.portfolio_key where p.business_id=b and p.active=true;
  insert into public.inventory_tracking(business_id,product_id,base_unit,minimum_quantity) select b,id,'unit',0 from public.products where business_id=b and active=true on conflict do nothing;
end $$;

commit;

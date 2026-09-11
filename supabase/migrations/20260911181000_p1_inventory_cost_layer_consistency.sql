begin;

-- Cost layers keep the labor component frozen as well, so owner-remuneration analysis
-- follows the batch actually produced rather than later product settings.
alter table public.inventory_product_cost_layers
  add column if not exists labor_unit_snapshot numeric(14,6) not null default 0 check (labor_unit_snapshot >= 0);

-- Keep tenant ownership in the production relation explicit.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname='inventory_productions_business_id_id_key'
      and conrelid='public.inventory_productions'::regclass
  ) then
    alter table public.inventory_productions add constraint inventory_productions_business_id_id_key unique(business_id,id);
  end if;
end $$;
alter table public.inventory_product_cost_layers drop constraint if exists inventory_product_cost_layers_production_id_fkey;
alter table public.inventory_product_cost_layers drop constraint if exists inventory_product_cost_layers_production_business_fk;
alter table public.inventory_product_cost_layers
  add constraint inventory_product_cost_layers_production_business_fk
  foreign key (business_id,production_id) references public.inventory_productions(business_id,id) on delete restrict;

create or replace function private.inventory_fifo_unit_labor(p_business_id uuid,p_product_id uuid,p_quantity numeric)
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
    select units_remaining,labor_unit_snapshot from public.inventory_product_cost_layers
    where business_id=p_business_id and product_id=p_product_id and units_remaining>0
    order by produced_at,id
  loop
    exit when v_left<=0;
    v_take:=least(v_left,v_layer.units_remaining);
    v_total:=v_total+v_take*v_layer.labor_unit_snapshot;
    v_left:=v_left-v_take;
  end loop;
  if v_left>0 then raise exception 'Camadas de custo insuficientes para o estoque informado.' using errcode='22023'; end if;
  return v_total/p_quantity;
end;
$$;
revoke all on function private.inventory_fifo_unit_labor(uuid,uuid,numeric) from public,anon,authenticated;

-- Opening/positive adjustments of finished goods get a cost layer. Negative physical
-- adjustments consume the oldest known layers where available. This keeps stock and
-- frozen-cost quantities aligned after P1 is enabled.
create or replace function private.consume_product_layers_for_adjustment(p_business_id uuid,p_product_id uuid,p_quantity numeric)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_layer record; v_left numeric:=p_quantity; v_take numeric;
begin
  for v_layer in
    select * from public.inventory_product_cost_layers
    where business_id=p_business_id and product_id=p_product_id and units_remaining>0
    order by produced_at,id for update
  loop
    exit when v_left<=0;
    v_take:=least(v_left,v_layer.units_remaining);
    update public.inventory_product_cost_layers set units_remaining=units_remaining-v_take where id=v_layer.id;
    v_left:=v_left-v_take;
  end loop;
end;
$$;
revoke all on function private.consume_product_layers_for_adjustment(uuid,uuid,numeric) from public,anon,authenticated;

create or replace function public.set_inventory_balance(
  p_business_id uuid,p_item_kind text,p_item_id uuid,p_quantity numeric,p_minimum_quantity numeric,p_note text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_tracking public.inventory_tracking%rowtype; v_base_unit text; v_current numeric; v_delta numeric; v_first boolean:=false;
  v_note text:=nullif(left(btrim(coalesce(p_note,'')),500),''); v_movement_id uuid; v_unit_cost numeric; v_unit_labor numeric;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_item_id is null or p_quantity is null or p_quantity<0 or p_minimum_quantity is null or p_minimum_quantity<0 then raise exception 'Saldo e estoque mínimo precisam ser zero ou maiores.' using errcode='22023'; end if;
  if p_item_kind='product' then
    if not exists(select 1 from public.products where business_id=p_business_id and id=p_item_id and active=true) then raise exception 'Produto não encontrado ou arquivado.' using errcode='22023'; end if;
    v_base_unit:='unit';
  elsif p_item_kind='supply' then
    select case private.unit_dimension(sp.package_unit) when 'mass' then 'g' when 'volume' then 'ml' when 'unit' then 'unit' else null end into v_base_unit
    from public.supply_purchases sp join public.supplies s on s.business_id=sp.business_id and s.id=sp.supply_id and s.active=true
    where sp.business_id=p_business_id and sp.supply_id=p_item_id order by sp.purchased_at desc,sp.created_at desc limit 1;
    if v_base_unit is null then raise exception 'Insumo sem unidade de compra válida.' using errcode='22023'; end if;
  else raise exception 'Tipo de item de estoque inválido.' using errcode='22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':'||p_item_kind||':'||p_item_id::text,0));
  select * into v_tracking from public.inventory_tracking t where t.business_id=p_business_id
    and ((p_item_kind='supply' and t.supply_id=p_item_id) or (p_item_kind='product' and t.product_id=p_item_id)) for update;
  if not found then
    v_first:=true;
    insert into public.inventory_tracking(business_id,supply_id,product_id,base_unit,minimum_quantity)
    values(p_business_id,case when p_item_kind='supply' then p_item_id end,case when p_item_kind='product' then p_item_id end,v_base_unit,p_minimum_quantity);
    v_current:=0;
  else
    if v_tracking.base_unit<>v_base_unit then raise exception 'A unidade-base do estoque não pode ser alterada.' using errcode='22023'; end if;
    update public.inventory_tracking set minimum_quantity=p_minimum_quantity where id=v_tracking.id;
    v_current:=private.inventory_balance(p_business_id,p_item_kind,p_item_id);
  end if;
  v_delta:=p_quantity-v_current;
  if v_delta<>0 then
    v_movement_id:=gen_random_uuid();
    insert into public.inventory_movements(id,business_id,supply_id,product_id,quantity_delta,base_unit,movement_type,note,occurred_at,created_by)
    values(v_movement_id,p_business_id,case when p_item_kind='supply' then p_item_id end,case when p_item_kind='product' then p_item_id end,
      v_delta,v_base_unit,case when v_first then 'opening' else 'adjustment' end,v_note,now(),auth.uid());
    if p_item_kind='product' and v_delta>0 then
      v_unit_cost:=private.product_production_unit_cost_at_date(p_business_id,p_item_id,current_date);
      select labor_cost_per_batch/nullif(batch_yield,0) into v_unit_labor from public.products where business_id=p_business_id and id=p_item_id;
      insert into public.inventory_product_cost_layers(business_id,product_id,production_id,source_key,units_original,units_remaining,unit_cost_snapshot,labor_unit_snapshot,produced_at)
      values(p_business_id,p_item_id,null,'balance:'||v_movement_id::text,v_delta,v_delta,v_unit_cost,coalesce(v_unit_labor,0),now());
    elsif p_item_kind='product' and v_delta<0 then
      perform private.consume_product_layers_for_adjustment(p_business_id,p_item_id,abs(v_delta));
    end if;
  end if;
end;
$$;

-- Recreate production function with labor snapshot on its FIFO layer.
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
  v_note text:=nullif(left(btrim(coalesce(p_note,'')),500),''); v_material numeric; v_labor numeric; v_overhead numeric; v_total numeric; v_unit numeric; v_labor_unit numeric;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_batches is null or p_batches<=0 or p_produced_at is null then raise exception 'Informe uma quantidade de produção maior que zero.' using errcode='22023'; end if;
  select * into v_product from public.products where business_id=p_business_id and id=p_product_id and active=true;
  if not found or v_product.batch_yield<=0 then raise exception 'Produto não encontrado ou inválido.' using errcode='22023'; end if;
  if not exists(select 1 from public.inventory_tracking where business_id=p_business_id and product_id=p_product_id) then raise exception 'Defina primeiro o saldo inicial deste produto no Estoque.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':product:'||p_product_id::text,0));
  v_units:=v_product.batch_yield*p_batches;
  for v_item in
    select r.supply_id,t.base_unit,s.category,sum(private.unit_base_amount(r.quantity,r.unit)*case when s.category='ingredient' then (1+v_product.loss_percent/100) else 1 end)*p_batches as required_quantity
    from public.recipe_items r join public.supplies s on s.business_id=r.business_id and s.id=r.supply_id and s.category<>'packaging'
    join public.inventory_tracking t on t.business_id=r.business_id and t.supply_id=r.supply_id
    where r.business_id=p_business_id and r.product_id=p_product_id group by r.supply_id,t.base_unit,s.category order by r.supply_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':supply:'||v_item.supply_id::text,0));
    v_balance:=private.inventory_balance(p_business_id,'supply',v_item.supply_id);
    if v_balance<v_item.required_quantity then raise exception 'Estoque insuficiente de insumo para esta produção.' using errcode='22023'; end if;
  end loop;
  v_material:=private.product_material_cost_at_date(p_business_id,p_product_id,(p_produced_at at time zone 'America/Sao_Paulo')::date,false)*p_batches;
  v_labor:=v_product.labor_cost_per_batch*p_batches; v_overhead:=v_product.production_cost_per_batch*p_batches; v_total:=v_material+v_labor+v_overhead; v_unit:=v_total/v_units; v_labor_unit:=v_labor/v_units;
  insert into public.inventory_productions(id,business_id,product_id,batches,units_produced,produced_at,note,created_by,ingredient_cost_snapshot,packaging_cost_snapshot,labor_cost_snapshot,production_overhead_snapshot,total_batch_cost_snapshot,unit_cost_snapshot)
  values(v_production_id,p_business_id,p_product_id,p_batches,v_units,p_produced_at,v_note,auth.uid(),v_material,0,v_labor,v_overhead,v_total,v_unit);
  for v_item in
    select r.supply_id,t.base_unit,s.category,sum(private.unit_base_amount(r.quantity,r.unit)*case when s.category='ingredient' then (1+v_product.loss_percent/100) else 1 end)*p_batches as required_quantity
    from public.recipe_items r join public.supplies s on s.business_id=r.business_id and s.id=r.supply_id and s.category<>'packaging'
    join public.inventory_tracking t on t.business_id=r.business_id and t.supply_id=r.supply_id
    where r.business_id=p_business_id and r.product_id=p_product_id group by r.supply_id,t.base_unit,s.category order by r.supply_id
  loop
    insert into public.inventory_movements(business_id,supply_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at,created_by)
    values(p_business_id,v_item.supply_id,-v_item.required_quantity,v_item.base_unit,'production_out','production:'||v_production_id::text||':supply:'||v_item.supply_id::text,'Consumo na produção de '||v_product.name,p_produced_at,auth.uid());
  end loop;
  insert into public.inventory_movements(business_id,product_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at,created_by)
  values(p_business_id,p_product_id,v_units,'unit','production_in','production:'||v_production_id::text||':product:'||p_product_id::text,coalesce(v_note,'Produção registrada'),p_produced_at,auth.uid());
  insert into public.inventory_product_cost_layers(business_id,product_id,production_id,source_key,units_original,units_remaining,unit_cost_snapshot,labor_unit_snapshot,produced_at)
  values(p_business_id,p_product_id,v_production_id,'production:'||v_production_id::text,v_units,v_units,v_unit,v_labor_unit,p_produced_at);
  return v_production_id;
end;
$$;

-- Recreate sale writer so labor snapshots are frozen from FIFO production layers when available.
create or replace function public.save_sale_items_v3(
  p_business_id uuid,p_id uuid,p_items jsonb,p_total_received numeric,p_payment_method text,p_sold_at timestamptz,p_customer_id uuid default null,p_transaction_type text default 'sale'
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
    v_unit_labor:=case when v_use_layers then private.inventory_fifo_unit_labor(p_business_id,v_product_id,v_quantity) else v_product.labor_cost_per_batch/v_product.batch_yield end;
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
    if coalesce((v_line->>'useLayers')::boolean,false) then perform private.consume_inventory_cost_layers(p_business_id,(v_line->>'productId')::uuid,v_sale_item_id,(v_line->>'quantity')::numeric); end if;
  end loop;
end;
$$;

-- Official portfolio keys; these are product catalog metadata, never customer data.
update public.products set portfolio_key='brigadeiro-oreo',updated_at=now()
where name='Brigadeiro • Oreo' and (portfolio_key is null or portfolio_key='');
update public.products set portfolio_key='brigadeiro-tradicional-disqueti',updated_at=now()
where name='Brigadeiro • Tradicional • Disqueti' and (portfolio_key is null or portfolio_key='');

commit;

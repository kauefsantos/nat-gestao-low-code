-- Estoque/produção continua genérico por recipe_items/supply_id e passa a detalhar o insumo insuficiente.
create or replace function public.record_inventory_production_impl(p_business_id uuid, p_product_id uuid, p_batches numeric, p_produced_at timestamp with time zone, p_note text default null::text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
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
    select r.supply_id,t.base_unit,s.category,s.name as supply_name,sum(private.unit_base_amount(r.quantity,r.unit)*case when s.category='ingredient' then (1+v_product.loss_percent/100) else 1 end)*p_batches as required_quantity
    from public.recipe_items r join public.supplies s on s.business_id=r.business_id and s.id=r.supply_id and s.category<>'packaging'
    join public.inventory_tracking t on t.business_id=r.business_id and t.supply_id=r.supply_id
    where r.business_id=p_business_id and r.product_id=p_product_id group by r.supply_id,t.base_unit,s.category,s.name order by r.supply_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':supply:'||v_item.supply_id::text,0));
    v_balance:=private.inventory_balance(p_business_id,'supply',v_item.supply_id);
    if v_balance<v_item.required_quantity then
      raise exception 'Estoque insuficiente de %: necessário % %, disponível % %.', v_item.supply_name, round(v_item.required_quantity,4), v_item.base_unit, round(v_balance,4), v_item.base_unit using errcode='22023';
    end if;
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
end;$function$;

begin;

-- A target-stock request is identified by the requested state, not by the server-side
-- timestamp generated when the Edge Function retries the same request. Keeping
-- produced_at out of the idempotency hash lets a transport retry reuse the stored
-- result without consuming the recipe again. Explicit production keeps its separate
-- request contract and timestamp semantics.
--
-- The initial physical count is also timestamped and costed at p_produced_at instead
-- of current_date/now(), so historical reconciliation is deterministic and uses the
-- purchase history that actually existed on the informed business date.
create or replace function public.set_product_stock_v2(
  p_business_id uuid,
  p_request_id uuid,
  p_product_id uuid,
  p_target_quantity numeric,
  p_minimum_quantity numeric,
  p_produced_at timestamptz,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_hash text;v_inserted integer;v_operation text;v_existing_hash text;v_result jsonb;
  v_product public.products%rowtype;v_tracking public.inventory_tracking%rowtype;
  v_previous numeric;v_final numeric;v_delta numeric;v_batches numeric;v_production_id uuid;v_first boolean:=false;
  v_movement_id uuid;v_unit_cost numeric;v_unit_labor numeric;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_request_id is null or p_product_id is null or p_target_quantity is null or p_target_quantity<0
     or p_minimum_quantity is null or p_minimum_quantity<0 or p_produced_at is null then
    raise exception 'Saldo e estoque mínimo precisam ser zero ou maiores.' using errcode='22023';
  end if;

  v_hash:=md5(jsonb_build_object(
    'productId',p_product_id,'targetQuantity',p_target_quantity,'minimumQuantity',p_minimum_quantity,
    'note',nullif(btrim(coalesce(p_note,'')),'')
  )::text);
  insert into public.api_idempotency_requests(business_id,request_id,operation,request_hash)
  values(p_business_id,p_request_id,'set_product_stock',v_hash)
  on conflict do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted=0 then
    select operation,request_hash,result into v_operation,v_existing_hash,v_result
    from public.api_idempotency_requests
    where business_id=p_business_id and request_id=p_request_id;
    if v_operation is distinct from 'set_product_stock' or v_existing_hash is distinct from v_hash then
      raise exception 'CONFLICT: identificador de operação reutilizado com conteúdo diferente.' using errcode='40001';
    end if;
    if v_result is null then raise exception 'CONFLICT: operação idempotente ainda sem resultado.' using errcode='40001'; end if;
    return v_result;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':product:'||p_product_id::text,0));
  select * into v_product
  from public.products
  where business_id=p_business_id and id=p_product_id and active=true;
  if not found then raise exception 'Produto não encontrado ou arquivado.' using errcode='22023'; end if;
  if v_product.batch_yield is null or v_product.batch_yield<=0 then
    raise exception 'Defina primeiro o rendimento da receita deste produto.' using errcode='22023';
  end if;

  select * into v_tracking
  from public.inventory_tracking
  where business_id=p_business_id and product_id=p_product_id
  for update;
  if not found then
    v_first:=true;
    v_previous:=0;
    v_delta:=0;
    insert into public.inventory_tracking(business_id,product_id,base_unit,minimum_quantity)
    values(p_business_id,p_product_id,'unit',p_minimum_quantity);

    if p_target_quantity<>0 then
      v_movement_id:=gen_random_uuid();
      insert into public.inventory_movements(
        id,business_id,product_id,quantity_delta,base_unit,movement_type,note,occurred_at,created_by
      ) values(
        v_movement_id,p_business_id,p_product_id,p_target_quantity,'unit','opening',
        nullif(left(btrim(coalesce(p_note,'Saldo inicial informado')),500),''),p_produced_at,auth.uid()
      );

      v_unit_cost:=private.product_production_unit_cost_at_date(
        p_business_id,p_product_id,(p_produced_at at time zone 'America/Sao_Paulo')::date
      );
      select labor_cost_per_batch/nullif(batch_yield,0)
      into v_unit_labor
      from public.products
      where business_id=p_business_id and id=p_product_id;
      insert into public.inventory_product_cost_layers(
        business_id,product_id,production_id,source_key,units_original,units_remaining,
        unit_cost_snapshot,labor_unit_snapshot,produced_at
      ) values(
        p_business_id,p_product_id,null,'balance:'||v_movement_id::text,p_target_quantity,p_target_quantity,
        v_unit_cost,coalesce(v_unit_labor,0),p_produced_at
      );
    end if;
  else
    v_previous:=private.inventory_balance(p_business_id,'product',p_product_id);
    v_delta:=p_target_quantity-v_previous;
    if v_delta>0 then
      v_batches:=v_delta/v_product.batch_yield;
      v_production_id:=public.record_inventory_production(p_business_id,p_product_id,v_batches,p_produced_at,p_note);
      update public.inventory_tracking set minimum_quantity=p_minimum_quantity where id=v_tracking.id;
    else
      perform public.set_inventory_balance(p_business_id,'product',p_product_id,p_target_quantity,p_minimum_quantity,p_note);
    end if;
  end if;

  v_final:=private.inventory_balance(p_business_id,'product',p_product_id);
  if v_final is distinct from p_target_quantity then
    raise exception 'Não foi possível reconciliar o saldo final do produto.' using errcode='40001';
  end if;

  v_result:=jsonb_build_object(
    'productId',p_product_id,'previousQuantity',v_previous,'targetQuantity',p_target_quantity,
    'unitsProduced',case when v_first then 0 else greatest(v_delta,0) end,
    'batches',coalesce(v_batches,0),'productionId',v_production_id,
    'action',case when v_first then 'opening' when v_delta>0 then 'production' when v_delta<0 then 'adjustment' else 'minimum_only' end
  );
  update public.api_idempotency_requests
  set result=v_result,completed_at=now()
  where business_id=p_business_id and request_id=p_request_id;
  return v_result;
end;
$$;

revoke all on function public.set_product_stock_v2(uuid,uuid,uuid,numeric,numeric,timestamptz,text) from public,anon;
grant execute on function public.set_product_stock_v2(uuid,uuid,uuid,numeric,numeric,timestamptz,text) to authenticated;

commit;

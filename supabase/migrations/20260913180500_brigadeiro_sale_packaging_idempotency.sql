begin;

create or replace function public.apply_nat_transition_v5(p_business_id uuid,p_request_id uuid,p_operations jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_op jsonb;v_payload jsonb;v_quote jsonb;v_status text;v_reason text;v_result jsonb;
  v_sale_id uuid;v_units numeric;v_pack_cost numeric;v_sold_at timestamptz;v_updated text;v_already_applied boolean;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501';end if;
  for v_op in select value from jsonb_array_elements(p_operations) loop
    if v_op->>'type'<>'create_sale' then continue;end if;
    v_payload:=coalesce(v_op->'payload','{}'::jsonb);
    if coalesce(v_payload->>'transactionType','sale')<>'sale' then continue;end if;

    -- Retry do mesmo request não deve recalcular custo depois que a venda já foi
    -- concluída e a embalagem consumida. O v4, chamado abaixo, continua sendo a
    -- autoridade para detectar request_id reutilizado com payload diferente.
    v_sale_id:=nullif(v_payload->>'id','')::uuid;
    if v_sale_id is not null then
      select packaging_format is not null into v_already_applied
      from public.sales
      where business_id=p_business_id and id=v_sale_id;
      if coalesce(v_already_applied,false) then continue;end if;
    end if;

    v_quote:=public.quote_sale_v2(
      p_business_id,
      coalesce(v_payload->'items','[]'::jsonb),
      coalesce(nullif(v_payload->>'saleValue','')::numeric,nullif(v_payload->>'totalReceived','')::numeric,0),
      coalesce(nullif(v_payload->>'paymentMethod',''),'other'),
      (v_payload->>'soldAt')::timestamptz,
      'sale',
      coalesce(nullif(v_payload->>'deliveryCost','')::numeric,0),
      nullif(v_payload->>'packagingFormat','')
    );
    v_status:=v_quote->>'marginStatus';v_reason:=btrim(coalesce(v_payload->>'discountReason',''));
    if v_status='below_cost' and not coalesce(nullif(v_payload->>'belowCostOverride','')::boolean,false) then raise exception 'Venda abaixo do custo exige confirmação explícita.' using errcode='22023';end if;
    if v_status='below_minimum' and not coalesce(nullif(v_payload->>'marginOverride','')::boolean,false) then raise exception 'Venda abaixo da margem mínima exige confirmação explícita.' using errcode='22023';end if;
    if v_status in('below_cost','below_minimum') and char_length(v_reason)<2 then raise exception 'Explique a decisão de vender abaixo da margem protegida.' using errcode='22023';end if;
  end loop;

  -- v4 mantém toda a semântica consolidada de venda, recebíveis e concorrência.
  v_result:=public.apply_nat_transition_v4(p_business_id,p_request_id,p_operations);

  for v_op in select value from jsonb_array_elements(p_operations) loop
    if v_op->>'type'<>'create_sale' then continue;end if;
    v_payload:=coalesce(v_op->'payload','{}'::jsonb);
    if coalesce(v_payload->>'transactionType','sale')<>'sale' then continue;end if;
    v_sale_id:=(v_payload->>'id')::uuid;v_sold_at:=(v_payload->>'soldAt')::timestamptz;
    select packaging_format is not null into v_already_applied from public.sales where business_id=p_business_id and id=v_sale_id;
    if coalesce(v_already_applied,false) then continue;end if;
    select coalesce(sum(quantity),0) into v_units from public.sale_items where business_id=p_business_id and sale_id=v_sale_id;
    v_pack_cost:=private.consume_brigadeiro_packaging(p_business_id,v_sale_id,nullif(v_payload->>'packagingFormat',''),v_units,v_sold_at);
    if v_units>0 and v_pack_cost>0 then
      update public.sale_items
      set unit_cost_snapshot=unit_cost_snapshot+(v_pack_cost/v_units)
      where business_id=p_business_id and sale_id=v_sale_id;
    end if;
    update public.sales
    set packaging_format=v_payload->>'packagingFormat',
        packaging_cost_snapshot=v_pack_cost,
        contribution_snapshot=contribution_snapshot-v_pack_cost,
        updated_at=now()
    where business_id=p_business_id and id=v_sale_id;
    select updated_at::text into v_updated from public.sales where business_id=p_business_id and id=v_sale_id;
    v_result:=jsonb_set(v_result,array['sales',v_sale_id::text],to_jsonb(v_updated),true);
  end loop;
  return v_result;
end $$;

revoke all on function public.apply_nat_transition_v5(uuid,uuid,jsonb) from public,anon;
grant execute on function public.apply_nat_transition_v5(uuid,uuid,jsonb) to authenticated;

commit;

begin;

create or replace function public.save_business_settings_v4(
  p_business_id uuid,p_owner_name text,p_monthly_fixed_costs numeric,p_payment_fee_percent numeric,
  p_pix_fee_percent numeric,p_cash_fee_percent numeric,p_card_fee_percent numeric,
  p_default_minimum_margin_percent numeric,p_default_target_margin_percent numeric,
  p_owner_hourly_rate numeric,p_owner_daily_hours numeric,p_fixed_cost_funding_source text
) returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_fixed_cost_funding_source not in ('owner','business') then raise exception 'Origem dos custos fixos inválida.' using errcode='22023'; end if;
  perform public.save_business_settings_v3(p_business_id,p_owner_name,p_monthly_fixed_costs,p_payment_fee_percent,
    p_pix_fee_percent,p_cash_fee_percent,p_card_fee_percent,p_default_minimum_margin_percent,
    p_default_target_margin_percent,p_owner_hourly_rate,p_owner_daily_hours);
  update public.business_settings set fixed_cost_funding_source=p_fixed_cost_funding_source,updated_at=now()
  where business_id=p_business_id;
end $$;

create or replace function public.apply_nat_transition_v3(p_business_id uuid,p_request_id uuid,p_operations jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_op jsonb;v_type text;v_payload jsonb;v_id uuid;v_updated text;
  v_result jsonb:=jsonb_build_object('settings',null,'supplies','{}'::jsonb,'products','{}'::jsonb,'sales','{}'::jsonb,'expenses','{}'::jsonb,'inventoryChanged',false);
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  perform public.apply_nat_transition_v2(p_business_id,p_request_id,p_operations);
  for v_op in select value from jsonb_array_elements(p_operations) loop
    v_type:=v_op->>'type';v_payload:=coalesce(v_op->'payload','{}'::jsonb);v_updated:=null;
    if v_type='save_business_settings' then
      select updated_at::text into v_updated from public.business_settings where business_id=p_business_id;
      v_result:=jsonb_set(v_result,'{settings}',coalesce(to_jsonb(v_updated),'null'::jsonb));continue;
    end if;
    begin v_id:=(v_payload->>'id')::uuid;exception when others then v_id:=null;end;
    if v_id is null then continue;end if;
    if v_type in('save_supply','delete_supply') then
      select updated_at::text into v_updated from public.supplies where business_id=p_business_id and id=v_id;
      if v_updated is not null then v_result:=jsonb_set(v_result,array['supplies',v_id::text],to_jsonb(v_updated),true);end if;
      v_result:=jsonb_set(v_result,'{inventoryChanged}','true'::jsonb);
    elsif v_type in('save_product','archive_product') then
      select updated_at::text into v_updated from public.products where business_id=p_business_id and id=v_id;
      if v_updated is not null then v_result:=jsonb_set(v_result,array['products',v_id::text],to_jsonb(v_updated),true);end if;
      v_result:=jsonb_set(v_result,'{inventoryChanged}','true'::jsonb);
    elsif v_type in('create_sale','save_sale_items','cancel_sale') then
      select updated_at::text into v_updated from public.sales where business_id=p_business_id and id=v_id;
      if v_updated is not null then v_result:=jsonb_set(v_result,array['sales',v_id::text],to_jsonb(v_updated),true);end if;
      v_result:=jsonb_set(v_result,'{inventoryChanged}','true'::jsonb);
    elsif v_type in('save_sporadic_expense','delete_sporadic_expense') then
      select updated_at::text into v_updated from public.sporadic_expenses where business_id=p_business_id and id=v_id;
      if v_updated is not null then v_result:=jsonb_set(v_result,array['expenses',v_id::text],to_jsonb(v_updated),true);end if;
    end if;
  end loop;
  return v_result;
end $$;

commit;

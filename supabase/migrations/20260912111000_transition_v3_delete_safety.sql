begin;

create or replace function public.apply_nat_transition_v3(p_business_id uuid,p_request_id uuid,p_operations jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_op jsonb;v_type text;v_payload jsonb;v_id uuid;v_updated text;
  v_result jsonb:=jsonb_build_object('settings',null,'supplies','{}'::jsonb,'products','{}'::jsonb,'sales','{}'::jsonb,'expenses','{}'::jsonb,'inventoryChanged',false);
begin
  perform public.apply_nat_transition_v2(p_business_id,p_request_id,p_operations);
  for v_op in select value from jsonb_array_elements(p_operations) loop
    v_type:=v_op->>'type';v_payload:=coalesce(v_op->'payload','{}'::jsonb);v_updated:=null;
    if v_type='save_business_settings' then
      select updated_at::text into v_updated from public.business_settings where business_id=p_business_id;
      v_result:=jsonb_set(v_result,'{settings}',coalesce(to_jsonb(v_updated),'null'::jsonb));
      continue;
    end if;
    begin v_id:=(v_payload->>'id')::uuid;exception when others then v_id:=null;end;
    if v_id is null then continue; end if;
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

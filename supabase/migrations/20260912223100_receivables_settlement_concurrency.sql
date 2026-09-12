begin;

create or replace function public.mark_sale_paid_v1(
  p_business_id uuid,p_sale_id uuid,p_payment_method text,p_expected_updated_at text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_sale public.sales%rowtype;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_payment_method not in('pix','cash','card','other') then raise exception 'Forma de pagamento inválida.' using errcode='22023'; end if;
  if p_expected_updated_at is not null then
    perform private.assert_nat_version('sale',p_business_id,p_sale_id,p_expected_updated_at);
  end if;
  select * into v_sale from public.sales where business_id=p_business_id and id=p_sale_id for update;
  if not found then raise exception 'Venda não encontrada.' using errcode='P0002'; end if;
  if v_sale.status<>'completed' or v_sale.transaction_type<>'sale' then raise exception 'Somente venda concluída pode ser quitada.' using errcode='22023'; end if;
  if v_sale.payment_status='paid' then
    return jsonb_build_object('updatedAt',v_sale.updated_at,'amount',v_sale.total_received,'alreadyPaid',true);
  end if;
  update public.sales
  set payment_status='paid',total_received=sale_value_snapshot,payment_method=p_payment_method,paid_at=now(),updated_at=now()
  where business_id=p_business_id and id=p_sale_id
  returning * into v_sale;
  return jsonb_build_object('updatedAt',v_sale.updated_at,'amount',v_sale.total_received,'alreadyPaid',false);
end $$;

revoke all on function public.mark_sale_paid_v1(uuid,uuid,text,text) from public,anon;
grant execute on function public.mark_sale_paid_v1(uuid,uuid,text,text) to authenticated;

commit;

begin;

-- Settlement must use the actual payment method chosen at collection time.
-- The economic sale value remains frozen; only cash, fee and contribution are updated.
create or replace function public.mark_sale_paid_v1(
  p_business_id uuid,
  p_sale_id uuid,
  p_payment_method text,
  p_expected_updated_at text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_sale public.sales%rowtype;
  v_expected timestamptz;
  v_cost numeric:=0;
  v_fee_percent numeric:=0;
  v_fee numeric:=0;
  v_contribution numeric:=0;
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if p_payment_method not in('pix','cash','card','other') then
    raise exception 'Forma de pagamento inválida.' using errcode='22023';
  end if;

  select * into v_sale
  from public.sales
  where business_id=p_business_id and id=p_sale_id
  for update;
  if not found then raise exception 'Venda não encontrada.' using errcode='P0002'; end if;

  if p_expected_updated_at is not null then
    begin v_expected:=p_expected_updated_at::timestamptz;
    exception when others then
      raise exception 'CONFLICT: versão inválida para venda.' using errcode='40001';
    end;
    if v_sale.updated_at is distinct from v_expected then
      raise exception 'CONFLICT: venda foi alterada em outro aparelho.' using errcode='40001';
    end if;
  end if;

  if v_sale.status<>'completed' or v_sale.transaction_type<>'sale' then
    raise exception 'Somente venda concluída pode ser quitada.' using errcode='22023';
  end if;
  if v_sale.payment_status='paid' then
    return jsonb_build_object('updatedAt',v_sale.updated_at,'amount',v_sale.total_received,'alreadyPaid',true);
  end if;

  select coalesce(sum(si.unit_cost_snapshot*si.quantity),0)
  into v_cost
  from public.sale_items si
  where si.business_id=p_business_id and si.sale_id=p_sale_id;

  v_fee_percent:=coalesce(private.payment_fee_for_method(p_business_id,p_payment_method),0);
  v_fee:=v_sale.sale_value_snapshot*v_fee_percent/100;
  v_contribution:=v_sale.sale_value_snapshot-v_cost-v_fee-coalesce(v_sale.delivery_cost_snapshot,0);

  update public.sales set
    payment_status='paid',
    total_received=sale_value_snapshot,
    payment_method=p_payment_method,
    variable_fee_snapshot=v_fee,
    contribution_snapshot=v_contribution,
    paid_at=now(),
    updated_at=now()
  where business_id=p_business_id and id=p_sale_id
  returning * into v_sale;

  return jsonb_build_object(
    'updatedAt',v_sale.updated_at,
    'amount',v_sale.total_received,
    'variableFee',v_sale.variable_fee_snapshot,
    'contribution',v_sale.contribution_snapshot,
    'alreadyPaid',false
  );
end $$;

revoke all on function public.mark_sale_paid_v1(uuid,uuid,text,text) from public,anon;
grant execute on function public.mark_sale_paid_v1(uuid,uuid,text,text) to authenticated;

commit;

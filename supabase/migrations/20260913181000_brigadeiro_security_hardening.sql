begin;

-- quote_sale_v2 continua delegando o cálculo base para quote_sale_v1, mas mantém
-- sua própria guarda explícita porque é uma RPC SECURITY DEFINER exposta ao app.
create or replace function public.quote_sale_v2(
  p_business_id uuid,
  p_items jsonb,
  p_total_received numeric,
  p_payment_method text,
  p_sold_at timestamptz,
  p_transaction_type text default 'sale',
  p_delivery_cost numeric default 0,
  p_packaging_format text default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_base jsonb;v_pack numeric:=0;v_cost numeric;v_contribution numeric;v_fee numeric;
  v_min numeric;v_target numeric;v_min_required numeric;v_target_required numeric;
  v_status text;v_den numeric;
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;

  v_base:=public.quote_sale_v1(
    p_business_id,p_items,p_total_received,p_payment_method,p_sold_at,p_transaction_type,p_delivery_cost
  );
  if p_transaction_type='sale' then
    v_pack:=private.brigadeiro_packaging_cost(
      p_business_id,p_packaging_format,(v_base->>'totalQuantity')::numeric,
      (p_sold_at at time zone 'America/Sao_Paulo')::date
    );
  end if;

  v_cost:=(v_base->>'totalCost')::numeric+v_pack;
  v_contribution:=(v_base->>'contribution')::numeric-v_pack;
  v_fee:=coalesce(private.payment_fee_for_method(p_business_id,p_payment_method),0);
  v_min:=coalesce((v_base->>'minimumMarginPercent')::numeric,0);
  v_target:=coalesce((v_base->>'targetMarginPercent')::numeric,v_min);
  v_min_required:=(v_base->>'minimumRequiredValue')::numeric;
  v_target_required:=(v_base->>'recommendedRequiredValue')::numeric;

  if p_transaction_type='sale' and v_pack>0 then
    v_den:=1-(v_min+v_fee)/100;
    if v_den<=0 then
      raise exception 'Margem mínima e embalagem tornam a venda inviável.' using errcode='22023';
    end if;
    v_min_required:=v_min_required+v_pack/v_den;

    v_den:=1-(v_target+v_fee)/100;
    if v_den<=0 then
      raise exception 'Margem recomendada e embalagem tornam a venda inviável.' using errcode='22023';
    end if;
    v_target_required:=v_target_required+v_pack/v_den;
  end if;

  if p_transaction_type<>'sale' then
    v_status:='not_applicable';
  elsif v_contribution<0 then
    v_status:='below_cost';
  elsif p_total_received+0.005<v_min_required then
    v_status:='below_minimum';
  elsif p_total_received+0.005<v_target_required then
    v_status:='below_target';
  else
    v_status:='healthy';
  end if;

  return v_base||jsonb_build_object(
    'packagingCost',v_pack,
    'totalCost',v_cost,
    'contribution',v_contribution,
    'marginPercent',case when p_transaction_type='sale' and p_total_received>0 then v_contribution/p_total_received*100 else 0 end,
    'belowCost',(p_transaction_type='sale' and v_contribution<0),
    'minimumRequiredValue',v_min_required,
    'recommendedRequiredValue',v_target_required,
    'marginStatus',v_status
  );
end $$;

-- Helpers de implementação são privados; CREATE FUNCTION concede EXECUTE a
-- PUBLIC por padrão, então o hardening precisa ser explícito.
revoke all on function private.inventory_supply_balance(uuid,uuid) from public,anon,authenticated;
revoke all on function private.supply_unit_cost_at_date(uuid,uuid,date) from public,anon,authenticated;
revoke all on function private.mass_fifo_cost(uuid,uuid,numeric) from public,anon,authenticated;
revoke all on function private.consume_mass_layers(uuid,uuid,numeric) from public,anon,authenticated;
revoke all on function private.brigadeiro_packaging_cost(uuid,text,numeric,date) from public,anon,authenticated;
revoke all on function private.consume_brigadeiro_packaging(uuid,uuid,text,numeric,timestamptz) from public,anon,authenticated;

revoke all on function public.quote_sale_v2(uuid,jsonb,numeric,text,timestamptz,text,numeric,text) from public,anon;
grant execute on function public.quote_sale_v2(uuid,jsonb,numeric,text,timestamptz,text,numeric,text) to authenticated;

commit;

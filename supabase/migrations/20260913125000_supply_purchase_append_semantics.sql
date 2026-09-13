-- NAT Gestão — diferencia nova compra de edição para preservar compras idênticas no histórico.
-- A idempotência da operação é responsabilidade de apply_nat_transition_v2/request_id;
-- portanto uma nova compra legítima não pode ser descartada apenas por ter os mesmos valores da anterior.

create or replace function private.save_supply_v4(
  p_business_id uuid,
  p_id uuid,
  p_name text,
  p_category text,
  p_package_quantity numeric,
  p_package_unit text,
  p_package_price numeric,
  p_purchased_at date,
  p_funding_source text,
  p_equivalent_to_supply_id uuid default null,
  p_append_purchase boolean default false
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before_count bigint;
  v_after_count bigint;
begin
  select count(*) into v_before_count
  from public.supply_purchases
  where business_id=p_business_id and supply_id=p_id;

  perform private.save_supply_v3(
    p_business_id,p_id,p_name,p_category,p_package_quantity,p_package_unit,
    p_package_price,p_purchased_at,p_funding_source,p_equivalent_to_supply_id
  );

  if coalesce(p_append_purchase,false) then
    select count(*) into v_after_count
    from public.supply_purchases
    where business_id=p_business_id and supply_id=p_id;

    if v_after_count=v_before_count then
      insert into public.supply_purchases(
        business_id,supply_id,package_quantity,package_unit,package_price,purchased_at,funding_source
      ) values (
        p_business_id,p_id,p_package_quantity,p_package_unit,p_package_price,p_purchased_at,p_funding_source
      );
    end if;
  end if;
end;
$$;

revoke all on function private.save_supply_v4(uuid,uuid,text,text,numeric,text,numeric,date,text,uuid,boolean) from public, anon, authenticated;

create or replace function public.apply_nat_transition(p_business_id uuid, p_operations jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_operation jsonb;v_payload jsonb;v_type text;v_expected text;v_id uuid;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_operations is null or jsonb_typeof(p_operations)<>'array' then raise exception 'Operações inválidas.' using errcode='22023'; end if;
  if jsonb_array_length(p_operations)>500 then raise exception 'Muitas operações em uma única alteração.' using errcode='22023'; end if;
  for v_operation in select value from jsonb_array_elements(p_operations) loop
    v_type:=v_operation->>'type';v_payload:=coalesce(v_operation->'payload','{}'::jsonb);v_expected:=nullif(v_operation->>'expectedUpdatedAt','');
    if v_type='save_business_settings' then
      perform private.assert_nat_version('settings',p_business_id,null,v_expected);
      perform public.save_business_settings_v4(p_business_id,v_payload->>'ownerName',(v_payload->>'monthlyFixedCosts')::numeric,
        coalesce((v_payload->>'paymentFeePercent')::numeric,0),coalesce((v_payload->>'pixFeePercent')::numeric,0),
        coalesce((v_payload->>'cashFeePercent')::numeric,0),coalesce((v_payload->>'cardFeePercent')::numeric,0),
        (v_payload->>'defaultMinimumMarginPercent')::numeric,(v_payload->>'defaultTargetMarginPercent')::numeric,
        coalesce((v_payload->>'ownerHourlyRate')::numeric,20),coalesce((v_payload->>'ownerDailyHours')::numeric,3),
        coalesce(nullif(v_payload->>'fixedCostFundingSource',''),'owner'));continue;
    elsif v_type='save_customer' then
      perform public.save_customer(p_business_id,(v_payload->>'id')::uuid,v_payload->>'name',v_payload->>'phone',v_payload->>'instagram',v_payload->>'source',coalesce((v_payload->>'marketingConsent')::boolean,false),v_payload->>'notes',coalesce((v_payload->>'active')::boolean,true));continue;
    elsif v_type in ('create_sale','save_sale_items') then
      begin v_id:=(v_payload->>'id')::uuid;exception when others then raise exception 'Identificador inválido em %.',v_type using errcode='22023';end;
      perform private.assert_nat_version('sale',p_business_id,v_id,null);
      perform public.save_sale_items_v4(p_business_id,v_id,coalesce(v_payload->'items','[]'::jsonb),(v_payload->>'totalReceived')::numeric,v_payload->>'paymentMethod',(v_payload->>'soldAt')::timestamptz,nullif(v_payload->>'customerId','')::uuid,coalesce(nullif(v_payload->>'transactionType',''),'sale'),coalesce(nullif(v_payload->>'saleChannel',''),'other'),coalesce((v_payload->>'deliveryCost')::numeric,0),nullif(v_payload->>'discountReason',''),coalesce((v_payload->>'belowCostOverride')::boolean,false));continue;
    end if;
    begin v_id:=(v_payload->>'id')::uuid;exception when others then raise exception 'Identificador inválido em %.',coalesce(v_type,'operação') using errcode='22023';end;
    case v_type
      when 'cancel_sale' then perform private.assert_nat_version('sale',p_business_id,v_id,v_expected);perform public.cancel_sale(p_business_id,v_id,coalesce(nullif(v_payload->>'reason',''),'Cancelada pelo usuário'));
      when 'archive_product' then perform private.assert_nat_version('product',p_business_id,v_id,v_expected);perform public.archive_product(p_business_id,v_id);
      when 'delete_supply' then perform private.assert_nat_version('supply',p_business_id,v_id,v_expected);perform public.delete_supply(p_business_id,v_id);
      when 'delete_sporadic_expense' then perform private.assert_nat_version('expense',p_business_id,v_id,v_expected);perform public.delete_sporadic_expense(p_business_id,v_id);
      when 'delete_owner_cash_movement' then perform public.delete_owner_cash_movement(p_business_id,v_id);
      when 'save_owner_cash_movement' then perform public.save_owner_cash_movement(p_business_id,v_id,v_payload->>'movementType',(v_payload->>'amount')::numeric,(v_payload->>'occurredAt')::date,v_payload->>'note');
      when 'save_supply' then perform private.assert_nat_version('supply',p_business_id,v_id,v_expected);perform private.save_supply_v4(p_business_id,v_id,v_payload->>'name',v_payload->>'category',(v_payload->>'packageQuantity')::numeric,v_payload->>'packageUnit',(v_payload->>'packagePrice')::numeric,(v_payload->>'purchasedAt')::date,coalesce(nullif(v_payload->>'fundingSource',''),'owner'),nullif(v_payload->>'equivalentToSupplyId','')::uuid,coalesce((v_payload->>'appendPurchase')::boolean,false));
      when 'save_product' then perform private.assert_nat_version('product',p_business_id,v_id,v_expected);perform public.save_product_v2(p_business_id,v_id,v_payload->>'name',(v_payload->>'batchYield')::numeric,(v_payload->>'sellingPrice')::numeric,(v_payload->>'lossPercent')::numeric,coalesce((v_payload->>'laborCostPerBatch')::numeric,0),(v_payload->>'productionCostPerBatch')::numeric,(v_payload->>'minimumMarginPercent')::numeric,(v_payload->>'targetMarginPercent')::numeric,coalesce(v_payload->'recipe','[]'::jsonb),nullif(v_payload->>'portfolioKey',''));
      when 'save_sporadic_expense' then perform private.assert_nat_version('expense',p_business_id,v_id,v_expected);perform public.save_sporadic_expense_v2(p_business_id,v_id,v_payload->>'name',(v_payload->>'amount')::numeric,(v_payload->>'spentAt')::date,coalesce(nullif(v_payload->>'fundingSource',''),'owner'));
      else raise exception 'Operação não suportada: %.',coalesce(v_type,'(vazia)') using errcode='22023';
    end case;
  end loop;
end
$$;

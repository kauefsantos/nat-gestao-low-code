begin;

-- Business/finance hardening: keep startup capital separate from recurring owner
-- contributions and make the authoritative sale quote protect commercial margin.

alter table public.owner_cash_movements
  drop constraint if exists owner_cash_movements_movement_type_check;
alter table public.owner_cash_movements
  add constraint owner_cash_movements_movement_type_check
  check (movement_type in ('initial_capital','contribution','withdrawal'));

create unique index if not exists owner_cash_movements_single_initial_capital_idx
  on public.owner_cash_movements(business_id)
  where movement_type='initial_capital';

alter table public.sales
  add column if not exists margin_override boolean not null default false;

-- Existing below-cost exceptions are, by definition, also margin exceptions.
update public.sales
set margin_override=true
where below_cost_override=true and margin_override=false;

create or replace function public.save_owner_cash_movement(
  p_business_id uuid,
  p_id uuid,
  p_movement_type text,
  p_amount numeric,
  p_occurred_at date,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if p_id is null
     or p_movement_type not in ('initial_capital','contribution','withdrawal')
     or p_amount is null
     or p_amount<=0
     or p_occurred_at is null then
    raise exception 'Dados do movimento de caixa inválidos.' using errcode='22023';
  end if;

  insert into public.owner_cash_movements(
    id,business_id,movement_type,amount,occurred_at,note
  ) values(
    p_id,p_business_id,p_movement_type,p_amount,p_occurred_at,
    nullif(left(btrim(coalesce(p_note,'')),500),'')
  )
  on conflict(id) do update
  set movement_type=excluded.movement_type,
      amount=excluded.amount,
      occurred_at=excluded.occurred_at,
      note=excluded.note,
      updated_at=now()
  where public.owner_cash_movements.business_id=p_business_id;

  if not exists(
    select 1 from public.owner_cash_movements
    where business_id=p_business_id and id=p_id
  ) then
    raise exception 'Movimento pertence a outra empresa.' using errcode='42501';
  end if;
end;
$$;

create or replace function public.get_financial_funding_snapshot(
  p_business_id uuid,
  p_month_start date
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_initial_capital numeric:=0;
  v_owner_contributions numeric:=0;
  v_owner_withdrawals numeric:=0;
  v_owner_purchases numeric:=0;
  v_business_purchases numeric:=0;
  v_owner_expenses numeric:=0;
  v_business_expenses numeric:=0;
  v_month_owner_purchases numeric:=0;
  v_month_business_purchases numeric:=0;
  v_month_owner_expenses numeric:=0;
  v_month_business_expenses numeric:=0;
  v_month_owner numeric:=0;
  v_month_business numeric:=0;
  v_fixed numeric:=0;
  v_fixed_source text:='owner';
  v_supply_funding jsonb:='{}'::jsonb;
  v_expense_funding jsonb:='{}'::jsonb;
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;

  select
    coalesce(sum(amount) filter(where movement_type='initial_capital'),0),
    coalesce(sum(amount) filter(where movement_type='contribution'),0),
    coalesce(sum(amount) filter(where movement_type='withdrawal'),0)
  into v_initial_capital,v_owner_contributions,v_owner_withdrawals
  from public.owner_cash_movements
  where business_id=p_business_id;

  select
    coalesce(sum(package_price) filter(where funding_source='owner'),0),
    coalesce(sum(package_price) filter(where funding_source='business'),0),
    coalesce(sum(package_price) filter(where funding_source='owner' and purchased_at>=p_month_start and purchased_at<(p_month_start+interval '1 month')::date),0),
    coalesce(sum(package_price) filter(where funding_source='business' and purchased_at>=p_month_start and purchased_at<(p_month_start+interval '1 month')::date),0)
  into v_owner_purchases,v_business_purchases,v_month_owner_purchases,v_month_business_purchases
  from public.supply_purchases
  where business_id=p_business_id;

  select
    coalesce(sum(amount) filter(where funding_source='owner'),0),
    coalesce(sum(amount) filter(where funding_source='business'),0),
    coalesce(sum(amount) filter(where funding_source='owner' and spent_at>=p_month_start and spent_at<(p_month_start+interval '1 month')::date),0),
    coalesce(sum(amount) filter(where funding_source='business' and spent_at>=p_month_start and spent_at<(p_month_start+interval '1 month')::date),0)
  into v_owner_expenses,v_business_expenses,v_month_owner_expenses,v_month_business_expenses
  from public.sporadic_expenses
  where business_id=p_business_id;

  select coalesce(monthly_fixed_costs,0),coalesce(fixed_cost_funding_source,'owner')
  into v_fixed,v_fixed_source
  from public.business_settings
  where business_id=p_business_id;

  with latest as(
    select distinct on(supply_id) supply_id,funding_source
    from public.supply_purchases
    where business_id=p_business_id
    order by supply_id,purchased_at desc,created_at desc,id desc
  )
  select coalesce(jsonb_object_agg(supply_id::text,funding_source),'{}'::jsonb)
  into v_supply_funding
  from latest;

  select coalesce(jsonb_object_agg(id::text,funding_source),'{}'::jsonb)
  into v_expense_funding
  from public.sporadic_expenses
  where business_id=p_business_id
    and spent_at>=p_month_start
    and spent_at<(p_month_start+interval '1 month')::date;

  v_month_owner:=v_month_owner_purchases+v_month_owner_expenses;
  v_month_business:=v_month_business_purchases+v_month_business_expenses;
  if v_fixed_source='owner' then
    v_month_owner:=v_month_owner+v_fixed;
  else
    v_month_business:=v_month_business+v_fixed;
  end if;

  return jsonb_build_object(
    'initialCapital',v_initial_capital,
    'ownerContributions',v_owner_contributions,
    'ownerWithdrawals',v_owner_withdrawals,
    'ownerFundedOutflows',v_owner_purchases+v_owner_expenses,
    'businessReinvestment',v_business_purchases+v_business_expenses,
    'businessReinvestmentPurchases',v_business_purchases,
    'businessReinvestmentExpenses',v_business_expenses,
    'monthOwnerFundedOutflows',v_month_owner,
    'monthBusinessReinvestment',v_month_business,
    'fixedCostFundingSource',v_fixed_source,
    'supplyFunding',v_supply_funding,
    'expenseFunding',v_expense_funding
  );
end;
$$;

create or replace function public.quote_sale_v1(
  p_business_id uuid,
  p_items jsonb,
  p_total_received numeric,
  p_payment_method text,
  p_sold_at timestamptz,
  p_transaction_type text default 'sale',
  p_delivery_cost numeric default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id uuid;
  v_quantity numeric;
  v_unit_cost numeric;
  v_total_cost numeric:=0;
  v_total_list numeric:=0;
  v_total_quantity numeric:=0;
  v_fee_percent numeric:=0;
  v_variable_fee numeric:=0;
  v_delivery numeric:=0;
  v_contribution numeric:=0;
  v_sale_date date;
  v_seen uuid[]:=array[]::uuid[];
  v_min_required numeric:=0;
  v_target_required numeric:=0;
  v_min_margin numeric;
  v_target_margin numeric;
  v_max_min_margin numeric:=0;
  v_max_target_margin numeric:=0;
  v_denominator numeric;
  v_margin_status text:='healthy';
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if p_transaction_type not in ('sale','courtesy','personal_consumption','loss') then
    raise exception 'Tipo de movimentação inválido.' using errcode='22023';
  end if;
  if p_sold_at is null
     or p_total_received is null
     or p_total_received<0
     or p_payment_method not in ('pix','cash','card','other')
     or jsonb_typeof(coalesce(p_items,'null'::jsonb))<>'array'
     or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'Dados da movimentação inválidos.' using errcode='22023';
  end if;
  if p_transaction_type<>'sale' and p_total_received<>0 then
    raise exception 'Movimentações sem venda precisam ter valor recebido igual a zero.' using errcode='22023';
  end if;
  if coalesce(p_delivery_cost,0)<0 then
    raise exception 'O custo de entrega não pode ser negativo.' using errcode='22023';
  end if;
  if p_transaction_type<>'sale' and coalesce(p_delivery_cost,0)<>0 then
    raise exception 'Movimentações sem venda não podem ter custo de entrega.' using errcode='22023';
  end if;

  v_sale_date:=(p_sold_at at time zone 'America/Sao_Paulo')::date;
  v_fee_percent:=case when p_transaction_type='sale'
    then coalesce(private.payment_fee_for_method(p_business_id,p_payment_method),0)
    else 0 end;

  for v_item in select value from jsonb_array_elements(p_items) loop
    begin
      v_product_id:=nullif(v_item->>'productId','')::uuid;
      v_quantity:=nullif(v_item->>'quantity','')::numeric;
    exception when others then
      raise exception 'Item inválido.' using errcode='22023';
    end;

    if v_product_id is null or v_quantity is null or v_quantity<=0 or trunc(v_quantity)<>v_quantity then
      raise exception 'A quantidade de produtos acabados precisa ser inteira e maior que zero.' using errcode='22023';
    end if;
    if v_product_id=any(v_seen) then
      raise exception 'O mesmo produto não pode aparecer duas vezes.' using errcode='22023';
    end if;
    v_seen:=array_append(v_seen,v_product_id);

    select * into v_product
    from public.products
    where business_id=p_business_id and id=v_product_id and active=true;
    if not found then
      raise exception 'Produto não encontrado ou inativo.' using errcode='22023';
    end if;
    if p_transaction_type='sale' and v_product.available=false then
      raise exception 'Produto temporariamente indisponível para venda.' using errcode='22023';
    end if;

    v_unit_cost:=private.product_unit_cost_for_sale(p_business_id,v_product_id,v_quantity,v_sale_date);
    v_total_cost:=v_total_cost+(v_unit_cost*v_quantity);
    v_total_list:=v_total_list+(v_product.selling_price*v_quantity);
    v_total_quantity:=v_total_quantity+v_quantity;

    if p_transaction_type='sale' then
      v_min_margin:=greatest(0,coalesce(v_product.minimum_margin_percent,0));
      v_target_margin:=greatest(v_min_margin,coalesce(v_product.target_margin_percent,v_min_margin));

      v_denominator:=1-(v_min_margin+v_fee_percent)/100;
      if v_denominator<=0 then
        raise exception 'Margem mínima e taxa de pagamento tornam a venda inviável.' using errcode='22023';
      end if;
      v_min_required:=v_min_required+(v_unit_cost*v_quantity)/v_denominator;

      v_denominator:=1-(v_target_margin+v_fee_percent)/100;
      if v_denominator<=0 then
        raise exception 'Margem recomendada e taxa de pagamento tornam a venda inviável.' using errcode='22023';
      end if;
      v_target_required:=v_target_required+(v_unit_cost*v_quantity)/v_denominator;
      v_max_min_margin:=greatest(v_max_min_margin,v_min_margin);
      v_max_target_margin:=greatest(v_max_target_margin,v_target_margin);
    end if;
  end loop;

  v_delivery:=case when p_transaction_type='sale' then coalesce(p_delivery_cost,0) else 0 end;
  if p_transaction_type='sale' and v_delivery>0 then
    v_denominator:=1-(v_max_min_margin+v_fee_percent)/100;
    if v_denominator<=0 then
      raise exception 'A entrega torna a margem mínima inviável.' using errcode='22023';
    end if;
    v_min_required:=v_min_required+v_delivery/v_denominator;

    v_denominator:=1-(v_max_target_margin+v_fee_percent)/100;
    if v_denominator<=0 then
      raise exception 'A entrega torna a margem recomendada inviável.' using errcode='22023';
    end if;
    v_target_required:=v_target_required+v_delivery/v_denominator;
  end if;

  v_variable_fee:=case when p_transaction_type='sale' then p_total_received*v_fee_percent/100 else 0 end;
  v_contribution:=(case when p_transaction_type='sale' then p_total_received else 0 end)-v_total_cost-v_variable_fee-v_delivery;

  if p_transaction_type<>'sale' then
    v_margin_status:='not_applicable';
  elsif v_contribution<0 then
    v_margin_status:='below_cost';
  elsif p_total_received+0.005<v_min_required then
    v_margin_status:='below_minimum';
  elsif p_total_received+0.005<v_target_required then
    v_margin_status:='below_target';
  else
    v_margin_status:='healthy';
  end if;

  return jsonb_build_object(
    'listTotal',v_total_list,
    'totalCost',v_total_cost,
    'totalQuantity',v_total_quantity,
    'variableFee',v_variable_fee,
    'deliveryCost',v_delivery,
    'contribution',v_contribution,
    'marginPercent',case when p_transaction_type='sale' and p_total_received>0 then v_contribution/p_total_received*100 else 0 end,
    'belowCost',(p_transaction_type='sale' and v_contribution<0),
    'minimumRequiredValue',v_min_required,
    'recommendedRequiredValue',v_target_required,
    'minimumMarginPercent',v_max_min_margin,
    'targetMarginPercent',v_max_target_margin,
    'marginStatus',v_margin_status
  );
end;
$$;

create or replace function public.apply_nat_transition_v4(
  p_business_id uuid,
  p_request_id uuid,
  p_operations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
  v_op jsonb;
  v_type text;
  v_payload jsonb;
  v_id uuid;
  v_status text;
  v_customer uuid;
  v_promised_date date;
  v_promised_time time;
  v_sale_date date;
  v_due timestamptz;
  v_updated text;
  v_sale_value numeric;
  v_quote jsonb;
  v_margin_status text;
  v_margin_override boolean;
  v_below_cost_override boolean;
  v_reason text;
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;

  -- Preflight commercial margin before the V3 mutation writes the sale/items.
  for v_op in select value from jsonb_array_elements(p_operations) loop
    v_type:=v_op->>'type';
    if v_type<>'create_sale' then continue; end if;
    v_payload:=coalesce(v_op->'payload','{}'::jsonb);
    if coalesce(v_payload->>'transactionType','sale')<>'sale' then continue; end if;

    v_quote:=public.quote_sale_v1(
      p_business_id,
      coalesce(v_payload->'items','[]'::jsonb),
      coalesce(nullif(v_payload->>'saleValue','')::numeric,nullif(v_payload->>'totalReceived','')::numeric,0),
      coalesce(nullif(v_payload->>'paymentMethod',''),'other'),
      (v_payload->>'soldAt')::timestamptz,
      'sale',
      coalesce(nullif(v_payload->>'deliveryCost','')::numeric,0)
    );
    v_margin_status:=coalesce(v_quote->>'marginStatus','healthy');
    v_margin_override:=coalesce(nullif(v_payload->>'marginOverride','')::boolean,false);
    v_below_cost_override:=coalesce(nullif(v_payload->>'belowCostOverride','')::boolean,false);
    v_reason:=btrim(coalesce(v_payload->>'discountReason',''));

    if v_margin_status='below_cost' and not v_below_cost_override then
      raise exception 'Venda abaixo do custo exige confirmação explícita.' using errcode='22023';
    end if;
    if v_margin_status='below_minimum' and not v_margin_override then
      raise exception 'Venda abaixo da margem mínima exige confirmação explícita.' using errcode='22023';
    end if;
    if v_margin_status in('below_cost','below_minimum') and char_length(v_reason)<2 then
      raise exception 'Explique a decisão de vender abaixo da margem protegida.' using errcode='22023';
    end if;
  end loop;

  v_result:=public.apply_nat_transition_v3(p_business_id,p_request_id,p_operations);

  for v_op in select value from jsonb_array_elements(p_operations) loop
    v_type:=v_op->>'type';
    if v_type<>'create_sale' then continue; end if;
    v_payload:=coalesce(v_op->'payload','{}'::jsonb);
    v_id:=nullif(v_payload->>'id','')::uuid;
    if coalesce(v_payload->>'transactionType','sale')<>'sale' then continue; end if;

    v_status:=coalesce(nullif(v_payload->>'paymentStatus',''),'paid');
    if v_status not in('paid','pending') then
      raise exception 'Situação de pagamento inválida.' using errcode='22023';
    end if;
    v_sale_value:=coalesce(nullif(v_payload->>'saleValue','')::numeric,nullif(v_payload->>'totalReceived','')::numeric,0);
    if v_sale_value<0 then
      raise exception 'Valor da venda inválido.' using errcode='22023';
    end if;
    v_margin_override:=coalesce(nullif(v_payload->>'marginOverride','')::boolean,false)
      or coalesce(nullif(v_payload->>'belowCostOverride','')::boolean,false);

    if v_status='pending' then
      begin
        v_customer:=nullif(v_payload->>'customerId','')::uuid;
      exception when others then
        v_customer:=null;
      end;
      if v_customer is null then
        raise exception 'Venda fiada exige cliente cadastrado.' using errcode='22023';
      end if;
      v_promised_date:=nullif(v_payload->>'paymentPromisedDate','')::date;
      if v_promised_date is null then
        raise exception 'Informe a data prometida para pagamento.' using errcode='22023';
      end if;
      v_sale_date:=((v_payload->>'soldAt')::timestamptz at time zone 'America/Sao_Paulo')::date;
      if v_promised_date<v_sale_date then
        raise exception 'A data prometida não pode ser anterior à venda.' using errcode='22023';
      end if;
      v_promised_time:=nullif(v_payload->>'paymentPromisedTime','')::time;
      if v_promised_date=v_sale_date and v_promised_time is null then
        raise exception 'Quando o pagamento é prometido para o mesmo dia, informe o horário.' using errcode='22023';
      end if;
      v_due:=private.receivable_due_at(v_promised_date,v_promised_time);
      update public.sales
      set sale_value_snapshot=v_sale_value,
          total_received=0,
          payment_status='pending',
          payment_promised_date=v_promised_date,
          payment_promised_time=v_promised_time,
          payment_due_at=v_due,
          paid_at=null,
          payment_critical_at=null,
          margin_override=v_margin_override,
          updated_at=now()
      where business_id=p_business_id and id=v_id;
    else
      update public.sales
      set sale_value_snapshot=v_sale_value,
          total_received=v_sale_value,
          payment_status='paid',
          payment_promised_date=null,
          payment_promised_time=null,
          payment_due_at=null,
          paid_at=coalesce(paid_at,sold_at),
          payment_critical_at=null,
          margin_override=v_margin_override,
          updated_at=now()
      where business_id=p_business_id and id=v_id;
    end if;

    select updated_at::text into v_updated
    from public.sales
    where business_id=p_business_id and id=v_id;
    if v_updated is not null then
      v_result:=jsonb_set(v_result,array['sales',v_id::text],to_jsonb(v_updated),true);
    end if;
  end loop;

  return v_result;
end;
$$;

commit;

begin;

-- Explicitly distinguish owner-funded outflows from money reinvested by NAT.
alter table public.supply_purchases add column if not exists funding_source text not null default 'owner';
alter table public.sporadic_expenses add column if not exists funding_source text not null default 'owner';
alter table public.business_settings add column if not exists fixed_cost_funding_source text not null default 'owner';

do $$ begin
  if not exists(select 1 from pg_constraint where conname='supply_purchases_funding_source_check') then
    alter table public.supply_purchases add constraint supply_purchases_funding_source_check check (funding_source in ('owner','business'));
  end if;
  if not exists(select 1 from pg_constraint where conname='sporadic_expenses_funding_source_check') then
    alter table public.sporadic_expenses add constraint sporadic_expenses_funding_source_check check (funding_source in ('owner','business'));
  end if;
  if not exists(select 1 from pg_constraint where conname='business_settings_fixed_cost_funding_source_check') then
    alter table public.business_settings add constraint business_settings_fixed_cost_funding_source_check check (fixed_cost_funding_source in ('owner','business'));
  end if;
end $$;

create index if not exists supply_purchases_business_funding_date_idx
  on public.supply_purchases(business_id,funding_source,purchased_at desc);
create index if not exists sporadic_expenses_business_funding_date_idx
  on public.sporadic_expenses(business_id,funding_source,spent_at desc);
create index if not exists inventory_movements_business_supply_idx
  on public.inventory_movements(business_id,supply_id,occurred_at desc) where supply_id is not null;
create index if not exists inventory_movements_business_product_idx
  on public.inventory_movements(business_id,product_id,occurred_at desc) where product_id is not null;

create or replace function public.save_supply_v2(
  p_business_id uuid,p_id uuid,p_name text,p_category text,p_package_quantity numeric,
  p_package_unit text,p_package_price numeric,p_purchased_at date,p_funding_source text
) returns void language plpgsql security definer set search_path='' as $$
declare v_latest record;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_id is null or char_length(btrim(coalesce(p_name,''))) not between 1 and 160
     or p_category not in ('ingredient','packaging','other') or p_package_quantity is null or p_package_quantity<=0
     or p_package_unit not in ('g','kg','ml','l','unit') or p_package_price is null or p_package_price<0
     or p_purchased_at is null or p_funding_source not in ('owner','business') then
    raise exception 'Dados da compra inválidos.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':supply-save:'||p_id::text,0));
  insert into public.supplies(id,business_id,name,category,active)
  values(p_id,p_business_id,btrim(p_name),p_category,true)
  on conflict(id) do update set name=excluded.name,category=excluded.category,active=true
  where public.supplies.business_id=p_business_id;
  if not exists(select 1 from public.supplies where id=p_id and business_id=p_business_id) then
    raise exception 'O identificador do item pertence a outra empresa.' using errcode='42501';
  end if;
  select sp.package_quantity,sp.package_unit,sp.package_price,sp.purchased_at,sp.funding_source into v_latest
  from public.supply_purchases sp where sp.business_id=p_business_id and sp.supply_id=p_id
  order by sp.purchased_at desc,sp.created_at desc,sp.id desc limit 1;
  if v_latest is null or v_latest.package_quantity is distinct from p_package_quantity
     or v_latest.package_unit is distinct from p_package_unit or v_latest.package_price is distinct from p_package_price
     or v_latest.purchased_at is distinct from p_purchased_at or v_latest.funding_source is distinct from p_funding_source then
    insert into public.supply_purchases(business_id,supply_id,package_quantity,package_unit,package_price,purchased_at,funding_source)
    values(p_business_id,p_id,p_package_quantity,p_package_unit,p_package_price,p_purchased_at,p_funding_source);
  end if;
end $$;

create or replace function public.save_sporadic_expense_v2(
  p_business_id uuid,p_id uuid,p_name text,p_amount numeric,p_spent_at date,p_funding_source text
) returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_id is null or char_length(btrim(coalesce(p_name,''))) not between 1 and 160
     or p_amount is null or p_amount<0 or p_spent_at is null or p_funding_source not in ('owner','business') then
    raise exception 'Dados do gasto inválidos.' using errcode='22023';
  end if;
  insert into public.sporadic_expenses(id,business_id,name,amount,spent_at,funding_source)
  values(p_id,p_business_id,btrim(p_name),p_amount,p_spent_at,p_funding_source)
  on conflict(id) do update set name=excluded.name,amount=excluded.amount,spent_at=excluded.spent_at,
    funding_source=excluded.funding_source,updated_at=now()
  where public.sporadic_expenses.business_id=p_business_id;
  if not exists(select 1 from public.sporadic_expenses where id=p_id and business_id=p_business_id) then
    raise exception 'O identificador do gasto pertence a outra empresa.' using errcode='42501';
  end if;
end $$;

create or replace function public.save_business_settings_v4(
  p_business_id uuid,p_owner_name text,p_monthly_fixed_costs numeric,p_payment_fee_percent numeric,
  p_pix_fee_percent numeric,p_cash_fee_percent numeric,p_card_fee_percent numeric,
  p_default_minimum_margin_percent numeric,p_default_target_margin_percent numeric,
  p_owner_hourly_rate numeric,p_owner_daily_hours numeric,p_fixed_cost_funding_source text
) returns void language plpgsql security definer set search_path='' as $$
begin
  if p_fixed_cost_funding_source not in ('owner','business') then raise exception 'Origem dos custos fixos inválida.' using errcode='22023'; end if;
  perform public.save_business_settings_v3(p_business_id,p_owner_name,p_monthly_fixed_costs,p_payment_fee_percent,
    p_pix_fee_percent,p_cash_fee_percent,p_card_fee_percent,p_default_minimum_margin_percent,
    p_default_target_margin_percent,p_owner_hourly_rate,p_owner_daily_hours);
  update public.business_settings set fixed_cost_funding_source=p_fixed_cost_funding_source,updated_at=now()
  where business_id=p_business_id;
end $$;

-- Operational purchase snapshot: compact latest purchase + split of current-month funding.
create or replace function public.get_supply_purchase_snapshot(p_business_id uuid,p_month_start date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_latest jsonb;v_month_cash numeric;v_owner numeric;v_business numeric;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  with latest as (
    select distinct on(sp.supply_id) sp.supply_id,sp.package_quantity,sp.package_unit,sp.package_price,
      sp.purchased_at,sp.funding_source,sp.created_at,sp.id
    from public.supply_purchases sp where sp.business_id=p_business_id
    order by sp.supply_id,sp.purchased_at desc,sp.created_at desc,sp.id desc
  )
  select coalesce(jsonb_agg(jsonb_build_object('supplyId',supply_id,'packageQuantity',package_quantity,
    'packageUnit',package_unit,'packagePrice',package_price,'purchasedAt',purchased_at,'fundingSource',funding_source)),'[]'::jsonb)
  into v_latest from latest;
  select coalesce(sum(sp.package_price),0),
    coalesce(sum(sp.package_price) filter(where sp.funding_source='owner'),0),
    coalesce(sum(sp.package_price) filter(where sp.funding_source='business'),0)
  into v_month_cash,v_owner,v_business from public.supply_purchases sp
  where sp.business_id=p_business_id and sp.purchased_at>=p_month_start
    and sp.purchased_at<(p_month_start+interval '1 month')::date;
  return jsonb_build_object('latest',v_latest,'monthCashOut',v_month_cash,
    'monthOwnerFundedCashOut',v_owner,'monthBusinessReinvestmentCashOut',v_business);
end $$;

create or replace function public.get_financial_funding_snapshot(p_business_id uuid,p_month_start date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_owner_contributions numeric;v_owner_withdrawals numeric;v_owner_purchases numeric;v_business_purchases numeric;
  v_owner_expenses numeric;v_business_expenses numeric;v_month_owner numeric;v_month_business numeric;
  v_fixed numeric;v_fixed_source text;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  select coalesce(sum(amount) filter(where movement_type='contribution'),0),coalesce(sum(amount) filter(where movement_type='withdrawal'),0)
    into v_owner_contributions,v_owner_withdrawals from public.owner_cash_movements where business_id=p_business_id;
  select coalesce(sum(package_price) filter(where funding_source='owner'),0),coalesce(sum(package_price) filter(where funding_source='business'),0),
    coalesce(sum(package_price) filter(where funding_source='owner' and purchased_at>=p_month_start and purchased_at<(p_month_start+interval '1 month')::date),0),
    coalesce(sum(package_price) filter(where funding_source='business' and purchased_at>=p_month_start and purchased_at<(p_month_start+interval '1 month')::date),0)
    into v_owner_purchases,v_business_purchases,v_month_owner,v_month_business from public.supply_purchases where business_id=p_business_id;
  select coalesce(sum(amount) filter(where funding_source='owner'),0),coalesce(sum(amount) filter(where funding_source='business'),0),
    coalesce(sum(amount) filter(where funding_source='owner' and spent_at>=p_month_start and spent_at<(p_month_start+interval '1 month')::date),0),
    coalesce(sum(amount) filter(where funding_source='business' and spent_at>=p_month_start and spent_at<(p_month_start+interval '1 month')::date),0)
    into v_owner_expenses,v_business_expenses,v_owner_expenses,v_business_expenses from public.sporadic_expenses where business_id=p_business_id;
  -- Re-read month expense values separately to keep all-time values intact.
  select coalesce(sum(amount) filter(where funding_source='owner'),0),coalesce(sum(amount) filter(where funding_source='business'),0)
    into strict v_owner_expenses,v_business_expenses from public.sporadic_expenses where business_id=p_business_id;
  select coalesce(monthly_fixed_costs,0),coalesce(fixed_cost_funding_source,'owner') into v_fixed,v_fixed_source
    from public.business_settings where business_id=p_business_id;
  select
    v_month_owner + coalesce(sum(amount) filter(where funding_source='owner' and spent_at>=p_month_start and spent_at<(p_month_start+interval '1 month')::date),0),
    v_month_business + coalesce(sum(amount) filter(where funding_source='business' and spent_at>=p_month_start and spent_at<(p_month_start+interval '1 month')::date),0)
    into v_month_owner,v_month_business from public.sporadic_expenses where business_id=p_business_id;
  if v_fixed_source='owner' then v_month_owner:=v_month_owner+v_fixed; else v_month_business:=v_month_business+v_fixed; end if;
  return jsonb_build_object(
    'ownerContributions',v_owner_contributions,'ownerWithdrawals',v_owner_withdrawals,
    'ownerFundedOutflows',v_owner_purchases+v_owner_expenses,
    'businessReinvestment',v_business_purchases+v_business_expenses,
    'businessReinvestmentPurchases',v_business_purchases,'businessReinvestmentExpenses',v_business_expenses,
    'monthOwnerFundedOutflows',v_month_owner,'monthBusinessReinvestment',v_month_business,
    'fixedCostFundingSource',v_fixed_source
  );
end $$;

-- Inventory snapshot: aggregate movement ledger once instead of repeatedly invoking balance subqueries per item.
create or replace function public.get_inventory_snapshot(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_items jsonb;v_movements jsonb;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  with balances as (
    select supply_id,product_id,sum(quantity_delta) as quantity,max(occurred_at) as last_movement_at
    from public.inventory_movements where business_id=p_business_id group by supply_id,product_id
  ), item_rows as (
    select case s.category when 'ingredient' then 1 when 'packaging' then 2 else 3 end as sort_order,s.name,
      jsonb_build_object('kind','supply','itemId',s.id,'name',s.name,'category',s.category,'tracked',(t.id is not null),
        'currentQuantity',case when t.id is null then 0 else coalesce(b.quantity,0) end,'minimumQuantity',coalesce(t.minimum_quantity,0),
        'baseUnit',coalesce(t.base_unit,case private.unit_dimension(lp.package_unit) when 'mass' then 'g' when 'volume' then 'ml' else 'unit' end),
        'lowStock',case when t.id is null then false else coalesce(b.quantity,0)<=t.minimum_quantity end,'lastMovementAt',b.last_movement_at) as row_data
    from public.supplies s
    left join public.inventory_tracking t on t.business_id=s.business_id and t.supply_id=s.id
    left join balances b on b.supply_id=s.id and b.product_id is null
    left join lateral(select sp.package_unit from public.supply_purchases sp where sp.business_id=s.business_id and sp.supply_id=s.id order by sp.purchased_at desc,sp.created_at desc,sp.id desc limit 1) lp on true
    where s.business_id=p_business_id and s.active=true
    union all
    select 0,p.name,jsonb_build_object('kind','product','itemId',p.id,'name',p.name,'category','product','tracked',(t.id is not null),
      'currentQuantity',case when t.id is null then 0 else coalesce(b.quantity,0) end,'minimumQuantity',coalesce(t.minimum_quantity,0),
      'baseUnit','unit','lowStock',case when t.id is null then false else coalesce(b.quantity,0)<=t.minimum_quantity end,'lastMovementAt',b.last_movement_at)
    from public.products p
    left join public.inventory_tracking t on t.business_id=p.business_id and t.product_id=p.id
    left join balances b on b.product_id=p.id and b.supply_id is null
    where p.business_id=p_business_id and p.active=true
  ) select coalesce(jsonb_agg(row_data order by sort_order,name),'[]'::jsonb) into v_items from item_rows;
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'kind',case when m.product_id is not null then 'product' else 'supply' end,
    'itemId',coalesce(m.product_id,m.supply_id),'itemName',coalesce(p.name,s.name,'Item'),'quantityDelta',m.quantity_delta,
    'baseUnit',m.base_unit,'movementType',m.movement_type,'note',m.note,'occurredAt',m.occurred_at)
    order by m.occurred_at desc,m.created_at desc),'[]'::jsonb) into v_movements
  from (select id,business_id,supply_id,product_id,quantity_delta,base_unit,movement_type,note,occurred_at,created_at
        from public.inventory_movements where business_id=p_business_id order by occurred_at desc,created_at desc limit 60) m
  left join public.products p on p.business_id=m.business_id and p.id=m.product_id
  left join public.supplies s on s.business_id=m.business_id and s.id=m.supply_id;
  return jsonb_build_object('items',v_items,'movements',v_movements);
end $$;

create or replace function public.list_expenses_page(p_business_id uuid,p_limit integer default 30,p_before_spent_at date default null,p_before_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_limit integer:=least(greatest(coalesce(p_limit,30),1),100);v_items jsonb:='[]'::jsonb;v_has_more boolean:=false;v_date date;v_id uuid;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if (p_before_spent_at is null)<>(p_before_id is null) then raise exception 'Cursor incompleto.' using errcode='22023'; end if;
  with page as(select id,name,amount,spent_at,funding_source,updated_at from public.sporadic_expenses where business_id=p_business_id
    and (p_before_spent_at is null or (spent_at,id)<(p_before_spent_at,p_before_id)) order by spent_at desc,id desc limit v_limit+1),
  trimmed as(select * from page order by spent_at desc,id desc limit v_limit)
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'amount',amount,'spentAt',spent_at,
    'fundingSource',funding_source,'updatedAt',updated_at) order by spent_at desc,id desc),'[]'::jsonb) into v_items from trimmed;
  with page as(select spent_at,id from public.sporadic_expenses where business_id=p_business_id
    and (p_before_spent_at is null or (spent_at,id)<(p_before_spent_at,p_before_id)) order by spent_at desc,id desc limit v_limit+1),
  trimmed as(select * from page order by spent_at desc,id desc limit v_limit)
  select (select count(*)>v_limit from page),spent_at,id into v_has_more,v_date,v_id from trimmed order by spent_at asc,id asc limit 1;
  return jsonb_build_object('items',v_items,'hasMore',coalesce(v_has_more,false),'nextCursor',case when v_has_more then jsonb_build_object('spentAt',v_date,'id',v_id) else null end);
end $$;

-- Transition v3 is backward compatible with v2 and returns only version tokens for changed rows.
create or replace function public.apply_nat_transition_v3(p_business_id uuid,p_request_id uuid,p_operations jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_op jsonb;v_type text;v_payload jsonb;v_id uuid;v_result jsonb:=jsonb_build_object('settings',null,'supplies','{}'::jsonb,'products','{}'::jsonb,'sales','{}'::jsonb,'expenses','{}'::jsonb,'inventoryChanged',false);
begin
  perform public.apply_nat_transition_v2(p_business_id,p_request_id,p_operations);
  for v_op in select value from jsonb_array_elements(p_operations) loop
    v_type:=v_op->>'type';v_payload:=coalesce(v_op->'payload','{}'::jsonb);
    if v_type='save_business_settings' then
      v_result:=jsonb_set(v_result,'{settings}',to_jsonb((select updated_at::text from public.business_settings where business_id=p_business_id)));
      continue;
    end if;
    begin v_id:=(v_payload->>'id')::uuid;exception when others then v_id:=null;end;
    if v_type in('save_supply','delete_supply') then
      v_result:=jsonb_set(v_result,array['supplies',coalesce(v_id::text,'')],to_jsonb((select updated_at::text from public.supplies where business_id=p_business_id and id=v_id)),true);
      v_result:=jsonb_set(v_result,'{inventoryChanged}','true'::jsonb);
    elsif v_type in('save_product','archive_product') then
      v_result:=jsonb_set(v_result,array['products',coalesce(v_id::text,'')],to_jsonb((select updated_at::text from public.products where business_id=p_business_id and id=v_id)),true);
      v_result:=jsonb_set(v_result,'{inventoryChanged}','true'::jsonb);
    elsif v_type in('create_sale','save_sale_items','cancel_sale') then
      v_result:=jsonb_set(v_result,array['sales',coalesce(v_id::text,'')],to_jsonb((select updated_at::text from public.sales where business_id=p_business_id and id=v_id)),true);
      v_result:=jsonb_set(v_result,'{inventoryChanged}','true'::jsonb);
    elsif v_type in('save_sporadic_expense','delete_sporadic_expense') then
      v_result:=jsonb_set(v_result,array['expenses',coalesce(v_id::text,'')],to_jsonb((select updated_at::text from public.sporadic_expenses where business_id=p_business_id and id=v_id)),true);
    end if;
  end loop;
  return v_result;
end $$;

-- Replace the dispatcher so new clients can send fundingSource while old payloads default safely to owner.
create or replace function public.apply_nat_transition(p_business_id uuid,p_operations jsonb)
returns void language plpgsql security definer set search_path='' as $$
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
    elsif v_type in('create_sale','save_sale_items') then
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
      when 'save_supply' then perform private.assert_nat_version('supply',p_business_id,v_id,v_expected);perform public.save_supply_v2(p_business_id,v_id,v_payload->>'name',v_payload->>'category',(v_payload->>'packageQuantity')::numeric,v_payload->>'packageUnit',(v_payload->>'packagePrice')::numeric,(v_payload->>'purchasedAt')::date,coalesce(nullif(v_payload->>'fundingSource',''),'owner'));
      when 'save_product' then perform private.assert_nat_version('product',p_business_id,v_id,v_expected);perform public.save_product_v2(p_business_id,v_id,v_payload->>'name',(v_payload->>'batchYield')::numeric,(v_payload->>'sellingPrice')::numeric,(v_payload->>'lossPercent')::numeric,coalesce((v_payload->>'laborCostPerBatch')::numeric,0),(v_payload->>'productionCostPerBatch')::numeric,(v_payload->>'minimumMarginPercent')::numeric,(v_payload->>'targetMarginPercent')::numeric,coalesce(v_payload->'recipe','[]'::jsonb),nullif(v_payload->>'portfolioKey',''));
      when 'save_sporadic_expense' then perform private.assert_nat_version('expense',p_business_id,v_id,v_expected);perform public.save_sporadic_expense_v2(p_business_id,v_id,v_payload->>'name',(v_payload->>'amount')::numeric,(v_payload->>'spentAt')::date,coalesce(nullif(v_payload->>'fundingSource',''),'owner'));
      else raise exception 'Operação não suportada: %.',coalesce(v_type,'(vazia)') using errcode='22023';
    end case;
  end loop;
end $$;

revoke all on function public.save_supply_v2(uuid,uuid,text,text,numeric,text,numeric,date,text) from public,anon;
revoke all on function public.save_sporadic_expense_v2(uuid,uuid,text,numeric,date,text) from public,anon;
revoke all on function public.save_business_settings_v4(uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text) from public,anon;
revoke all on function public.get_financial_funding_snapshot(uuid,date) from public,anon;
revoke all on function public.apply_nat_transition_v3(uuid,uuid,jsonb) from public,anon;
grant execute on function public.save_supply_v2(uuid,uuid,text,text,numeric,text,numeric,date,text) to authenticated;
grant execute on function public.save_sporadic_expense_v2(uuid,uuid,text,numeric,date,text) to authenticated;
grant execute on function public.save_business_settings_v4(uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text) to authenticated;
grant execute on function public.get_financial_funding_snapshot(uuid,date) to authenticated;
grant execute on function public.apply_nat_transition_v3(uuid,uuid,jsonb) to authenticated;

commit;

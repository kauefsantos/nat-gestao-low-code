begin;

-- Stage 3 — Purchases & Inventory Integrity.
-- Explicit purchase semantics, immutable-ledger compensation, business-date timestamps,
-- and atomic/idempotent product stock targets.

update private.nat_schema_release
set version='2026-09-13.purchases-inventory-integrity.1', applied_at=now()
where singleton=true;

create or replace function private.nat_business_date_start(p_date date)
returns timestamptz
language sql
immutable
set search_path=''
as $$
  select p_date::timestamp at time zone 'America/Sao_Paulo'
$$;
revoke all on function private.nat_business_date_start(date) from public,anon,authenticated;

-- Expose the exact latest purchase identity so an edit can correct that row instead
-- of being misinterpreted as another physical purchase.
create or replace function public.get_supply_purchase_snapshot(p_business_id uuid,p_month_start date)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_latest jsonb;v_month_cash numeric;v_owner numeric;v_business numeric;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  with latest as (
    select distinct on(sp.supply_id)
      sp.id as purchase_id,sp.supply_id,sp.package_quantity,sp.package_unit,sp.package_price,
      sp.purchased_at,sp.funding_source,sp.created_at
    from public.supply_purchases sp
    where sp.business_id=p_business_id
    order by sp.supply_id,sp.purchased_at desc,sp.created_at desc,sp.id desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'purchaseId',purchase_id,'supplyId',supply_id,'packageQuantity',package_quantity,
    'packageUnit',package_unit,'packagePrice',package_price,'purchasedAt',purchased_at,'fundingSource',funding_source
  )),'[]'::jsonb)
  into v_latest from latest;

  select coalesce(sum(sp.package_price),0),
    coalesce(sum(sp.package_price) filter(where sp.funding_source='owner'),0),
    coalesce(sum(sp.package_price) filter(where sp.funding_source='business'),0)
  into v_month_cash,v_owner,v_business
  from public.supply_purchases sp
  where sp.business_id=p_business_id and sp.purchased_at>=p_month_start
    and sp.purchased_at<(p_month_start+interval '1 month')::date;

  return jsonb_build_object(
    'latest',v_latest,'monthCashOut',v_month_cash,
    'monthOwnerFundedCashOut',v_owner,'monthBusinessReinvestmentCashOut',v_business
  );
end;
$$;

-- Purchases always land on their business date, independent from the database/session timezone.
create or replace function private.inventory_after_purchase()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_tracking public.inventory_tracking%rowtype;v_quantity numeric;
begin
  select * into v_tracking from public.inventory_tracking t
  where t.business_id=new.business_id and t.supply_id=new.supply_id;
  if not found then return new; end if;
  if private.unit_dimension(new.package_unit)<>private.unit_dimension(v_tracking.base_unit) then
    raise exception 'A unidade da compra é incompatível com o estoque configurado.' using errcode='22023';
  end if;
  v_quantity:=private.unit_base_amount(new.package_quantity,new.package_unit);
  insert into public.inventory_movements(
    business_id,supply_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at,created_by
  ) values(
    new.business_id,new.supply_id,v_quantity,v_tracking.base_unit,'purchase','purchase:'||new.id::text,
    'Compra registrada',private.nat_business_date_start(new.purchased_at),auth.uid()
  ) on conflict (business_id,source_key) where source_key is not null do nothing;
  return new;
end;
$$;
revoke all on function private.inventory_after_purchase() from public,anon,authenticated;

-- One explicit contract for a supply write:
-- append   = a new physical purchase (always appends history and stock),
-- correct  = correct the exact latest purchase without inventing another purchase,
-- metadata = change only the supply identity, never purchase history.
create or replace function private.save_supply_v5(
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
  p_purchase_mode text default 'append',
  p_purchase_id uuid default null
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_duplicate_id uuid;
  v_tracking public.inventory_tracking%rowtype;
  v_name_key text:=lower(regexp_replace(btrim(coalesce(p_name,'')),'\s+',' ','g'));
  v_latest_id uuid;
  v_latest_unit text;
  v_purchase public.supply_purchases%rowtype;
  v_purchase_movement public.inventory_movements%rowtype;
  v_old_base numeric;
  v_new_base numeric;
  v_request uuid;
  v_correction_key text;
begin
  if p_id is null or char_length(btrim(coalesce(p_name,''))) not between 1 and 160
     or p_category not in('ingredient','packaging','other')
     or p_package_quantity is null or p_package_quantity<=0
     or p_package_unit not in('g','kg','ml','l','unit')
     or p_package_price is null or p_package_price<0
     or p_purchased_at is null or p_funding_source not in('owner','business')
     or p_purchase_mode not in('append','correct','metadata') then
    raise exception 'Dados da compra inválidos.' using errcode='22023';
  end if;

  select id into v_duplicate_id
  from public.supplies
  where business_id=p_business_id and id<>p_id and active=true
    and lower(regexp_replace(btrim(name),'\s+',' ','g'))=v_name_key
  limit 1;
  if v_duplicate_id is not null then
    raise exception 'Esse insumo já existe. Registre a nova compra no cadastro existente para preservar o histórico.' using errcode='22023';
  end if;

  if p_equivalent_to_supply_id=p_id then p_equivalent_to_supply_id:=null; end if;
  if p_equivalent_to_supply_id is not null and p_category<>'ingredient' then
    raise exception 'Somente ingredientes podem substituir outro ingrediente nas receitas.' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':supply-save:'||p_id::text,0));

  select sp.id,sp.package_unit into v_latest_id,v_latest_unit
  from public.supply_purchases sp
  where sp.business_id=p_business_id and sp.supply_id=p_id
  order by sp.purchased_at desc,sp.created_at desc,sp.id desc
  limit 1;

  if v_latest_unit is not null
     and private.unit_dimension(v_latest_unit)<>private.unit_dimension(p_package_unit) then
    raise exception 'A unidade desta compra é incompatível com o histórico do insumo. Cadastre outro item para mudar de dimensão.' using errcode='22023';
  end if;

  insert into public.supplies(id,business_id,name,category,active)
  values(p_id,p_business_id,btrim(p_name),p_category,true)
  on conflict(id) do update set name=excluded.name,category=excluded.category,active=true
  where public.supplies.business_id=p_business_id;

  if not exists(select 1 from public.supplies where id=p_id and business_id=p_business_id) then
    raise exception 'O identificador do item pertence a outra empresa.' using errcode='42501';
  end if;

  -- If the new brand replaces a tracked ingredient, inherit tracking before an appended purchase.
  if p_equivalent_to_supply_id is not null then
    select * into v_tracking
    from public.inventory_tracking
    where business_id=p_business_id and supply_id=p_equivalent_to_supply_id;
    if found and not exists(
      select 1 from public.inventory_tracking where business_id=p_business_id and supply_id=p_id
    ) then
      if private.unit_dimension(p_package_unit)<>private.unit_dimension(v_tracking.base_unit) then
        raise exception 'A unidade da nova marca é incompatível com o estoque do ingrediente substituído.' using errcode='22023';
      end if;
      insert into public.inventory_tracking(business_id,supply_id,base_unit,minimum_quantity)
      values(p_business_id,p_id,v_tracking.base_unit,v_tracking.minimum_quantity);
    end if;
  end if;

  select * into v_tracking
  from public.inventory_tracking
  where business_id=p_business_id and supply_id=p_id;
  if found and private.unit_dimension(p_package_unit)<>private.unit_dimension(v_tracking.base_unit) then
    raise exception 'A unidade da compra é incompatível com o estoque configurado.' using errcode='22023';
  end if;

  if p_purchase_mode='append' then
    insert into public.supply_purchases(
      business_id,supply_id,package_quantity,package_unit,package_price,purchased_at,funding_source
    ) values(
      p_business_id,p_id,p_package_quantity,p_package_unit,p_package_price,p_purchased_at,p_funding_source
    );
  elsif p_purchase_mode='correct' then
    if p_purchase_id is null then
      raise exception 'Identifique a compra que será corrigida.' using errcode='22023';
    end if;
    if v_latest_id is distinct from p_purchase_id then
      raise exception 'A compra mudou desde que esta tela foi aberta. Atualize os dados antes de corrigir.' using errcode='40001';
    end if;

    select * into v_purchase
    from public.supply_purchases
    where id=p_purchase_id and business_id=p_business_id and supply_id=p_id
    for update;
    if not found then raise exception 'Compra não encontrada.' using errcode='P0002'; end if;
    if private.unit_dimension(v_purchase.package_unit)<>private.unit_dimension(p_package_unit) then
      raise exception 'A unidade corrigida precisa manter a mesma dimensão da compra original.' using errcode='22023';
    end if;

    select * into v_purchase_movement
    from public.inventory_movements
    where business_id=p_business_id and supply_id=p_id
      and source_key='purchase:'||p_purchase_id::text
    limit 1;

    v_old_base:=private.unit_base_amount(v_purchase.package_quantity,v_purchase.package_unit);
    v_new_base:=private.unit_base_amount(p_package_quantity,p_package_unit);

    update public.supply_purchases
    set package_quantity=p_package_quantity,
        package_unit=p_package_unit,
        package_price=p_package_price,
        purchased_at=p_purchased_at,
        funding_source=p_funding_source
    where id=p_purchase_id and business_id=p_business_id and supply_id=p_id;

    -- The ledger is immutable. If stock quantity or business date changed, replace the
    -- original stock effect through two compensating adjustments instead of mutation.
    if v_purchase_movement.id is not null and (
      v_old_base is distinct from v_new_base
      or (v_purchase_movement.occurred_at at time zone 'America/Sao_Paulo')::date is distinct from p_purchased_at
    ) then
      begin
        v_request:=nullif(current_setting('app.audit_request_id',true),'')::uuid;
      exception when others then
        v_request:=null;
      end;
      v_correction_key:='purchase-correction:'||p_purchase_id::text||':'||coalesce(v_request,gen_random_uuid())::text;
      insert into public.inventory_movements(
        business_id,supply_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at,created_by
      ) values(
        p_business_id,p_id,-v_purchase_movement.quantity_delta,v_purchase_movement.base_unit,'adjustment',
        v_correction_key||':reversal','Correção de compra · estorno do lançamento anterior',
        v_purchase_movement.occurred_at,auth.uid()
      );
      insert into public.inventory_movements(
        business_id,supply_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at,created_by
      ) values(
        p_business_id,p_id,v_new_base,v_purchase_movement.base_unit,'adjustment',
        v_correction_key||':replacement','Correção de compra · lançamento corrigido',
        private.nat_business_date_start(p_purchased_at),auth.uid()
      );
    end if;
  else
    if v_latest_id is null then
      raise exception 'Um insumo novo precisa de uma compra inicial.' using errcode='22023';
    end if;
  end if;

  if p_equivalent_to_supply_id is not null then
    perform private.activate_supply_equivalence(p_business_id,p_equivalent_to_supply_id,p_id);
  end if;
end;
$$;
revoke all on function private.save_supply_v5(uuid,uuid,text,text,numeric,text,numeric,date,text,uuid,text,uuid) from public,anon,authenticated;

-- Keep the transition type stable while making purchase intent explicit in its payload.
create or replace function public.apply_nat_transition(p_business_id uuid,p_operations jsonb)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_operation jsonb;v_payload jsonb;v_type text;v_expected text;v_id uuid;v_mode text;
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
      when 'save_supply' then
        perform private.assert_nat_version('supply',p_business_id,v_id,v_expected);
        v_mode:=coalesce(nullif(v_payload->>'purchaseMode',''),case when coalesce((v_payload->>'appendPurchase')::boolean,false) then 'append' else 'metadata' end);
        perform private.save_supply_v5(
          p_business_id,v_id,v_payload->>'name',v_payload->>'category',(v_payload->>'packageQuantity')::numeric,
          v_payload->>'packageUnit',(v_payload->>'packagePrice')::numeric,(v_payload->>'purchasedAt')::date,
          coalesce(nullif(v_payload->>'fundingSource',''),'owner'),nullif(v_payload->>'equivalentToSupplyId','')::uuid,
          v_mode,nullif(v_payload->>'purchaseId','')::uuid
        );
      when 'save_product' then perform private.assert_nat_version('product',p_business_id,v_id,v_expected);perform public.save_product_v2(p_business_id,v_id,v_payload->>'name',(v_payload->>'batchYield')::numeric,(v_payload->>'sellingPrice')::numeric,(v_payload->>'lossPercent')::numeric,coalesce((v_payload->>'laborCostPerBatch')::numeric,0),(v_payload->>'productionCostPerBatch')::numeric,(v_payload->>'minimumMarginPercent')::numeric,(v_payload->>'targetMarginPercent')::numeric,coalesce(v_payload->'recipe','[]'::jsonb),nullif(v_payload->>'portfolioKey',''));
      when 'save_sporadic_expense' then perform private.assert_nat_version('expense',p_business_id,v_id,v_expected);perform public.save_sporadic_expense_v2(p_business_id,v_id,v_payload->>'name',(v_payload->>'amount')::numeric,(v_payload->>'spentAt')::date,coalesce(nullif(v_payload->>'fundingSource',''),'owner'));
      else raise exception 'Operação não suportada: %.',coalesce(v_type,'(vazia)') using errcode='22023';
    end case;
  end loop;
end;
$$;

-- Direct balance adjustments may reduce/correct finished stock, but once a product is
-- tracked they may not manufacture extra units without consuming the recipe.
create or replace function public.set_inventory_balance(
  p_business_id uuid,p_item_kind text,p_item_id uuid,p_quantity numeric,p_minimum_quantity numeric,p_note text default null
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_tracking public.inventory_tracking%rowtype;v_base_unit text;v_current numeric;v_delta numeric;v_first boolean:=false;
  v_note text:=nullif(left(btrim(coalesce(p_note,'')),500),'');v_movement_id uuid;v_unit_cost numeric;v_unit_labor numeric;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_item_id is null or p_quantity is null or p_quantity<0 or p_minimum_quantity is null or p_minimum_quantity<0 then
    raise exception 'Saldo e estoque mínimo precisam ser zero ou maiores.' using errcode='22023';
  end if;
  if p_item_kind='product' then
    if not exists(select 1 from public.products where business_id=p_business_id and id=p_item_id and active=true) then
      raise exception 'Produto não encontrado ou arquivado.' using errcode='22023';
    end if;
    v_base_unit:='unit';
  elsif p_item_kind='supply' then
    select case private.unit_dimension(sp.package_unit) when 'mass' then 'g' when 'volume' then 'ml' when 'unit' then 'unit' else null end
    into v_base_unit
    from public.supply_purchases sp
    join public.supplies s on s.business_id=sp.business_id and s.id=sp.supply_id and s.active=true
    where sp.business_id=p_business_id and sp.supply_id=p_item_id
    order by sp.purchased_at desc,sp.created_at desc,sp.id desc limit 1;
    if v_base_unit is null then raise exception 'Insumo sem unidade de compra válida.' using errcode='22023'; end if;
  else
    raise exception 'Tipo de item de estoque inválido.' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':'||p_item_kind||':'||p_item_id::text,0));
  select * into v_tracking
  from public.inventory_tracking t
  where t.business_id=p_business_id
    and ((p_item_kind='supply' and t.supply_id=p_item_id) or (p_item_kind='product' and t.product_id=p_item_id))
  for update;

  if not found then
    v_first:=true;
    insert into public.inventory_tracking(business_id,supply_id,product_id,base_unit,minimum_quantity)
    values(p_business_id,case when p_item_kind='supply' then p_item_id end,case when p_item_kind='product' then p_item_id end,v_base_unit,p_minimum_quantity);
    v_current:=0;
  else
    if v_tracking.base_unit<>v_base_unit then raise exception 'A unidade-base do estoque não pode ser alterada.' using errcode='22023'; end if;
    update public.inventory_tracking set minimum_quantity=p_minimum_quantity where id=v_tracking.id;
    v_current:=private.inventory_balance(p_business_id,p_item_kind,p_item_id);
    if p_item_kind='product' and p_quantity>v_current then
      raise exception 'Para aumentar produto acabado, registre produção para que os ingredientes sejam descontados.' using errcode='22023';
    end if;
  end if;

  v_delta:=p_quantity-v_current;
  if v_delta<>0 then
    v_movement_id:=gen_random_uuid();
    insert into public.inventory_movements(id,business_id,supply_id,product_id,quantity_delta,base_unit,movement_type,note,occurred_at,created_by)
    values(v_movement_id,p_business_id,case when p_item_kind='supply' then p_item_id end,case when p_item_kind='product' then p_item_id end,v_delta,v_base_unit,case when v_first then 'opening' else 'adjustment' end,v_note,now(),auth.uid());
    if p_item_kind='product' and v_delta>0 then
      v_unit_cost:=private.product_production_unit_cost_at_date(p_business_id,p_item_id,current_date);
      select labor_cost_per_batch/nullif(batch_yield,0) into v_unit_labor from public.products where business_id=p_business_id and id=p_item_id;
      insert into public.inventory_product_cost_layers(business_id,product_id,production_id,source_key,units_original,units_remaining,unit_cost_snapshot,labor_unit_snapshot,produced_at)
      values(p_business_id,p_item_id,null,'balance:'||v_movement_id::text,v_delta,v_delta,v_unit_cost,coalesce(v_unit_labor,0),now());
    elsif p_item_kind='product' and v_delta<0 then
      perform private.consume_product_layers_for_adjustment(p_business_id,p_item_id,abs(v_delta));
    end if;
  end if;
end;
$$;

-- Atomic target operation for finished products. It serializes by product, makes the
-- target decision after locking, consumes ingredients exactly once for increases,
-- and reuses request_id for retry idempotency.
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
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_request_id is null or p_product_id is null or p_target_quantity is null or p_target_quantity<0
     or p_minimum_quantity is null or p_minimum_quantity<0 or p_produced_at is null then
    raise exception 'Saldo e estoque mínimo precisam ser zero ou maiores.' using errcode='22023';
  end if;

  v_hash:=md5(jsonb_build_object(
    'productId',p_product_id,'targetQuantity',p_target_quantity,'minimumQuantity',p_minimum_quantity,
    'producedAt',p_produced_at,'note',nullif(btrim(coalesce(p_note,'')),'')
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
    perform public.set_inventory_balance(p_business_id,'product',p_product_id,p_target_quantity,p_minimum_quantity,coalesce(p_note,'Saldo inicial informado'));
    v_previous:=0;
    v_delta:=0;
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

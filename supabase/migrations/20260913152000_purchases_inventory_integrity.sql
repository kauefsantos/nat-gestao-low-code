begin;

-- Etapa 3 — Compras & Integridade de Estoque.
-- 1) Nova compra e correção da compra mais recente passam a ser operações distintas.
-- 2) Correção preserva o ledger: a compra é corrigida e o estoque recebe movimento compensatório auditável.
-- 3) Ajuste de estoque de produto vira uma única operação transacional/idempotente.
-- 4) O RPC genérico de saldo deixa de permitir aumento direto de produto pelo cliente.

alter table public.supply_purchases
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists supply_purchases_updated_at on public.supply_purchases;
create trigger supply_purchases_updated_at
before update on public.supply_purchases
for each row execute function private.set_updated_at();

create or replace function public.get_supply_purchase_snapshot(p_business_id uuid, p_month_start date)
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
      sp.id,sp.supply_id,sp.package_quantity,sp.package_unit,sp.package_price,
      sp.purchased_at,sp.funding_source,sp.created_at,sp.updated_at
    from public.supply_purchases sp
    where sp.business_id=p_business_id
    order by sp.supply_id,sp.purchased_at desc,sp.created_at desc,sp.id desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'purchaseId',id,
    'purchaseUpdatedAt',updated_at,
    'supplyId',supply_id,
    'packageQuantity',package_quantity,
    'packageUnit',package_unit,
    'packagePrice',package_price,
    'purchasedAt',purchased_at,
    'fundingSource',funding_source
  )),'[]'::jsonb)
  into v_latest from latest;

  select coalesce(sum(sp.package_price),0),
    coalesce(sum(sp.package_price) filter(where sp.funding_source='owner'),0),
    coalesce(sum(sp.package_price) filter(where sp.funding_source='business'),0)
  into v_month_cash,v_owner,v_business
  from public.supply_purchases sp
  where sp.business_id=p_business_id
    and sp.purchased_at>=p_month_start
    and sp.purchased_at<(p_month_start+interval '1 month')::date;

  return jsonb_build_object(
    'latest',v_latest,
    'monthCashOut',v_month_cash,
    'monthOwnerFundedCashOut',v_owner,
    'monthBusinessReinvestmentCashOut',v_business
  );
end
$$;
revoke all on function public.get_supply_purchase_snapshot(uuid,date) from public,anon;
grant execute on function public.get_supply_purchase_snapshot(uuid,date) to authenticated;

-- Future purchase movements use midnight in the business timezone rather than UTC midnight.
create or replace function private.inventory_after_purchase()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_tracking public.inventory_tracking%rowtype;
  v_quantity numeric;
begin
  select * into v_tracking
  from public.inventory_tracking t
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
    'Compra registrada',new.purchased_at::timestamp at time zone 'America/Sao_Paulo',auth.uid()
  ) on conflict (business_id,source_key) where source_key is not null do nothing;
  return new;
end
$$;
revoke all on function private.inventory_after_purchase() from public,anon,authenticated;

create or replace function private.correct_supply_purchase_v1(
  p_business_id uuid,
  p_supply_id uuid,
  p_purchase_id uuid,
  p_expected_purchase_updated_at timestamptz,
  p_name text,
  p_category text,
  p_package_quantity numeric,
  p_package_unit text,
  p_package_price numeric,
  p_purchased_at date,
  p_funding_source text
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_supply public.supplies%rowtype;
  v_purchase public.supply_purchases%rowtype;
  v_latest_id uuid;
  v_tracking public.inventory_tracking%rowtype;
  v_old_base numeric;
  v_new_base numeric;
  v_delta numeric;
  v_request_id text;
  v_source_key text;
begin
  if p_supply_id is null or p_purchase_id is null
     or p_package_quantity is null or p_package_quantity<=0
     or p_package_unit not in('g','kg','ml','l','unit')
     or p_package_price is null or p_package_price<0
     or p_purchased_at is null
     or p_funding_source not in('owner','business') then
    raise exception 'Dados da correção de compra inválidos.' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':supply-save:'||p_supply_id::text,0));

  select * into v_supply
  from public.supplies
  where business_id=p_business_id and id=p_supply_id and active=true
  for update;
  if not found then raise exception 'Insumo não encontrado.' using errcode='22023'; end if;

  if lower(regexp_replace(btrim(p_name),'\s+',' ','g'))<>lower(regexp_replace(btrim(v_supply.name),'\s+',' ','g'))
     or p_category<>v_supply.category then
    raise exception 'A correção altera somente os dados da compra. Para mudar o cadastro do insumo, use uma alteração específica do item.' using errcode='22023';
  end if;

  select * into v_purchase
  from public.supply_purchases
  where business_id=p_business_id and supply_id=p_supply_id and id=p_purchase_id
  for update;
  if not found then raise exception 'Compra não encontrada.' using errcode='P0002'; end if;

  select id into v_latest_id
  from public.supply_purchases
  where business_id=p_business_id and supply_id=p_supply_id
  order by purchased_at desc,created_at desc,id desc
  limit 1;
  if v_latest_id is distinct from p_purchase_id then
    raise exception 'CONFLICT: somente a compra mais recente pode ser corrigida por esta tela.' using errcode='40001';
  end if;

  if p_expected_purchase_updated_at is null or v_purchase.updated_at is distinct from p_expected_purchase_updated_at then
    raise exception 'CONFLICT: esta compra foi alterada em outro dispositivo. Recarregue antes de corrigir.' using errcode='40001';
  end if;

  if private.unit_dimension(v_purchase.package_unit)<>private.unit_dimension(p_package_unit) then
    raise exception 'A correção não pode trocar a dimensão da unidade da compra.' using errcode='22023';
  end if;

  select * into v_tracking
  from public.inventory_tracking
  where business_id=p_business_id and supply_id=p_supply_id;
  if found and private.unit_dimension(p_package_unit)<>private.unit_dimension(v_tracking.base_unit) then
    raise exception 'A unidade corrigida é incompatível com o estoque configurado.' using errcode='22023';
  end if;

  if found then
    v_old_base:=private.unit_base_amount(v_purchase.package_quantity,v_purchase.package_unit);
    v_new_base:=private.unit_base_amount(p_package_quantity,p_package_unit);
    v_delta:=v_new_base-v_old_base;
  end if;

  update public.supply_purchases
  set package_quantity=p_package_quantity,
      package_unit=p_package_unit,
      package_price=p_package_price,
      purchased_at=p_purchased_at,
      funding_source=p_funding_source
  where id=p_purchase_id and business_id=p_business_id and supply_id=p_supply_id;

  if v_tracking.id is not null and v_delta<>0 then
    v_request_id:=nullif(current_setting('app.audit_request_id',true),'');
    v_source_key:='purchase-correction:'||p_purchase_id::text||':'||coalesce(v_request_id,gen_random_uuid()::text);
    insert into public.inventory_movements(
      business_id,supply_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at,created_by
    ) values(
      p_business_id,p_supply_id,v_delta,v_tracking.base_unit,'adjustment',v_source_key,
      'Correção da compra mais recente',now(),auth.uid()
    );
  end if;

  -- Atualiza a versão do cadastro para propagar concorrência também pelo contrato existente.
  update public.supplies set updated_at=now()
  where business_id=p_business_id and id=p_supply_id;
end
$$;
revoke all on function private.correct_supply_purchase_v1(uuid,uuid,uuid,timestamptz,text,text,numeric,text,numeric,date,text) from public,anon,authenticated;

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
  p_purchase_id uuid default null,
  p_expected_purchase_updated_at timestamptz default null
) returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if p_purchase_mode='append' then
    perform private.save_supply_v4(
      p_business_id,p_id,p_name,p_category,p_package_quantity,p_package_unit,p_package_price,
      p_purchased_at,p_funding_source,p_equivalent_to_supply_id,true
    );
    return;
  elsif p_purchase_mode='correct_latest' then
    if p_equivalent_to_supply_id is not null then
      raise exception 'Uma correção de compra não pode trocar o ingrediente vigente.' using errcode='22023';
    end if;
    perform private.correct_supply_purchase_v1(
      p_business_id,p_id,p_purchase_id,p_expected_purchase_updated_at,p_name,p_category,
      p_package_quantity,p_package_unit,p_package_price,p_purchased_at,p_funding_source
    );
    return;
  end if;
  raise exception 'Modo de compra inválido.' using errcode='22023';
end
$$;
revoke all on function private.save_supply_v5(uuid,uuid,text,text,numeric,text,numeric,date,text,uuid,text,uuid,timestamptz) from public,anon,authenticated;

-- Mantém compatibilidade com clientes anteriores, mas clientes novos enviam purchaseMode explicitamente.
create or replace function public.apply_nat_transition(p_business_id uuid, p_operations jsonb)
returns void
language plpgsql
security definer
set search_path=''
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
        if v_payload ? 'purchaseMode' then
          perform private.save_supply_v5(
            p_business_id,v_id,v_payload->>'name',v_payload->>'category',(v_payload->>'packageQuantity')::numeric,
            v_payload->>'packageUnit',(v_payload->>'packagePrice')::numeric,(v_payload->>'purchasedAt')::date,
            coalesce(nullif(v_payload->>'fundingSource',''),'owner'),nullif(v_payload->>'equivalentToSupplyId','')::uuid,
            v_payload->>'purchaseMode',nullif(v_payload->>'purchaseId','')::uuid,nullif(v_payload->>'purchaseUpdatedAt','')::timestamptz
          );
        else
          perform private.save_supply_v4(
            p_business_id,v_id,v_payload->>'name',v_payload->>'category',(v_payload->>'packageQuantity')::numeric,
            v_payload->>'packageUnit',(v_payload->>'packagePrice')::numeric,(v_payload->>'purchasedAt')::date,
            coalesce(nullif(v_payload->>'fundingSource',''),'owner'),nullif(v_payload->>'equivalentToSupplyId','')::uuid,
            coalesce((v_payload->>'appendPurchase')::boolean,false)
          );
        end if;
      when 'save_product' then perform private.assert_nat_version('product',p_business_id,v_id,v_expected);perform public.save_product_v2(p_business_id,v_id,v_payload->>'name',(v_payload->>'batchYield')::numeric,(v_payload->>'sellingPrice')::numeric,(v_payload->>'lossPercent')::numeric,coalesce((v_payload->>'laborCostPerBatch')::numeric,0),(v_payload->>'productionCostPerBatch')::numeric,(v_payload->>'minimumMarginPercent')::numeric,(v_payload->>'targetMarginPercent')::numeric,coalesce(v_payload->'recipe','[]'::jsonb),nullif(v_payload->>'portfolioKey',''));
      when 'save_sporadic_expense' then perform private.assert_nat_version('expense',p_business_id,v_id,v_expected);perform public.save_sporadic_expense_v2(p_business_id,v_id,v_payload->>'name',(v_payload->>'amount')::numeric,(v_payload->>'spentAt')::date,coalesce(nullif(v_payload->>'fundingSource',''),'owner'));
      else raise exception 'Operação não suportada: %.',coalesce(v_type,'(vazia)') using errcode='22023';
    end case;
  end loop;
end
$$;

-- Supply-only entry point replaces the generic balance RPC in the browser.
create or replace function public.set_supply_inventory_balance_v1(
  p_business_id uuid,
  p_supply_id uuid,
  p_quantity numeric,
  p_minimum_quantity numeric,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  perform public.set_inventory_balance(p_business_id,'supply',p_supply_id,p_quantity,p_minimum_quantity,p_note);
end
$$;
revoke all on function public.set_supply_inventory_balance_v1(uuid,uuid,numeric,numeric,text) from public,anon;
grant execute on function public.set_supply_inventory_balance_v1(uuid,uuid,numeric,numeric,text) to authenticated;

-- Atomic target setter for finished products. Increasing stock always goes through
-- the production routine, so ingredients and finished product commit together.
create or replace function public.set_product_stock_target_v1(
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
  v_hash text;
  v_inserted integer;
  v_operation text;
  v_existing_hash text;
  v_result jsonb;
  v_product public.products%rowtype;
  v_tracking public.inventory_tracking%rowtype;
  v_current numeric;
  v_delta numeric;
  v_batches numeric:=0;
  v_production_id uuid;
  v_note text:=nullif(left(btrim(coalesce(p_note,'')),500),'');
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_request_id is null then raise exception 'Identificador da operação é obrigatório.' using errcode='22023'; end if;
  if p_product_id is null or p_target_quantity is null or p_target_quantity<0
     or p_minimum_quantity is null or p_minimum_quantity<0 or p_produced_at is null then
    raise exception 'Saldo e estoque mínimo precisam ser zero ou maiores.' using errcode='22023';
  end if;

  v_hash:=md5(jsonb_build_object(
    'productId',p_product_id,'targetQuantity',p_target_quantity,'minimumQuantity',p_minimum_quantity,
    'producedAt',p_produced_at,'note',v_note
  )::text);
  insert into public.api_idempotency_requests(business_id,request_id,operation,request_hash)
  values(p_business_id,p_request_id,'inventory_product_target',v_hash)
  on conflict do nothing;
  get diagnostics v_inserted=row_count;

  if v_inserted=0 then
    select operation,request_hash,result into v_operation,v_existing_hash,v_result
    from public.api_idempotency_requests
    where business_id=p_business_id and request_id=p_request_id;
    if v_operation is distinct from 'inventory_product_target' or v_existing_hash is distinct from v_hash then
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
    insert into public.inventory_tracking(business_id,product_id,base_unit,minimum_quantity)
    values(p_business_id,p_product_id,'unit',p_minimum_quantity)
    returning * into v_tracking;
  else
    update public.inventory_tracking
    set minimum_quantity=p_minimum_quantity
    where id=v_tracking.id;
  end if;

  v_current:=private.inventory_balance(p_business_id,'product',p_product_id);
  v_delta:=p_target_quantity-v_current;

  if v_delta>0 then
    v_batches:=v_delta/v_product.batch_yield;
    v_production_id:=public.record_inventory_production(p_business_id,p_product_id,v_batches,p_produced_at,v_note);
  elsif v_delta<0 then
    perform public.set_inventory_balance(p_business_id,'product',p_product_id,p_target_quantity,p_minimum_quantity,v_note);
  end if;

  v_result:=jsonb_build_object(
    'previousQuantity',v_current,
    'targetQuantity',p_target_quantity,
    'unitsProduced',greatest(v_delta,0),
    'batches',v_batches,
    'productionId',v_production_id
  );
  update public.api_idempotency_requests
  set result=v_result,completed_at=now()
  where business_id=p_business_id and request_id=p_request_id;
  return v_result;
end
$$;
revoke all on function public.set_product_stock_target_v1(uuid,uuid,uuid,numeric,numeric,timestamptz,text) from public,anon;
grant execute on function public.set_product_stock_target_v1(uuid,uuid,uuid,numeric,numeric,timestamptz,text) to authenticated;

-- Browser code must not use the generic balance RPC anymore; it could increase a
-- product without consuming ingredients. Internal SECURITY DEFINER routines can still call it.
revoke execute on function public.set_inventory_balance(uuid,text,uuid,numeric,numeric,text) from authenticated;

commit;

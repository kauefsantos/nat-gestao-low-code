begin;

-- Generic idempotency ledger for commands that must return a stable result.
create table if not exists public.api_idempotency_requests (
  business_id uuid not null references public.businesses(id) on delete cascade,
  request_id uuid not null,
  operation text not null check (char_length(operation) between 1 and 80),
  request_hash text not null check (char_length(request_hash)=32),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (business_id,request_id)
);

alter table public.api_idempotency_requests enable row level security;
revoke all on table public.api_idempotency_requests from public,anon,authenticated;
grant select,insert,update,delete on table public.api_idempotency_requests to service_role;
create index if not exists api_idempotency_requests_created_idx on public.api_idempotency_requests(created_at);

-- All state mutations, including creation of a sale, now execute inside the same
-- transaction protected by apply_nat_transition_v2's request id ledger.
create or replace function public.apply_nat_transition(
  p_business_id uuid,
  p_operations jsonb
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_operation jsonb;
  v_payload jsonb;
  v_type text;
  v_expected text;
  v_id uuid;
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if p_operations is null or jsonb_typeof(p_operations)<>'array' then
    raise exception 'Operações inválidas.' using errcode='22023';
  end if;
  if jsonb_array_length(p_operations)>500 then
    raise exception 'Muitas operações em uma única alteração.' using errcode='22023';
  end if;

  for v_operation in select value from jsonb_array_elements(p_operations)
  loop
    v_type:=v_operation->>'type';
    v_payload:=coalesce(v_operation->'payload','{}'::jsonb);
    v_expected:=nullif(v_operation->>'expectedUpdatedAt','');

    if v_type='save_business_settings' then
      perform private.assert_nat_version('settings',p_business_id,null,v_expected);
      perform public.save_business_settings_v3(
        p_business_id,v_payload->>'ownerName',(v_payload->>'monthlyFixedCosts')::numeric,
        coalesce((v_payload->>'paymentFeePercent')::numeric,0),coalesce((v_payload->>'pixFeePercent')::numeric,0),
        coalesce((v_payload->>'cashFeePercent')::numeric,0),coalesce((v_payload->>'cardFeePercent')::numeric,0),
        (v_payload->>'defaultMinimumMarginPercent')::numeric,(v_payload->>'defaultTargetMarginPercent')::numeric,
        coalesce((v_payload->>'ownerHourlyRate')::numeric,20),coalesce((v_payload->>'ownerDailyHours')::numeric,3)
      );
      continue;
    elsif v_type='save_customer' then
      perform public.save_customer(
        p_business_id,(v_payload->>'id')::uuid,v_payload->>'name',v_payload->>'phone',v_payload->>'instagram',
        v_payload->>'source',coalesce((v_payload->>'marketingConsent')::boolean,false),v_payload->>'notes',
        coalesce((v_payload->>'active')::boolean,true)
      );
      continue;
    elsif v_type='create_sale' then
      begin v_id:=(v_payload->>'id')::uuid;
      exception when others then raise exception 'Identificador inválido em create_sale.' using errcode='22023'; end;
      perform private.assert_nat_version('sale',p_business_id,v_id,null);
      perform public.save_sale_items_v4(
        p_business_id,v_id,coalesce(v_payload->'items','[]'::jsonb),
        (v_payload->>'totalReceived')::numeric,v_payload->>'paymentMethod',(v_payload->>'soldAt')::timestamptz,
        nullif(v_payload->>'customerId','')::uuid,coalesce(nullif(v_payload->>'transactionType',''),'sale'),
        coalesce(nullif(v_payload->>'saleChannel',''),'other'),coalesce((v_payload->>'deliveryCost')::numeric,0),
        nullif(v_payload->>'discountReason',''),coalesce((v_payload->>'belowCostOverride')::boolean,false)
      );
      continue;
    end if;

    begin v_id:=(v_payload->>'id')::uuid;
    exception when others then raise exception 'Identificador inválido em %.',coalesce(v_type,'operação') using errcode='22023'; end;

    case v_type
      when 'cancel_sale' then
        perform private.assert_nat_version('sale',p_business_id,v_id,v_expected);
        perform public.cancel_sale(p_business_id,v_id,coalesce(nullif(v_payload->>'reason',''),'Cancelada pelo usuário'));
      when 'archive_product' then
        perform private.assert_nat_version('product',p_business_id,v_id,v_expected);
        perform public.archive_product(p_business_id,v_id);
      when 'delete_supply' then
        perform private.assert_nat_version('supply',p_business_id,v_id,v_expected);
        perform public.delete_supply(p_business_id,v_id);
      when 'delete_sporadic_expense' then
        perform private.assert_nat_version('expense',p_business_id,v_id,v_expected);
        perform public.delete_sporadic_expense(p_business_id,v_id);
      when 'delete_owner_cash_movement' then
        perform public.delete_owner_cash_movement(p_business_id,v_id);
      when 'save_owner_cash_movement' then
        perform public.save_owner_cash_movement(p_business_id,v_id,v_payload->>'movementType',(v_payload->>'amount')::numeric,(v_payload->>'occurredAt')::date,v_payload->>'note');
      when 'save_supply' then
        perform private.assert_nat_version('supply',p_business_id,v_id,v_expected);
        perform public.save_supply(p_business_id,v_id,v_payload->>'name',v_payload->>'category',(v_payload->>'packageQuantity')::numeric,v_payload->>'packageUnit',(v_payload->>'packagePrice')::numeric,(v_payload->>'purchasedAt')::date);
      when 'save_product' then
        perform private.assert_nat_version('product',p_business_id,v_id,v_expected);
        perform public.save_product_v2(p_business_id,v_id,v_payload->>'name',(v_payload->>'batchYield')::numeric,(v_payload->>'sellingPrice')::numeric,(v_payload->>'lossPercent')::numeric,coalesce((v_payload->>'laborCostPerBatch')::numeric,0),(v_payload->>'productionCostPerBatch')::numeric,(v_payload->>'minimumMarginPercent')::numeric,(v_payload->>'targetMarginPercent')::numeric,coalesce(v_payload->'recipe','[]'::jsonb),nullif(v_payload->>'portfolioKey',''));
      when 'save_sporadic_expense' then
        perform private.assert_nat_version('expense',p_business_id,v_id,v_expected);
        perform public.save_sporadic_expense(p_business_id,v_id,v_payload->>'name',(v_payload->>'amount')::numeric,(v_payload->>'spentAt')::date);
      else
        raise exception 'Operação não suportada: %.',coalesce(v_type,'(vazia)') using errcode='22023';
    end case;
  end loop;
end;
$$;

-- Serialize updates to one supply before checking whether a new purchase snapshot
-- is necessary. This closes the read-then-insert race between devices/tabs.
create or replace function public.save_supply(
  p_business_id uuid,
  p_id uuid,
  p_name text,
  p_category text,
  p_package_quantity numeric,
  p_package_unit text,
  p_package_price numeric,
  p_purchased_at date
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_latest record;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_id is null or char_length(btrim(coalesce(p_name,''))) not between 1 and 160
     or p_category not in ('ingredient','packaging','other') or p_package_quantity is null or p_package_quantity<=0
     or p_package_unit not in ('g','kg','ml','l','unit') or p_package_price is null or p_package_price<0 or p_purchased_at is null then
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

  select sp.package_quantity,sp.package_unit,sp.package_price,sp.purchased_at into v_latest
  from public.supply_purchases sp
  where sp.business_id=p_business_id and sp.supply_id=p_id
  order by sp.purchased_at desc,sp.created_at desc limit 1;

  if v_latest is null or v_latest.package_quantity is distinct from p_package_quantity
     or v_latest.package_unit is distinct from p_package_unit or v_latest.package_price is distinct from p_package_price
     or v_latest.purchased_at is distinct from p_purchased_at then
    insert into public.supply_purchases(business_id,supply_id,package_quantity,package_unit,package_price,purchased_at)
    values(p_business_id,p_id,p_package_quantity,p_package_unit,p_package_price,p_purchased_at);
  end if;
end;
$$;

-- Idempotent production command. Network retries and repeated submits with the same
-- request id return the original production id instead of consuming inventory twice.
create or replace function public.record_inventory_production_v2(
  p_business_id uuid,
  p_request_id uuid,
  p_product_id uuid,
  p_batches numeric,
  p_produced_at timestamptz,
  p_note text default null
)
returns uuid
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
  v_production_id uuid;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_request_id is null then raise exception 'Identificador da operação é obrigatório.' using errcode='22023'; end if;

  v_hash:=md5(jsonb_build_object(
    'productId',p_product_id,'batches',p_batches,'producedAt',p_produced_at,'note',nullif(btrim(coalesce(p_note,'')),'')
  )::text);

  insert into public.api_idempotency_requests(business_id,request_id,operation,request_hash)
  values(p_business_id,p_request_id,'inventory_production',v_hash)
  on conflict do nothing;
  get diagnostics v_inserted=row_count;

  if v_inserted=0 then
    select operation,request_hash,result into v_operation,v_existing_hash,v_result
    from public.api_idempotency_requests
    where business_id=p_business_id and request_id=p_request_id;
    if v_operation is distinct from 'inventory_production' or v_existing_hash is distinct from v_hash then
      raise exception 'CONFLICT: identificador de operação reutilizado com conteúdo diferente.' using errcode='40001';
    end if;
    v_production_id:=nullif(v_result->>'productionId','')::uuid;
    if v_production_id is null then
      raise exception 'CONFLICT: operação idempotente ainda sem resultado.' using errcode='40001';
    end if;
    return v_production_id;
  end if;

  v_production_id:=public.record_inventory_production(p_business_id,p_product_id,p_batches,p_produced_at,p_note);
  update public.api_idempotency_requests
  set result=jsonb_build_object('productionId',v_production_id),completed_at=now()
  where business_id=p_business_id and request_id=p_request_id;
  return v_production_id;
end;
$$;

-- Keep the sales page API current with the domain model while retaining keyset pagination.
create or replace function public.list_sales_page(
  p_business_id uuid,
  p_limit integer default 30,
  p_before_sold_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_limit integer:=least(greatest(coalesce(p_limit,30),1),100);
  v_items jsonb:='[]'::jsonb;
  v_has_more boolean:=false;
  v_next_sold_at timestamptz;
  v_next_id uuid;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if (p_before_sold_at is null)<>(p_before_id is null) then raise exception 'Cursor incompleto.' using errcode='22023'; end if;

  with page as (
    select s.* from public.sales s
    where s.business_id=p_business_id and (p_before_sold_at is null or (s.sold_at,s.id)<(p_before_sold_at,p_before_id))
    order by s.sold_at desc,s.id desc limit v_limit+1
  ), trimmed as (
    select * from page order by sold_at desc,id desc limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'soldAt',t.sold_at,'totalReceived',t.total_received,'paymentMethod',t.payment_method,
    'variableFeeSnapshot',t.variable_fee_snapshot,'contributionSnapshot',t.contribution_snapshot,
    'status',t.status,'cancelledAt',t.cancelled_at,'cancelReason',t.cancel_reason,'updatedAt',t.updated_at,
    'customerId',t.customer_id,'transactionType',t.transaction_type,'saleChannel',t.sale_channel,
    'deliveryCostSnapshot',t.delivery_cost_snapshot,'discountReason',t.discount_reason,'belowCostOverride',t.below_cost_override,
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',si.id,'productId',si.product_id,'productName',si.product_name_snapshot,'portfolioKey',si.portfolio_key_snapshot,
      'quantity',si.quantity,'unitCostSnapshot',si.unit_cost_snapshot,'laborCostSnapshot',si.labor_cost_snapshot,
      'unitPriceSnapshot',si.unit_price_snapshot
    ) order by si.created_at,si.id) from public.sale_items si where si.sale_id=t.id and si.business_id=p_business_id),'[]'::jsonb)
  ) order by t.sold_at desc,t.id desc),'[]'::jsonb)
  into v_items from trimmed t;

  with page as (
    select s.sold_at,s.id from public.sales s
    where s.business_id=p_business_id and (p_before_sold_at is null or (s.sold_at,s.id)<(p_before_sold_at,p_before_id))
    order by s.sold_at desc,s.id desc limit v_limit+1
  ), trimmed as (select * from page order by sold_at desc,id desc limit v_limit)
  select (select count(*)>v_limit from page),t.sold_at,t.id into v_has_more,v_next_sold_at,v_next_id
  from trimmed t order by t.sold_at asc,t.id asc limit 1;

  return jsonb_build_object('items',v_items,'hasMore',coalesce(v_has_more,false),
    'nextCursor',case when v_has_more then jsonb_build_object('soldAt',v_next_sold_at,'id',v_next_id) else null end);
end;
$$;

create or replace function private.cleanup_nat_operational_logs()
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  delete from public.mutation_requests where created_at<now()-interval '7 days';
  delete from public.api_idempotency_requests where created_at<now()-interval '7 days';
  delete from public.ai_generation_log where created_at<now()-interval '90 days';
  delete from public.notification_delivery_log where created_at<now()-interval '90 days';
  perform private.cleanup_privacy_retention_v1();
end;
$$;

-- Internal mutation primitives are no longer part of the authenticated API surface.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any(array[
      'save_sale','save_sale_items','save_sale_items_v2','save_sale_items_v3','save_sale_items_v4',
      'save_supply','save_product','save_product_v2','save_sporadic_expense','save_customer',
      'save_owner_cash_movement','delete_owner_cash_movement','delete_supply','archive_product','cancel_sale',
      'save_business_settings','save_business_settings_v2','save_business_settings_v3','record_inventory_production'
    ])
  loop
    execute format('revoke execute on function %s from public,anon,authenticated',r.signature);
  end loop;
end;
$$;

revoke all on function public.record_inventory_production_v2(uuid,uuid,uuid,numeric,timestamptz,text) from public,anon;
grant execute on function public.record_inventory_production_v2(uuid,uuid,uuid,numeric,timestamptz,text) to authenticated;
revoke all on function public.list_sales_page(uuid,integer,timestamptz,uuid) from public,anon;
grant execute on function public.list_sales_page(uuid,integer,timestamptz,uuid) to authenticated;

commit;

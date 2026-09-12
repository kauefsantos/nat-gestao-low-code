begin;

-- The idempotency ledger is service-side only and must satisfy the same strict
-- RLS posture as every other public application table.
alter table public.api_idempotency_requests force row level security;

-- Preserve the latest sale implementations under internal-only names, then
-- recreate the historical public signatures as hardened compatibility facades.
do $$
begin
  if to_regprocedure('public.save_sale_items_v3_impl(uuid,uuid,jsonb,numeric,text,timestamptz,uuid,text)') is null
     and to_regprocedure('public.save_sale_items_v3(uuid,uuid,jsonb,numeric,text,timestamptz,uuid,text)') is not null then
    execute 'alter function public.save_sale_items_v3(uuid,uuid,jsonb,numeric,text,timestamptz,uuid,text) rename to save_sale_items_v3_impl';
  end if;
  if to_regprocedure('public.save_sale_items_v4_impl(uuid,uuid,jsonb,numeric,text,timestamptz,uuid,text,text,numeric,text,boolean)') is null
     and to_regprocedure('public.save_sale_items_v4(uuid,uuid,jsonb,numeric,text,timestamptz,uuid,text,text,numeric,text,boolean)') is not null then
    execute 'alter function public.save_sale_items_v4(uuid,uuid,jsonb,numeric,text,timestamptz,uuid,text,text,numeric,text,boolean) rename to save_sale_items_v4_impl';
  end if;
end $$;

-- Rebind the internal v4 implementation to the preserved v3 implementation so
-- the public v3 facade cannot create a recursion loop.
create or replace function public.save_sale_items_v4_impl(
  p_business_id uuid,
  p_id uuid,
  p_items jsonb,
  p_total_received numeric,
  p_payment_method text,
  p_sold_at timestamptz,
  p_customer_id uuid default null,
  p_transaction_type text default 'sale',
  p_sale_channel text default 'other',
  p_delivery_cost numeric default 0,
  p_discount_reason text default null,
  p_below_cost_override boolean default false
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_contribution numeric;
  v_list_total numeric:=0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id uuid;
  v_quantity numeric;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_sale_channel not in ('whatsapp','instagram','street','referral','in_person','other') then raise exception 'Canal de venda inválido.' using errcode='22023'; end if;
  if coalesce(p_delivery_cost,0)<0 then raise exception 'O custo de entrega não pode ser negativo.' using errcode='22023'; end if;
  if p_transaction_type<>'sale' and coalesce(p_delivery_cost,0)<>0 then raise exception 'Movimentações sem venda não podem ter custo de entrega.' using errcode='22023'; end if;
  if jsonb_typeof(coalesce(p_items,'null'::jsonb))='array' then
    for v_item in select value from jsonb_array_elements(p_items) loop
      begin
        v_product_id:=nullif(v_item->>'productId','')::uuid;
        v_quantity:=nullif(v_item->>'quantity','')::numeric;
      exception when others then
        raise exception 'Item inválido.' using errcode='22023';
      end;
      if v_quantity is null or v_quantity<=0 or trunc(v_quantity)<>v_quantity then
        raise exception 'A quantidade de produtos acabados precisa ser inteira e maior que zero.' using errcode='22023';
      end if;
      select * into v_product from public.products where business_id=p_business_id and id=v_product_id and active=true;
      if found then v_list_total:=v_list_total+(v_product.selling_price*v_quantity); end if;
    end loop;
  end if;

  perform public.save_sale_items_v3_impl(
    p_business_id,p_id,p_items,p_total_received,p_payment_method,p_sold_at,p_customer_id,p_transaction_type
  );

  update public.sales
  set sale_channel=case when p_transaction_type='sale' then p_sale_channel else 'other' end,
      delivery_cost_snapshot=case when p_transaction_type='sale' then coalesce(p_delivery_cost,0) else 0 end,
      discount_reason=case when p_transaction_type='sale' then nullif(btrim(coalesce(p_discount_reason,'')),'') else null end,
      below_cost_override=case when p_transaction_type='sale' then coalesce(p_below_cost_override,false) else false end,
      contribution_snapshot=contribution_snapshot-case when p_transaction_type='sale' then coalesce(p_delivery_cost,0) else 0 end,
      updated_at=now()
  where business_id=p_business_id and id=p_id
  returning contribution_snapshot into v_contribution;

  if p_transaction_type='sale' and coalesce(p_total_received,0)<v_list_total
     and nullif(btrim(coalesce(p_discount_reason,'')),'') is null then
    raise exception 'Informe o motivo do desconto para salvar a venda.' using errcode='22023';
  end if;
  if p_transaction_type='sale' and v_contribution<0 and not coalesce(p_below_cost_override,false) then
    raise exception 'Esta venda fica abaixo do custo. Confirme conscientemente para continuar.' using errcode='22023';
  end if;
  if p_transaction_type='sale' and v_contribution<0 and coalesce(p_below_cost_override,false)
     and nullif(btrim(coalesce(p_discount_reason,'')),'') is null then
    raise exception 'Informe o motivo para confirmar uma venda abaixo do custo.' using errcode='22023';
  end if;
end;
$$;

create or replace function public.save_sale_items_v4(
  p_business_id uuid,
  p_id uuid,
  p_items jsonb,
  p_total_received numeric,
  p_payment_method text,
  p_sold_at timestamptz,
  p_customer_id uuid default null,
  p_transaction_type text default 'sale',
  p_sale_channel text default 'other',
  p_delivery_cost numeric default 0,
  p_discount_reason text default null,
  p_below_cost_override boolean default false
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if exists(select 1 from public.sales where business_id=p_business_id and id=p_id) then
    raise exception 'CONFLICT: venda já registrada.' using errcode='40001';
  end if;
  perform public.save_sale_items_v4_impl(
    p_business_id,p_id,p_items,p_total_received,p_payment_method,p_sold_at,p_customer_id,
    p_transaction_type,p_sale_channel,p_delivery_cost,p_discount_reason,p_below_cost_override
  );
end;
$$;

create or replace function public.save_sale_items_v3(
  p_business_id uuid,
  p_id uuid,
  p_items jsonb,
  p_total_received numeric,
  p_payment_method text,
  p_sold_at timestamptz,
  p_customer_id uuid default null,
  p_transaction_type text default 'sale'
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  perform public.save_sale_items_v4(
    p_business_id,p_id,p_items,p_total_received,p_payment_method,p_sold_at,p_customer_id,
    p_transaction_type,'other',0,null,false
  );
end;
$$;

create or replace function public.save_sale_items_v2(
  p_business_id uuid,
  p_id uuid,
  p_items jsonb,
  p_total_received numeric,
  p_payment_method text,
  p_sold_at timestamptz,
  p_customer_id uuid default null,
  p_transaction_type text default 'sale'
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  perform public.save_sale_items_v4(
    p_business_id,p_id,p_items,p_total_received,p_payment_method,p_sold_at,p_customer_id,
    p_transaction_type,'other',0,null,false
  );
end;
$$;

create or replace function public.save_sale_items(
  p_business_id uuid,
  p_id uuid,
  p_items jsonb,
  p_total_received numeric,
  p_payment_method text,
  p_sold_at timestamptz
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  perform public.save_sale_items_v4(
    p_business_id,p_id,p_items,p_total_received,p_payment_method,p_sold_at,null,'sale','other',0,null,false
  );
end;
$$;

-- Keep the historical production signature compatible but make immediate exact
-- retries converge to the already-created record. The application itself uses
-- record_inventory_production_v2, which provides full request-id idempotency.
do $$
begin
  if to_regprocedure('public.record_inventory_production_impl(uuid,uuid,numeric,timestamptz,text)') is null
     and to_regprocedure('public.record_inventory_production(uuid,uuid,numeric,timestamptz,text)') is not null then
    execute 'alter function public.record_inventory_production(uuid,uuid,numeric,timestamptz,text) rename to record_inventory_production_impl';
  end if;
end $$;

create or replace function public.record_inventory_production(
  p_business_id uuid,
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
  v_existing uuid;
  v_note text:=nullif(left(btrim(coalesce(p_note,'')),500),'');
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;

  select ip.id into v_existing
  from public.inventory_productions ip
  where ip.business_id=p_business_id
    and ip.product_id=p_product_id
    and ip.batches=p_batches
    and ip.produced_at=p_produced_at
    and ip.note is not distinct from v_note
    and ip.created_by is not distinct from auth.uid()
    and ip.created_at>=now()-interval '30 seconds'
  order by ip.created_at desc
  limit 1;

  if v_existing is not null then return v_existing; end if;
  return public.record_inventory_production_impl(p_business_id,p_product_id,p_batches,p_produced_at,p_note);
end;
$$;

-- Backward-compatible transition alias. It still executes inside the idempotent
-- apply_nat_transition_v2 transaction and delegates to the latest sale rules.
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
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_operations is null or jsonb_typeof(p_operations)<>'array' then raise exception 'Operações inválidas.' using errcode='22023'; end if;
  if jsonb_array_length(p_operations)>500 then raise exception 'Muitas operações em uma única alteração.' using errcode='22023'; end if;

  for v_operation in select value from jsonb_array_elements(p_operations) loop
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
    elsif v_type in ('create_sale','save_sale_items') then
      begin v_id:=(v_payload->>'id')::uuid;
      exception when others then raise exception 'Identificador inválido em %.',v_type using errcode='22023'; end;
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

-- Reviewed compatibility RPCs remain callable. The unsafe preserved implementations
-- are explicitly internal-only.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any(array[
      'save_sale_items','save_sale_items_v2','save_sale_items_v3','save_sale_items_v4',
      'save_supply','save_product','save_product_v2','save_sporadic_expense','save_customer',
      'save_owner_cash_movement','delete_owner_cash_movement','delete_supply','archive_product','cancel_sale',
      'save_business_settings','save_business_settings_v2','save_business_settings_v3','record_inventory_production'
    ])
  loop
    execute format('grant execute on function %s to authenticated',r.signature);
  end loop;

  for r in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any(array[
      'save_sale_items_v3_impl','save_sale_items_v4_impl','record_inventory_production_impl'
    ])
  loop
    execute format('revoke execute on function %s from public,anon,authenticated',r.signature);
  end loop;
end $$;

commit;

begin;

-- Historical sale signatures remain available for compatibility, but every
-- facade now carries its own authorization guard and delegates to the latest
-- validation rules. Legacy calls receive an explicit compatibility reason for
-- ordinary discounts; below-cost sales are still rejected unless the current
-- API explicitly receives an override.
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
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
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
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  perform public.save_sale_items_v4(
    p_business_id,p_id,p_items,p_total_received,p_payment_method,p_sold_at,p_customer_id,
    p_transaction_type,'other',0,
    case when p_transaction_type='sale' then 'Compatibilidade de API legada' else null end,
    false
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
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  perform public.save_sale_items_v4(
    p_business_id,p_id,p_items,p_total_received,p_payment_method,p_sold_at,p_customer_id,
    p_transaction_type,'other',0,
    case when p_transaction_type='sale' then 'Compatibilidade de API legada' else null end,
    false
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
declare
  v_generic_fee numeric:=0;
  v_current_fee numeric:=0;
  v_expected_fee numeric:=0;
  v_fee_delta numeric:=0;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;

  perform public.save_sale_items_v4(
    p_business_id,p_id,p_items,p_total_received,p_payment_method,p_sold_at,null,'sale','other',0,
    'Compatibilidade de API legada',false
  );

  -- Preserve the accounting contract of the oldest endpoint: it historically
  -- used payment_fee_percent rather than the newer per-method fee columns.
  select coalesce(payment_fee_percent,0) into v_generic_fee
  from public.business_settings where business_id=p_business_id;
  select coalesce(private.payment_fee_for_method(p_business_id,p_payment_method),0) into v_current_fee;
  v_expected_fee:=p_total_received*v_generic_fee/100;
  v_fee_delta:=v_expected_fee-(p_total_received*v_current_fee/100);

  update public.sales
  set variable_fee_snapshot=v_expected_fee,
      contribution_snapshot=contribution_snapshot-v_fee_delta,
      updated_at=now()
  where business_id=p_business_id and id=p_id;
end;
$$;

-- PostgreSQL grants EXECUTE to PUBLIC on newly-created functions unless revoked.
-- Make the client surface explicit and leave implementation helpers private.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any(array[
      'save_sale_items','save_sale_items_v2','save_sale_items_v3','save_sale_items_v4',
      'record_inventory_production','record_inventory_production_v2','apply_nat_transition_v2',
      'list_sales_page'
    ])
  loop
    execute format('revoke execute on function %s from public,anon',r.signature);
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

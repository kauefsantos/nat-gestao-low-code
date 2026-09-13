begin;

-- Fail closed when frontend code and Lovable Cloud schema are out of sync.
create table if not exists private.nat_schema_release (
  singleton boolean primary key default true check (singleton),
  version text not null,
  applied_at timestamptz not null default now()
);
revoke all on table private.nat_schema_release from public, anon, authenticated;

insert into private.nat_schema_release(singleton, version, applied_at)
values (true, '2026-09-13.security-release-gate.1', now())
on conflict (singleton) do update
set version = excluded.version,
    applied_at = excluded.applied_at;

create or replace function public.get_nat_schema_version()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_version text;
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.' using errcode='42501';
  end if;
  select version into v_version
  from private.nat_schema_release
  where singleton = true;
  return v_version;
end;
$$;
revoke all on function public.get_nat_schema_version() from public, anon, authenticated;
grant execute on function public.get_nat_schema_version() to authenticated;

-- Privacy erasure is irreversible and detaches financial history from the CRM.
-- Membership alone is not sufficient: require an administrator.
create or replace function public.erase_customer_privacy_v1(
  p_business_id uuid,
  p_customer_id uuid,
  p_reason text default 'Solicitação de privacidade'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exists boolean;
  v_sales bigint;
begin
  if not private.is_business_admin(p_business_id) then
    raise exception 'Apenas administradores podem excluir dados pessoais de clientes.' using errcode='42501';
  end if;

  select exists(
    select 1 from public.customers
    where id=p_customer_id and business_id=p_business_id
  ) into v_exists;
  if not v_exists then
    raise exception 'Cliente não encontrado.' using errcode='P0002';
  end if;

  if exists(
    select 1 from public.sales
    where business_id=p_business_id
      and customer_id=p_customer_id
      and status='completed'
      and payment_status='pending'
  ) then
    raise exception 'Quite ou cancele os pagamentos pendentes antes de excluir os dados pessoais deste cliente.' using errcode='22023';
  end if;

  perform set_config('app.audit_reason','privacy_erasure',true);
  select count(*) into v_sales
  from public.sales
  where business_id=p_business_id and customer_id=p_customer_id;

  update public.sales
  set customer_id=null, updated_at=now()
  where business_id=p_business_id and customer_id=p_customer_id;

  delete from public.customers
  where business_id=p_business_id and id=p_customer_id;

  insert into public.privacy_request_log(
    business_id,customer_id,request_type,result,reason,actor_user_id
  ) values (
    p_business_id,p_customer_id,'erasure','completed',
    left(coalesce(nullif(btrim(p_reason),''),'Solicitação de privacidade'),200),auth.uid()
  );

  return jsonb_build_object(
    'customerId',p_customer_id,
    'detachedSales',v_sales,
    'result','completed'
  );
end;
$$;
revoke all on function public.erase_customer_privacy_v1(uuid,uuid,text) from public, anon;
grant execute on function public.erase_customer_privacy_v1(uuid,uuid,text) to authenticated;

-- Public client entry point: only v4 may mutate the main NAT aggregate.
revoke execute on function public.apply_nat_transition_v2(uuid,uuid,jsonb) from public, anon, authenticated;
revoke execute on function public.apply_nat_transition_v3(uuid,uuid,jsonb) from public, anon, authenticated;

-- Old calendar write bypasses request-id idempotency; v3 is the client entry point.
revoke execute on function public.save_calendar_event_v2(uuid,uuid,text,date,time,text,text,text,text,text,text,boolean) from public, anon, authenticated;

-- Production v1 lacks request-id idempotency; the Edge Function uses v2.
revoke execute on function public.record_inventory_production(uuid,uuid,numeric,timestamptz,text) from public, anon, authenticated;

-- These functions remain implementation details called by hardened SECURITY DEFINER
-- entry points. Authenticated clients must not invoke them directly.
revoke execute on function public.archive_product(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.cancel_sale(uuid,uuid,text) from public, anon, authenticated;
revoke execute on function public.delete_owner_cash_movement(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.delete_sporadic_expense(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.delete_supply(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.save_customer(uuid,uuid,text,text,text,text,boolean,text,boolean) from public, anon, authenticated;
revoke execute on function public.save_owner_cash_movement(uuid,uuid,text,numeric,date,text) from public, anon, authenticated;
revoke execute on function public.save_product(uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,jsonb,text) from public, anon, authenticated;
revoke execute on function public.save_sporadic_expense(uuid,uuid,text,numeric,date) from public, anon, authenticated;
revoke execute on function public.save_sporadic_expense_v2(uuid,uuid,text,numeric,date,text) from public, anon, authenticated;
revoke execute on function public.save_supply(uuid,uuid,text,text,numeric,text,numeric,date) from public, anon, authenticated;
revoke execute on function public.save_supply_v2(uuid,uuid,text,text,numeric,text,numeric,date,text) from public, anon, authenticated;

revoke execute on function public.save_business_settings(uuid,text,numeric,numeric,numeric,numeric) from public, anon, authenticated;
revoke execute on function public.save_business_settings_v2(uuid,text,numeric,numeric,numeric,numeric,numeric,numeric) from public, anon, authenticated;
revoke execute on function public.save_business_settings_v3(uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) from public, anon, authenticated;
revoke execute on function public.save_business_settings_v4(uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text) from public, anon, authenticated;

revoke execute on function public.save_sale_items(uuid,uuid,jsonb,numeric,text,timestamptz) from public, anon, authenticated;
revoke execute on function public.save_sale_items_v2(uuid,uuid,jsonb,numeric,text,timestamptz,uuid,text) from public, anon, authenticated;
revoke execute on function public.save_sale_items_v3(uuid,uuid,jsonb,numeric,text,timestamptz,uuid,text) from public, anon, authenticated;
revoke execute on function public.save_sale_items_v4(uuid,uuid,jsonb,numeric,text,timestamptz,uuid,text,text,numeric,text,boolean) from public, anon, authenticated;

commit;

begin;

alter table public.ai_generation_log add column if not exists provider_called_at timestamptz;
alter table public.ai_generation_log add column if not exists provider_attempt_count integer not null default 0;
alter table public.ai_generation_log add column if not exists cost_quota_consumed boolean not null default false;
alter table public.ai_generation_log add column if not exists correlation_id uuid;
create index if not exists ai_generation_log_business_provider_idx on public.ai_generation_log(business_id,provider_called_at desc) where cost_quota_consumed=true;

create table if not exists private.nat_ai_budget_policy(
  business_id uuid primary key references public.businesses(id) on delete cascade,
  daily_requests integer not null default 20 check(daily_requests between 1 and 500),
  monthly_requests integer not null default 300 check(monthly_requests between 1 and 10000),
  daily_tokens integer not null default 30000 check(daily_tokens between 1000 and 5000000),
  monthly_tokens integer not null default 400000 check(monthly_tokens between 10000 and 50000000),
  updated_at timestamptz not null default now()
);

create table if not exists private.nat_external_circuit(
  service text not null,
  business_id uuid not null references public.businesses(id) on delete cascade,
  consecutive_failures integer not null default 0,
  opened_until timestamptz,
  last_failure_at timestamptz,
  last_success_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(service,business_id)
);

create or replace function public.claim_content_ai_provider_budget(p_id uuid,p_correlation_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_row public.ai_generation_log%rowtype;v_daily_req integer;v_month_req integer;v_daily_tokens bigint;v_month_tokens bigint;
  v_policy private.nat_ai_budget_policy%rowtype;v_estimated integer;
begin
  select * into v_row from public.ai_generation_log where id=p_id for update;
  if not found or v_row.status<>'started' then return jsonb_build_object('allowed',false,'reason','INVALID_LOG'); end if;
  if v_row.cost_quota_consumed then return jsonb_build_object('allowed',true,'reason','ALREADY_CLAIMED'); end if;
  perform pg_advisory_xact_lock(hashtextextended(v_row.business_id::text||':ai-budget',0));
  select * into v_policy from private.nat_ai_budget_policy where business_id=v_row.business_id;
  if not found then v_policy.daily_requests:=20;v_policy.monthly_requests:=300;v_policy.daily_tokens:=30000;v_policy.monthly_tokens:=400000;end if;
  select count(*),coalesce(sum(coalesce(total_tokens,0)),0) into v_daily_req,v_daily_tokens from public.ai_generation_log where business_id=v_row.business_id and cost_quota_consumed=true and provider_called_at>=now()-interval '24 hours';
  select count(*),coalesce(sum(coalesce(total_tokens,0)),0) into v_month_req,v_month_tokens from public.ai_generation_log where business_id=v_row.business_id and cost_quota_consumed=true and provider_called_at>=date_trunc('month',now());
  v_estimated:=ceil(v_row.prompt_chars/4.0)::integer+700;
  if v_daily_req>=v_policy.daily_requests then return jsonb_build_object('allowed',false,'reason','DAILY_REQUEST_BUDGET'); end if;
  if v_month_req>=v_policy.monthly_requests then return jsonb_build_object('allowed',false,'reason','MONTHLY_REQUEST_BUDGET'); end if;
  if v_daily_tokens+v_estimated>v_policy.daily_tokens then return jsonb_build_object('allowed',false,'reason','DAILY_TOKEN_BUDGET'); end if;
  if v_month_tokens+v_estimated>v_policy.monthly_tokens then return jsonb_build_object('allowed',false,'reason','MONTHLY_TOKEN_BUDGET'); end if;
  update public.ai_generation_log set cost_quota_consumed=true,provider_called_at=coalesce(provider_called_at,now()),correlation_id=coalesce(correlation_id,p_correlation_id) where id=p_id;
  return jsonb_build_object('allowed',true,'reason','OK','estimatedTokens',v_estimated);
end $$;

create or replace function public.content_ai_circuit_allows(p_business_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_until timestamptz;
begin
  select opened_until into v_until from private.nat_external_circuit where service='content-ai' and business_id=p_business_id;
  return v_until is null or v_until<=now();
end $$;

create or replace function public.record_content_ai_provider_result(p_business_id uuid,p_success boolean,p_transient boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  insert into private.nat_external_circuit(service,business_id,consecutive_failures,opened_until,last_failure_at,last_success_at,updated_at)
  values('content-ai',p_business_id,case when p_success then 0 else 1 end,null,case when p_success then null else now() end,case when p_success then now() end,now())
  on conflict(service,business_id) do update set
    consecutive_failures=case when p_success then 0 when p_transient then private.nat_external_circuit.consecutive_failures+1 else private.nat_external_circuit.consecutive_failures end,
    opened_until=case when p_success then null when p_transient and private.nat_external_circuit.consecutive_failures+1>=5 then now()+interval '5 minutes' else private.nat_external_circuit.opened_until end,
    last_failure_at=case when not p_success then now() else private.nat_external_circuit.last_failure_at end,
    last_success_at=case when p_success then now() else private.nat_external_circuit.last_success_at end,
    updated_at=now();
end $$;

create or replace function public.increment_content_ai_provider_attempt(p_id uuid) returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer;begin update public.ai_generation_log set provider_attempt_count=provider_attempt_count+1,provider_called_at=coalesce(provider_called_at,now()) where id=p_id returning provider_attempt_count into v_count;return v_count;end $$;

revoke all on function public.claim_content_ai_provider_budget(uuid,uuid) from public,anon,authenticated;
revoke all on function public.content_ai_circuit_allows(uuid) from public,anon,authenticated;
revoke all on function public.record_content_ai_provider_result(uuid,boolean,boolean) from public,anon,authenticated;
revoke all on function public.increment_content_ai_provider_attempt(uuid) from public,anon,authenticated;
grant execute on function public.claim_content_ai_provider_budget(uuid,uuid) to service_role;
grant execute on function public.content_ai_circuit_allows(uuid) to service_role;
grant execute on function public.record_content_ai_provider_result(uuid,boolean,boolean) to service_role;
grant execute on function public.increment_content_ai_provider_attempt(uuid) to service_role;

commit;

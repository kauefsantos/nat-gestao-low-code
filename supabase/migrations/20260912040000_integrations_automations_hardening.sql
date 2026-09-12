-- Integrations and automations hardening: idempotent external effects, retries, scheduler reconciliation,
-- rotatable cron auth, configurable business timezone, and separated AI anti-abuse/cost quotas.
begin;

create extension if not exists pg_net;
create extension if not exists pg_cron;
create extension if not exists pgcrypto;

-- Business timezone remains Sao Paulo by default, but is now explicit and configurable.
alter table public.business_settings
  add column if not exists timezone text not null default 'America/Sao_Paulo';

create or replace function private.is_valid_timezone(p_timezone text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone);
$$;
revoke all on function private.is_valid_timezone(text) from public,anon,authenticated;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='business_settings_timezone_check'
      and conrelid='public.business_settings'::regclass
  ) then
    alter table public.business_settings
      add constraint business_settings_timezone_check
      check (private.is_valid_timezone(timezone));
  end if;
end $$;

-- Delivery log becomes a durable ledger. Existing successful rows are preserved as sent.
alter table public.notification_delivery_log
  add column if not exists status text not null default 'sent',
  add column if not exists attempt_count integer not null default 1,
  add column if not exists provider_status integer,
  add column if not exists last_error_code text,
  add column if not exists last_error_message text,
  add column if not exists next_retry_at timestamptz,
  add column if not exists locked_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.notification_delivery_log
set status='sent',
    sent_at=coalesce(sent_at,created_at),
    updated_at=coalesce(updated_at,created_at)
where status is distinct from 'sent' or sent_at is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='notification_delivery_status_check'
      and conrelid='public.notification_delivery_log'::regclass
  ) then
    alter table public.notification_delivery_log
      add constraint notification_delivery_status_check
      check (status in ('processing','sent','retry','expired','dead_letter'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='notification_delivery_attempt_count_check'
      and conrelid='public.notification_delivery_log'::regclass
  ) then
    alter table public.notification_delivery_log
      add constraint notification_delivery_attempt_count_check check (attempt_count between 1 and 50);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='notification_delivery_provider_status_check'
      and conrelid='public.notification_delivery_log'::regclass
  ) then
    alter table public.notification_delivery_log
      add constraint notification_delivery_provider_status_check
      check (provider_status is null or provider_status between 100 and 599);
  end if;
end $$;

create index if not exists notification_delivery_retry_idx
  on public.notification_delivery_log(status,next_retry_at)
  where status='retry';

-- Only the backend service role can interact with delivery claims.
revoke all on table public.notification_delivery_log from public,anon,authenticated;
grant select,insert,update on table public.notification_delivery_log to service_role;

create or replace function public.claim_push_delivery(
  p_business_id uuid,
  p_subscription_id uuid,
  p_user_id uuid,
  p_local_date date,
  p_slot smallint,
  p_event_count integer,
  p_lease_seconds integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_status text;
  v_attempt integer;
  v_claimed boolean:=false;
  v_now timestamptz:=now();
begin
  if p_slot not in (9,12,16,21) or p_event_count<1 or p_lease_seconds not between 30 and 900 then
    raise exception 'Claim de push inválido.' using errcode='22023';
  end if;

  insert into public.notification_delivery_log(
    business_id,subscription_id,user_id,local_date,slot,event_count,status,attempt_count,locked_at,sent_at,next_retry_at,updated_at
  ) values (
    p_business_id,p_subscription_id,p_user_id,p_local_date,p_slot,p_event_count,'processing',1,v_now,null,null,v_now
  )
  on conflict (subscription_id,local_date,slot) do update
    set status='processing',
        attempt_count=public.notification_delivery_log.attempt_count+1,
        event_count=excluded.event_count,
        locked_at=v_now,
        next_retry_at=null,
        updated_at=v_now,
        provider_status=null,
        last_error_code=null,
        last_error_message=null
    where (
      public.notification_delivery_log.status='retry'
      and coalesce(public.notification_delivery_log.next_retry_at,'epoch'::timestamptz)<=v_now
    ) or (
      public.notification_delivery_log.status='processing'
      and coalesce(public.notification_delivery_log.locked_at,'epoch'::timestamptz)<=v_now-make_interval(secs=>p_lease_seconds)
    )
  returning id,status,attempt_count into v_id,v_status,v_attempt;

  if found then
    v_claimed:=true;
  else
    select id,status,attempt_count into v_id,v_status,v_attempt
    from public.notification_delivery_log
    where subscription_id=p_subscription_id and local_date=p_local_date and slot=p_slot;
  end if;

  return jsonb_build_object('claimed',v_claimed,'id',v_id,'status',v_status,'attemptCount',v_attempt);
end;
$$;

create or replace function public.complete_push_delivery(p_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  update public.notification_delivery_log
  set status='sent',sent_at=now(),locked_at=null,next_retry_at=null,updated_at=now(),
      provider_status=null,last_error_code=null,last_error_message=null
  where id=p_id and status='processing';
  if not found then raise exception 'Entrega de push não está em processamento.' using errcode='40001'; end if;
end;
$$;

create or replace function public.fail_push_delivery(
  p_id uuid,
  p_permanent boolean,
  p_provider_status integer default null,
  p_error_code text default null,
  p_error_message text default null,
  p_retry_after_seconds integer default null,
  p_max_attempts integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_attempt integer;
  v_status text;
  v_delay integer;
  v_next timestamptz;
begin
  select attempt_count into v_attempt from public.notification_delivery_log where id=p_id for update;
  if not found then raise exception 'Entrega de push não encontrada.' using errcode='22023'; end if;

  if p_permanent then
    v_status:='expired'; v_next:=null;
  elsif v_attempt>=greatest(1,p_max_attempts) then
    v_status:='dead_letter'; v_next:=null;
  else
    v_status:='retry';
    v_delay:=coalesce(nullif(p_retry_after_seconds,0),case v_attempt when 1 then 60 when 2 then 300 when 3 then 900 else 3600 end);
    -- deterministic bounded jitter avoids synchronized retries while remaining testable.
    v_delay:=v_delay + (abs(hashtextextended(p_id::text||':'||v_attempt::text,0)) % greatest(1,least(60,v_delay/5+1)))::integer;
    v_next:=now()+make_interval(secs=>v_delay);
  end if;

  update public.notification_delivery_log
  set status=v_status,provider_status=p_provider_status,last_error_code=left(p_error_code,80),
      last_error_message=left(p_error_message,240),next_retry_at=v_next,locked_at=null,updated_at=now()
  where id=p_id;

  return jsonb_build_object('status',v_status,'nextRetryAt',v_next,'attemptCount',v_attempt);
end;
$$;

create or replace function public.list_due_push_retries(p_limit integer default 100)
returns table(
  delivery_id uuid,business_id uuid,subscription_id uuid,user_id uuid,local_date date,slot smallint,event_count integer
)
language sql
security definer
set search_path=''
as $$
  select l.id,l.business_id,l.subscription_id,l.user_id,l.local_date,l.slot,l.event_count
  from public.notification_delivery_log l
  join public.push_subscriptions s on s.id=l.subscription_id and s.enabled=true
  where l.status='retry' and l.next_retry_at<=now()
  order by l.next_retry_at,l.created_at
  limit least(greatest(coalesce(p_limit,100),1),500);
$$;

revoke all on function public.claim_push_delivery(uuid,uuid,uuid,date,smallint,integer,integer) from public,anon,authenticated;
revoke all on function public.complete_push_delivery(uuid) from public,anon,authenticated;
revoke all on function public.fail_push_delivery(uuid,boolean,integer,text,text,integer,integer) from public,anon,authenticated;
revoke all on function public.list_due_push_retries(integer) from public,anon,authenticated;
grant execute on function public.claim_push_delivery(uuid,uuid,uuid,date,smallint,integer,integer) to service_role;
grant execute on function public.complete_push_delivery(uuid) to service_role;
grant execute on function public.fail_push_delivery(uuid,boolean,integer,text,text,integer,integer) to service_role;
grant execute on function public.list_due_push_retries(integer) to service_role;

-- Single source of truth for the cron secret: Vault. Backend runtime may read it; clients may not.
create or replace function public.get_push_cron_secret()
returns text
language sql
security definer
set search_path=''
as $$
  select decrypted_secret from vault.decrypted_secrets where name='nat_push_cron_secret' limit 1;
$$;
revoke all on function public.get_push_cron_secret() from public,anon,authenticated;
grant execute on function public.get_push_cron_secret() to service_role;

-- Track each asynchronous pg_net scheduler request and reconcile its real HTTP result.
create table if not exists private.nat_scheduler_dispatches(
  id uuid primary key default gen_random_uuid(),
  slot smallint not null check (slot in (9,12,16,21)),
  request_id bigint,
  status text not null default 'queued' check (status in ('queued','success','retry_scheduled','failed')),
  attempt_count integer not null default 1 check (attempt_count between 1 and 20),
  parent_id uuid references private.nat_scheduler_dispatches(id) on delete set null,
  http_status integer check (http_status is null or http_status between 100 and 599),
  timed_out boolean,
  error_message text,
  created_at timestamptz not null default now(),
  reconciled_at timestamptz
);
create unique index if not exists nat_scheduler_dispatches_request_uidx
  on private.nat_scheduler_dispatches(request_id) where request_id is not null;
create index if not exists nat_scheduler_dispatches_pending_idx
  on private.nat_scheduler_dispatches(status,created_at) where status='queued';
revoke all on table private.nat_scheduler_dispatches from public,anon,authenticated;

create or replace function private.dispatch_nat_push_slot(p_slot smallint,p_parent_id uuid default null)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_url text;
  v_secret text;
  v_request_id bigint;
  v_dispatch_id uuid;
  v_attempt integer:=1;
begin
  if p_slot not in (9,12,16,21) then raise exception 'Slot inválido.' using errcode='22023'; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name='nat_push_function_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='nat_push_cron_secret' limit 1;
  if nullif(v_url,'') is null or nullif(v_secret,'') is null then raise exception 'Push backend não configurado.' using errcode='55000'; end if;
  if p_parent_id is not null then
    select least(attempt_count+1,20) into v_attempt from private.nat_scheduler_dispatches where id=p_parent_id;
    v_attempt:=coalesce(v_attempt,1);
  end if;

  insert into private.nat_scheduler_dispatches(slot,attempt_count,parent_id)
  values(p_slot,v_attempt,p_parent_id) returning id into v_dispatch_id;

  select net.http_post(
    url:=v_url,
    headers:=jsonb_build_object('Content-Type','application/json','x-nat-cron-secret',v_secret),
    body:=jsonb_build_object('slot',p_slot),
    timeout_milliseconds:=10000
  ) into v_request_id;
  update private.nat_scheduler_dispatches set request_id=v_request_id where id=v_dispatch_id;
  return v_request_id;
end;
$$;
revoke all on function private.dispatch_nat_push_slot(smallint,uuid) from public,anon,authenticated;

-- Compatibility signature used by existing cron jobs/tests.
create or replace function private.dispatch_nat_push_slot(p_slot smallint)
returns bigint
language sql
security definer
set search_path=''
as $$ select private.dispatch_nat_push_slot(p_slot,null::uuid); $$;
revoke all on function private.dispatch_nat_push_slot(smallint) from public,anon,authenticated;

create or replace function private.reconcile_nat_push_dispatches()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_row record;
  v_response record;
  v_success integer:=0;
  v_retried integer:=0;
  v_failed integer:=0;
begin
  for v_row in
    select * from private.nat_scheduler_dispatches
    where status='queued' and request_id is not null and created_at<now()-interval '15 seconds'
    order by created_at
    limit 100
    for update skip locked
  loop
    select * into v_response from net._http_response where id=v_row.request_id;
    if found and coalesce(v_response.timed_out,false)=false and v_response.status_code between 200 and 299 then
      update private.nat_scheduler_dispatches set status='success',http_status=v_response.status_code,timed_out=false,reconciled_at=now() where id=v_row.id;
      v_success:=v_success+1;
    elsif v_row.attempt_count<5 and (
      not found or coalesce(v_response.timed_out,false)=true or v_response.status_code is null or
      v_response.status_code in (408,425,429,500,502,503,504)
    ) then
      update private.nat_scheduler_dispatches
      set status='retry_scheduled',http_status=v_response.status_code,timed_out=v_response.timed_out,
          error_message=left(coalesce(v_response.error_msg,'HTTP scheduler request did not succeed'),240),reconciled_at=now()
      where id=v_row.id;
      perform private.dispatch_nat_push_slot(v_row.slot,v_row.id);
      v_retried:=v_retried+1;
    else
      update private.nat_scheduler_dispatches
      set status='failed',http_status=v_response.status_code,timed_out=v_response.timed_out,
          error_message=left(coalesce(v_response.error_msg,'HTTP scheduler request failed'),240),reconciled_at=now()
      where id=v_row.id;
      v_failed:=v_failed+1;
    end if;
  end loop;
  return jsonb_build_object('success',v_success,'retried',v_retried,'failed',v_failed);
end;
$$;
revoke all on function private.reconcile_nat_push_dispatches() from public,anon,authenticated;

create or replace function private.reconcile_nat_push_jobs()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_url_configured boolean;
  v_secret_configured boolean;
  v_job record;
begin
  select exists(select 1 from vault.decrypted_secrets where name='nat_push_function_url' and nullif(decrypted_secret,'') is not null) into v_url_configured;
  select exists(select 1 from vault.decrypted_secrets where name='nat_push_cron_secret' and nullif(decrypted_secret,'') is not null) into v_secret_configured;

  -- Reconciler is safe to keep installed even before external secrets are configured.
  for v_job in select jobid from cron.job where jobname='nat-push-reconcile' loop perform cron.unschedule(v_job.jobid); end loop;
  perform cron.schedule('nat-push-reconcile','*/5 * * * *',$cron$select private.reconcile_nat_push_dispatches();$cron$);

  if not (v_url_configured and v_secret_configured) then
    return jsonb_build_object('configured',false,'reason','push secrets missing');
  end if;

  for v_job in select jobid from cron.job where jobname in ('nat-push-09','nat-push-12','nat-push-16','nat-push-21')
  loop perform cron.unschedule(v_job.jobid); end loop;
  perform cron.schedule('nat-push-09','0 12 * * *',$cron$select private.dispatch_nat_push_slot(9);$cron$);
  perform cron.schedule('nat-push-12','0 15 * * *',$cron$select private.dispatch_nat_push_slot(12);$cron$);
  perform cron.schedule('nat-push-16','0 19 * * *',$cron$select private.dispatch_nat_push_slot(16);$cron$);
  perform cron.schedule('nat-push-21','0 0 * * *',$cron$select private.dispatch_nat_push_slot(21);$cron$);
  return jsonb_build_object('configured',true,'jobs',5);
end;
$$;
revoke all on function private.reconcile_nat_push_jobs() from public,anon,authenticated;

-- AI: anti-abuse attempts and provider/cost quota are separate concerns.
alter table public.ai_generation_log
  add column if not exists provider_called_at timestamptz,
  add column if not exists provider_attempt_count integer not null default 0,
  add column if not exists cost_quota_consumed boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname='ai_generation_provider_attempt_check' and conrelid='public.ai_generation_log'::regclass
  ) then
    alter table public.ai_generation_log add constraint ai_generation_provider_attempt_check check (provider_attempt_count between 0 and 20);
  end if;
end $$;

-- Anti-abuse rate limit: attempts only. Cost quota is enforced separately below.
create or replace function public.claim_content_ai_quota(
  p_business_id uuid,p_user_id uuid,p_format text,p_prompt_chars integer
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid; v_recent integer;
begin
  if p_format not in ('feed','story','square') or p_prompt_chars<0 or p_prompt_chars>1500 then raise exception 'Dados de uso da IA inválidos.' using errcode='22023'; end if;
  if not exists(select 1 from public.business_members where business_id=p_business_id and user_id=p_user_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':'||p_user_id::text,0));
  select count(*) into v_recent from public.ai_generation_log where business_id=p_business_id and user_id=p_user_id and created_at>=now()-interval '10 minutes';
  if v_recent>=10 then return null; end if;
  insert into public.ai_generation_log(business_id,user_id,format,prompt_chars) values(p_business_id,p_user_id,p_format,p_prompt_chars) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.claim_content_ai_provider_quota(p_id uuid,p_daily_limit integer default 100)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_row public.ai_generation_log%rowtype; v_count integer;
begin
  select * into v_row from public.ai_generation_log where id=p_id for update;
  if not found or v_row.status<>'started' then return false; end if;
  if v_row.cost_quota_consumed then return true; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_row.business_id::text||':'||v_row.user_id::text||':ai-provider',0));
  select count(*) into v_count from public.ai_generation_log
   where business_id=v_row.business_id and user_id=v_row.user_id and cost_quota_consumed=true and provider_called_at>=now()-interval '24 hours';
  if v_count>=greatest(1,p_daily_limit) then return false; end if;
  update public.ai_generation_log set cost_quota_consumed=true,provider_called_at=coalesce(provider_called_at,now()) where id=p_id;
  return true;
end;
$$;

create or replace function public.increment_content_ai_provider_attempt(p_id uuid)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare v_count integer;
begin
  update public.ai_generation_log set provider_attempt_count=provider_attempt_count+1,provider_called_at=coalesce(provider_called_at,now())
  where id=p_id returning provider_attempt_count into v_count;
  return v_count;
end;
$$;

revoke all on function public.claim_content_ai_provider_quota(uuid,integer) from public,anon,authenticated;
revoke all on function public.increment_content_ai_provider_attempt(uuid) from public,anon,authenticated;
grant execute on function public.claim_content_ai_provider_quota(uuid,integer) to service_role;
grant execute on function public.increment_content_ai_provider_attempt(uuid) to service_role;

-- Retention also trims old scheduler telemetry; commercial/audit history remains untouched.
create or replace function private.cleanup_nat_operational_logs()
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  delete from public.mutation_requests where created_at<now()-interval '7 days';
  delete from public.ai_generation_log where created_at<now()-interval '90 days';
  delete from public.notification_delivery_log where created_at<now()-interval '90 days';
  delete from private.nat_scheduler_dispatches where created_at<now()-interval '30 days';
end;
$$;
revoke all on function private.cleanup_nat_operational_logs() from public,anon,authenticated;

-- Reconcile current environment if secrets are already present; otherwise this safely leaves push jobs pending configuration.
select private.reconcile_nat_push_jobs();

commit;

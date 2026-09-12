begin;

-- Lovable Cloud drift closure + resilience hardening.
-- This migration intentionally mirrors protections already present in the managed Cloud
-- and makes them reproducible from the repository.

alter table public.notification_delivery_log add column if not exists status text not null default 'sent';
alter table public.notification_delivery_log add column if not exists attempt_count integer not null default 1;
alter table public.notification_delivery_log add column if not exists provider_status integer;
alter table public.notification_delivery_log add column if not exists last_error_code text;
alter table public.notification_delivery_log add column if not exists last_error_message text;
alter table public.notification_delivery_log add column if not exists next_retry_at timestamptz;
alter table public.notification_delivery_log add column if not exists locked_at timestamptz;
alter table public.notification_delivery_log add column if not exists sent_at timestamptz;
alter table public.notification_delivery_log add column if not exists updated_at timestamptz not null default now();

do $$ begin
  if not exists(select 1 from pg_constraint where conname='notification_delivery_log_subscription_date_slot_key') then
    alter table public.notification_delivery_log add constraint notification_delivery_log_subscription_date_slot_key unique(subscription_id,local_date,slot);
  end if;
end $$;

create or replace function public.claim_push_delivery(
  p_business_id uuid,p_subscription_id uuid,p_user_id uuid,p_local_date date,p_slot smallint,p_event_count integer,p_lease_seconds integer default 120
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_status text; v_attempt integer; v_claimed boolean:=false; v_now timestamptz:=now();
begin
  if p_slot not in(9,12,16,21) or p_event_count<1 or p_lease_seconds not between 30 and 900 then raise exception 'Claim de push inválido.' using errcode='22023'; end if;
  insert into public.notification_delivery_log(business_id,subscription_id,user_id,local_date,slot,event_count,status,attempt_count,locked_at,sent_at,next_retry_at,updated_at)
  values(p_business_id,p_subscription_id,p_user_id,p_local_date,p_slot,p_event_count,'processing',1,v_now,null,null,v_now)
  on conflict(subscription_id,local_date,slot) do update set
    status='processing',attempt_count=public.notification_delivery_log.attempt_count+1,event_count=excluded.event_count,locked_at=v_now,next_retry_at=null,updated_at=v_now,provider_status=null,last_error_code=null,last_error_message=null
  where (public.notification_delivery_log.status='retry' and coalesce(public.notification_delivery_log.next_retry_at,'epoch'::timestamptz)<=v_now)
     or (public.notification_delivery_log.status='processing' and coalesce(public.notification_delivery_log.locked_at,'epoch'::timestamptz)<=v_now-make_interval(secs=>p_lease_seconds))
  returning id,status,attempt_count into v_id,v_status,v_attempt;
  if found then v_claimed:=true; else select id,status,attempt_count into v_id,v_status,v_attempt from public.notification_delivery_log where subscription_id=p_subscription_id and local_date=p_local_date and slot=p_slot; end if;
  return jsonb_build_object('claimed',v_claimed,'id',v_id,'status',v_status,'attemptCount',v_attempt);
end $$;

create or replace function public.complete_push_delivery(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  update public.notification_delivery_log set status='sent',sent_at=now(),locked_at=null,next_retry_at=null,updated_at=now(),provider_status=null,last_error_code=null,last_error_message=null where id=p_id and status='processing';
  if not found then raise exception 'Entrega de push não está em processamento.' using errcode='40001'; end if;
end $$;

create or replace function public.fail_push_delivery(
  p_id uuid,p_permanent boolean,p_provider_status integer default null,p_error_code text default null,p_error_message text default null,p_retry_after_seconds integer default null,p_max_attempts integer default 5
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_attempt integer; v_status text; v_delay integer; v_next timestamptz;
begin
  select attempt_count into v_attempt from public.notification_delivery_log where id=p_id for update;
  if not found then raise exception 'Entrega de push não encontrada.' using errcode='22023'; end if;
  if p_permanent then v_status:='expired'; v_next:=null;
  elsif v_attempt>=greatest(1,p_max_attempts) then v_status:='dead_letter'; v_next:=null;
  else
    v_status:='retry';
    v_delay:=coalesce(nullif(p_retry_after_seconds,0),case v_attempt when 1 then 60 when 2 then 300 when 3 then 900 else 3600 end);
    v_delay:=v_delay+(abs(hashtextextended(p_id::text||':'||v_attempt::text,0)) % greatest(1,least(60,v_delay/5+1)))::integer;
    v_next:=now()+make_interval(secs=>v_delay);
  end if;
  update public.notification_delivery_log set status=v_status,provider_status=p_provider_status,last_error_code=left(p_error_code,80),last_error_message=left(p_error_message,240),next_retry_at=v_next,locked_at=null,updated_at=now() where id=p_id;
  return jsonb_build_object('status',v_status,'nextRetryAt',v_next,'attemptCount',v_attempt);
end $$;

create or replace function public.list_due_push_retries(p_limit integer default 100)
returns table(delivery_id uuid,business_id uuid,subscription_id uuid,user_id uuid,local_date date,slot smallint,event_count integer)
language sql security definer set search_path='' as $$
  select l.id,l.business_id,l.subscription_id,l.user_id,l.local_date,l.slot,l.event_count
  from public.notification_delivery_log l join public.push_subscriptions s on s.id=l.subscription_id and s.enabled=true
  where l.status='retry' and l.next_retry_at<=now() order by l.next_retry_at,l.created_at
  limit least(greatest(coalesce(p_limit,100),1),500)
$$;

revoke all on function public.claim_push_delivery(uuid,uuid,uuid,date,smallint,integer,integer) from public,anon,authenticated;
revoke all on function public.complete_push_delivery(uuid) from public,anon,authenticated;
revoke all on function public.fail_push_delivery(uuid,boolean,integer,text,text,integer,integer) from public,anon,authenticated;
revoke all on function public.list_due_push_retries(integer) from public,anon,authenticated;
grant execute on function public.claim_push_delivery(uuid,uuid,uuid,date,smallint,integer,integer) to service_role;
grant execute on function public.complete_push_delivery(uuid) to service_role;
grant execute on function public.fail_push_delivery(uuid,boolean,integer,text,text,integer,integer) to service_role;
grant execute on function public.list_due_push_retries(integer) to service_role;

create table if not exists private.nat_scheduler_dispatches(
  id uuid primary key default gen_random_uuid(),slot smallint,request_id bigint,status text not null default 'queued',attempt_count integer not null default 1,parent_id uuid references private.nat_scheduler_dispatches(id),http_status integer,timed_out boolean,error_message text,created_at timestamptz not null default now(),reconciled_at timestamptz,dispatch_kind text not null default 'slot'
);
create index if not exists nat_scheduler_dispatches_pending_idx on private.nat_scheduler_dispatches(status,created_at) where status='queued';

create table if not exists private.nat_job_heartbeats(
  job_name text primary key,last_started_at timestamptz,last_succeeded_at timestamptz,last_failed_at timestamptz,last_status text not null default 'never',last_detail jsonb not null default '{}'::jsonb,updated_at timestamptz not null default now()
);

create or replace function private.record_nat_job_heartbeat(p_job_name text,p_status text,p_detail jsonb default '{}'::jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
  insert into private.nat_job_heartbeats(job_name,last_started_at,last_succeeded_at,last_failed_at,last_status,last_detail,updated_at)
  values(p_job_name,now(),case when p_status='success' then now() end,case when p_status='failed' then now() end,p_status,coalesce(p_detail,'{}'::jsonb),now())
  on conflict(job_name) do update set last_started_at=now(),last_succeeded_at=case when p_status='success' then now() else private.nat_job_heartbeats.last_succeeded_at end,last_failed_at=case when p_status='failed' then now() else private.nat_job_heartbeats.last_failed_at end,last_status=p_status,last_detail=coalesce(p_detail,'{}'::jsonb),updated_at=now();
end $$;

create or replace function private.dispatch_nat_push_slot(p_slot smallint,p_parent_id uuid default null) returns bigint language plpgsql security definer set search_path='' as $$
declare v_url text; v_secret text; v_request_id bigint; v_dispatch_id uuid; v_attempt integer:=1;
begin
  if p_slot not in(9,12,16,21) then raise exception 'Slot inválido.' using errcode='22023'; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name='nat_push_function_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='nat_push_cron_secret' limit 1;
  if nullif(v_url,'') is null or nullif(v_secret,'') is null then raise exception 'Push backend não configurado.' using errcode='55000'; end if;
  if p_parent_id is not null then select least(attempt_count+1,20) into v_attempt from private.nat_scheduler_dispatches where id=p_parent_id; v_attempt:=coalesce(v_attempt,1); end if;
  insert into private.nat_scheduler_dispatches(slot,attempt_count,parent_id) values(p_slot,v_attempt,p_parent_id) returning id into v_dispatch_id;
  select net.http_post(url:=v_url,headers:=jsonb_build_object('Content-Type','application/json','x-nat-cron-secret',v_secret),body:=jsonb_build_object('slot',p_slot,'correlationId',v_dispatch_id),timeout_milliseconds:=10000) into v_request_id;
  update private.nat_scheduler_dispatches set request_id=v_request_id where id=v_dispatch_id;
  perform private.record_nat_job_heartbeat('nat-push-local-tick','success',jsonb_build_object('slot',p_slot,'dispatchId',v_dispatch_id));
  return v_request_id;
exception when others then
  perform private.record_nat_job_heartbeat('nat-push-local-tick','failed',jsonb_build_object('slot',p_slot,'error',left(sqlerrm,180)));
  raise;
end $$;

create or replace function private.dispatch_nat_push_slot(p_slot smallint) returns bigint language sql security definer set search_path='' as $$ select private.dispatch_nat_push_slot(p_slot,null::uuid) $$;

create or replace function private.dispatch_nat_push_retry_poll(p_parent_id uuid default null) returns bigint language plpgsql security definer set search_path='' as $$
declare v_url text;v_secret text;v_request_id bigint;v_dispatch_id uuid;v_attempt integer:=1;
begin
 select decrypted_secret into v_url from vault.decrypted_secrets where name='nat_push_function_url' limit 1;
 select decrypted_secret into v_secret from vault.decrypted_secrets where name='nat_push_cron_secret' limit 1;
 if nullif(v_url,'') is null or nullif(v_secret,'') is null then raise exception 'Push backend não configurado.' using errcode='55000'; end if;
 if p_parent_id is not null then select least(attempt_count+1,20) into v_attempt from private.nat_scheduler_dispatches where id=p_parent_id;v_attempt:=coalesce(v_attempt,1);end if;
 insert into private.nat_scheduler_dispatches(dispatch_kind,slot,attempt_count,parent_id) values('retry',null,v_attempt,p_parent_id) returning id into v_dispatch_id;
 select net.http_post(url:=v_url,headers:=jsonb_build_object('Content-Type','application/json','x-nat-cron-secret',v_secret),body:=jsonb_build_object('retryOnly',true,'correlationId',v_dispatch_id),timeout_milliseconds:=10000) into v_request_id;
 update private.nat_scheduler_dispatches set request_id=v_request_id where id=v_dispatch_id;return v_request_id;
end $$;

create or replace function private.dispatch_nat_push_local_tick() returns bigint language plpgsql security definer set search_path='' as $$
declare v_hour integer; v_request bigint;
begin
  v_hour:=extract(hour from timezone('America/Sao_Paulo',now()))::integer;
  if v_hour in(9,12,16,21) then v_request:=private.dispatch_nat_push_slot(v_hour::smallint); else perform private.record_nat_job_heartbeat('nat-push-local-tick','success',jsonb_build_object('localHour',v_hour,'action','noop')); end if;
  return v_request;
end $$;

create or replace function private.reconcile_nat_push_dispatches() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row record;v_response record;v_success integer:=0;v_retried integer:=0;v_failed integer:=0;
begin
 for v_row in select * from private.nat_scheduler_dispatches where status='queued' and request_id is not null and created_at<now()-interval '15 seconds' order by created_at limit 100 for update skip locked loop
  select * into v_response from net._http_response where id=v_row.request_id;
  if found and coalesce(v_response.timed_out,false)=false and v_response.status_code between 200 and 299 then update private.nat_scheduler_dispatches set status='success',http_status=v_response.status_code,timed_out=false,reconciled_at=now() where id=v_row.id;v_success:=v_success+1;
  elsif v_row.attempt_count<5 and (not found or coalesce(v_response.timed_out,false)=true or v_response.status_code is null or v_response.status_code in(408,425,429,500,502,503,504)) then update private.nat_scheduler_dispatches set status='retry_scheduled',http_status=v_response.status_code,timed_out=v_response.timed_out,error_message=left(coalesce(v_response.error_msg,'HTTP scheduler request did not succeed'),240),reconciled_at=now() where id=v_row.id;if v_row.dispatch_kind='retry' then perform private.dispatch_nat_push_retry_poll(v_row.id);else perform private.dispatch_nat_push_slot(v_row.slot,v_row.id);end if;v_retried:=v_retried+1;
  else update private.nat_scheduler_dispatches set status='failed',http_status=v_response.status_code,timed_out=v_response.timed_out,error_message=left(coalesce(v_response.error_msg,'HTTP scheduler request failed'),240),reconciled_at=now() where id=v_row.id;v_failed:=v_failed+1;
  end if;
 end loop;
 perform private.record_nat_job_heartbeat('nat-push-reconcile','success',jsonb_build_object('success',v_success,'retried',v_retried,'failed',v_failed));
 return jsonb_build_object('success',v_success,'retried',v_retried,'failed',v_failed);
end $$;

-- Calendar idempotency ledger. Exact replay is success; same request id with a different payload is rejected.
create table if not exists private.calendar_mutation_requests(
  business_id uuid not null,request_id uuid not null,request_hash text not null,event_id uuid not null,created_at timestamptz not null default now(),primary key(business_id,request_id)
);

create or replace function public.save_calendar_event_v3(
  p_business_id uuid,p_request_id uuid,p_id uuid,p_expected_updated_at text,p_event_date date,p_event_time time,p_kind text,p_title text,p_details text,p_channel text,p_objective text,p_status text,p_reminder_enabled boolean
) returns void language plpgsql security definer set search_path='' as $$
declare v_hash text;v_existing text;
begin
 if p_request_id is null then raise exception 'request_id é obrigatório.' using errcode='22023'; end if;
 v_hash:=encode(digest(concat_ws('|',p_id::text,coalesce(p_expected_updated_at,''),p_event_date::text,coalesce(p_event_time::text,''),p_kind,p_title,coalesce(p_details,''),coalesce(p_channel,''),coalesce(p_objective,''),p_status,coalesce(p_reminder_enabled,true)::text),'sha256'),'hex');
 select request_hash into v_existing from private.calendar_mutation_requests where business_id=p_business_id and request_id=p_request_id;
 if found then if v_existing<>v_hash then raise exception 'CONFLICT: request_id reutilizado com conteúdo diferente.' using errcode='40001'; end if; return; end if;
 perform public.save_calendar_event_v2(p_business_id,p_id,p_expected_updated_at,p_event_date,p_event_time,p_kind,p_title,p_details,p_channel,p_objective,p_status,p_reminder_enabled);
 insert into private.calendar_mutation_requests(business_id,request_id,request_hash,event_id) values(p_business_id,p_request_id,v_hash,p_id);
end $$;
revoke all on function public.save_calendar_event_v3(uuid,uuid,uuid,text,date,time,text,text,text,text,text,text,boolean) from public,anon;
grant execute on function public.save_calendar_event_v3(uuid,uuid,uuid,text,date,time,text,text,text,text,text,text,boolean) to authenticated;

-- Keep idempotency ledgers bounded.
create or replace function private.cleanup_frontend_resilience_logs() returns void language plpgsql security definer set search_path='' as $$
begin
 delete from private.calendar_mutation_requests where created_at<now()-interval '30 days';
 delete from private.nat_scheduler_dispatches where created_at<now()-interval '30 days' and status<>'queued';
 delete from public.notification_delivery_log where created_at<now()-interval '90 days' and status in('sent','expired','dead_letter');
end $$;

-- Timezone-aware scheduling: UTC cron only triggers an hourly tick; business slot is selected in America/Sao_Paulo at execution time.
do $$ declare r record; begin
 for r in select jobid from cron.job where jobname in('nat-push-09','nat-push-12','nat-push-16','nat-push-21','nat-push-local-tick','nat-push-delivery-retry','nat-push-reconcile','nat-frontend-resilience-cleanup') loop perform cron.unschedule(r.jobid); end loop;
 perform cron.schedule('nat-push-local-tick','0 * * * *','select private.dispatch_nat_push_local_tick();');
 perform cron.schedule('nat-push-delivery-retry','*/5 * * * *','select private.dispatch_nat_push_retry_poll();');
 perform cron.schedule('nat-push-reconcile','*/5 * * * *','select private.reconcile_nat_push_dispatches();');
 perform cron.schedule('nat-frontend-resilience-cleanup','45 4 * * *','select private.cleanup_frontend_resilience_logs();');
end $$;

commit;

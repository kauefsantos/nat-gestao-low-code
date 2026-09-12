-- Complete integration hardening: dedicated due-delivery retry worker and safe timezone validation.
begin;

-- The check-constraint validator remains private from application users but must be executable
-- by the backend service role when it performs controlled settings writes/tests.
grant execute on function private.is_valid_timezone(text) to service_role;

-- Scheduler telemetry now distinguishes normal slots from the retry worker.
alter table private.nat_scheduler_dispatches add column if not exists dispatch_kind text not null default 'slot';
alter table private.nat_scheduler_dispatches alter column slot drop not null;
alter table private.nat_scheduler_dispatches drop constraint if exists nat_scheduler_dispatches_slot_check;
alter table private.nat_scheduler_dispatches drop constraint if exists nat_scheduler_dispatches_dispatch_kind_check;
alter table private.nat_scheduler_dispatches add constraint nat_scheduler_dispatches_dispatch_kind_check check (
  (dispatch_kind='slot' and slot in (9,12,16,21)) or
  (dispatch_kind='retry' and slot is null)
);

create or replace function private.dispatch_nat_push_retry_poll(p_parent_id uuid default null)
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
  select decrypted_secret into v_url from vault.decrypted_secrets where name='nat_push_function_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='nat_push_cron_secret' limit 1;
  if nullif(v_url,'') is null or nullif(v_secret,'') is null then raise exception 'Push backend não configurado.' using errcode='55000'; end if;
  if p_parent_id is not null then
    select least(attempt_count+1,20) into v_attempt from private.nat_scheduler_dispatches where id=p_parent_id;
    v_attempt:=coalesce(v_attempt,1);
  end if;
  insert into private.nat_scheduler_dispatches(dispatch_kind,slot,attempt_count,parent_id)
  values('retry',null,v_attempt,p_parent_id) returning id into v_dispatch_id;
  select net.http_post(
    url:=v_url,
    headers:=jsonb_build_object('Content-Type','application/json','x-nat-cron-secret',v_secret),
    body:=jsonb_build_object('retryOnly',true),
    timeout_milliseconds:=10000
  ) into v_request_id;
  update private.nat_scheduler_dispatches set request_id=v_request_id where id=v_dispatch_id;
  return v_request_id;
end;
$$;
revoke all on function private.dispatch_nat_push_retry_poll(uuid) from public,anon,authenticated;

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
      if v_row.dispatch_kind='retry' then
        perform private.dispatch_nat_push_retry_poll(v_row.id);
      else
        perform private.dispatch_nat_push_slot(v_row.slot,v_row.id);
      end if;
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

  for v_job in select jobid from cron.job where jobname='nat-push-reconcile' loop perform cron.unschedule(v_job.jobid); end loop;
  perform cron.schedule('nat-push-reconcile','*/5 * * * *',$cron$select private.reconcile_nat_push_dispatches();$cron$);

  if not (v_url_configured and v_secret_configured) then
    return jsonb_build_object('configured',false,'reason','push secrets missing');
  end if;

  for v_job in select jobid from cron.job where jobname in ('nat-push-09','nat-push-12','nat-push-16','nat-push-21','nat-push-delivery-retry')
  loop perform cron.unschedule(v_job.jobid); end loop;
  perform cron.schedule('nat-push-09','0 12 * * *',$cron$select private.dispatch_nat_push_slot(9);$cron$);
  perform cron.schedule('nat-push-12','0 15 * * *',$cron$select private.dispatch_nat_push_slot(12);$cron$);
  perform cron.schedule('nat-push-16','0 19 * * *',$cron$select private.dispatch_nat_push_slot(16);$cron$);
  perform cron.schedule('nat-push-21','0 0 * * *',$cron$select private.dispatch_nat_push_slot(21);$cron$);
  perform cron.schedule('nat-push-delivery-retry','*/5 * * * *',$cron$select private.dispatch_nat_push_retry_poll();$cron$);
  return jsonb_build_object('configured',true,'jobs',6);
end;
$$;
revoke all on function private.reconcile_nat_push_jobs() from public,anon,authenticated;

select private.reconcile_nat_push_jobs();

commit;

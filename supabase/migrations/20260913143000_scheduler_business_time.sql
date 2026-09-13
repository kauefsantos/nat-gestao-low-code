begin;

-- Scheduler & Business Time hardening.
-- Business-facing schedules are evaluated using America/Sao_Paulo inside the job
-- functions. pg_cron only provides a stable polling cadence.
create or replace function private.nat_business_local_hour(p_at timestamptz default now())
returns integer
language sql
immutable
set search_path=''
as $$
  select extract(hour from timezone('America/Sao_Paulo', p_at))::integer
$$;
revoke all on function private.nat_business_local_hour(timestamptz) from public,anon,authenticated;

create or replace function private.dispatch_nat_push_local_tick()
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare v_hour integer;v_request bigint;
begin
  v_hour:=private.nat_business_local_hour(now());
  if v_hour in(9,12,16,21) then
    v_request:=private.dispatch_nat_push_slot(v_hour::smallint);
  else
    perform private.record_nat_job_heartbeat('nat-push-local-tick','success',jsonb_build_object('localHour',v_hour,'action','noop'));
  end if;
  return v_request;
end $$;
revoke all on function private.dispatch_nat_push_local_tick() from public,anon,authenticated;

create or replace function private.dispatch_nat_executive_summary_recovery()
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare v_hour integer;v_request bigint;
begin
  v_hour:=private.nat_business_local_hour(now());
  if v_hour not in(22,23) then
    perform private.record_nat_job_heartbeat('nat-executive-summary-recovery','success',jsonb_build_object('localHour',v_hour,'action','noop'));
    return null;
  end if;
  v_request:=private.dispatch_nat_push_slot(21);
  perform private.record_nat_job_heartbeat('nat-executive-summary-recovery','success',jsonb_build_object('localHour',v_hour,'requestId',v_request));
  return v_request;
exception when others then
  perform private.record_nat_job_heartbeat('nat-executive-summary-recovery','failed',jsonb_build_object('error',left(sqlerrm,180)));
  raise;
end $$;
revoke all on function private.dispatch_nat_executive_summary_recovery() from public,anon,authenticated;

-- Canonical contract for every operational NAT job. If a known job is missing,
-- inactive, duplicated, or edited, the reconciler restores the exact definition.
create or replace function private.ensure_nat_scheduler_contract()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  r record;
  j record;
  v_repaired integer:=0;
  v_healthy integer:=0;
begin
  for r in
    select * from (values
      ('nat-push-local-tick','0 * * * *','select private.dispatch_nat_push_local_tick();'),
      ('nat-push-delivery-retry','*/5 * * * *','select private.dispatch_nat_push_retry_poll();'),
      ('nat-push-reconcile','*/5 * * * *','select private.reconcile_nat_push_dispatches();'),
      ('nat-frontend-resilience-cleanup','45 4 * * *','select private.cleanup_frontend_resilience_logs();'),
      ('nat-operational-retention','30 4 * * *','select private.cleanup_nat_operational_logs();'),
      ('nat-receivables-tick','*/15 * * * *','select private.dispatch_nat_receivables_tick();'),
      ('nat-receivables-status','*/15 * * * *','select private.refresh_receivable_critical_statuses();'),
      ('nat-executive-summary-recovery','10 * * * *','select private.dispatch_nat_executive_summary_recovery();')
    ) as expected(jobname,schedule,command)
  loop
    if (
      select count(*)=1
        and bool_and(active)
        and bool_and(schedule=r.schedule)
        and bool_and(command=r.command)
      from cron.job
      where jobname=r.jobname
    ) then
      v_healthy:=v_healthy+1;
      continue;
    end if;

    for j in select jobid from cron.job where jobname=r.jobname loop
      perform cron.unschedule(j.jobid);
    end loop;
    perform cron.schedule(r.jobname,r.schedule,r.command);
    v_repaired:=v_repaired+1;
  end loop;

  perform private.record_nat_job_heartbeat(
    'nat-scheduler-contract','success',
    jsonb_build_object('healthy',v_healthy,'repaired',v_repaired,'expected',8)
  );
  return jsonb_build_object('healthy',v_healthy,'repaired',v_repaired,'expected',8);
exception when others then
  perform private.record_nat_job_heartbeat('nat-scheduler-contract','failed',jsonb_build_object('error',left(sqlerrm,180)));
  raise;
end $$;
revoke all on function private.ensure_nat_scheduler_contract() from public,anon,authenticated;

-- Repair current drift immediately, then keep watching for accidental cron drift.
select private.ensure_nat_scheduler_contract();
do $$ declare j record;begin
  for j in select jobid from cron.job where jobname='nat-scheduler-contract' loop
    perform cron.unschedule(j.jobid);
  end loop;
  perform cron.schedule('nat-scheduler-contract','*/15 * * * *','select private.ensure_nat_scheduler_contract();');
end $$;

commit;

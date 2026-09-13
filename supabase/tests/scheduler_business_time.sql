begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

select is(
  private.nat_business_local_hour('2026-09-13 12:00:00+00'::timestamptz),
  9,
  '12:00 UTC maps to 09:00 in America/Sao_Paulo'
);
select is(
  private.nat_business_local_hour('2026-09-14 00:00:00+00'::timestamptz),
  21,
  '00:00 UTC maps to previous-day 21:00 business hour'
);
select is(
  private.receivable_due_at(date '2026-09-13',null),
  '2026-09-13 12:00:00+00'::timestamptz,
  'date-only receivable defaults to 09:00 America/Sao_Paulo'
);

select is((select count(*)::integer from cron.job where jobname='nat-push-local-tick' and active and schedule='0 * * * *' and command='select private.dispatch_nat_push_local_tick();'),1,'local push tick contract is installed');
select is((select count(*)::integer from cron.job where jobname='nat-push-delivery-retry' and active and schedule='*/5 * * * *' and command='select private.dispatch_nat_push_retry_poll();'),1,'push retry contract is installed');
select is((select count(*)::integer from cron.job where jobname='nat-push-reconcile' and active and schedule='*/5 * * * *' and command='select private.reconcile_nat_push_dispatches();'),1,'push reconciliation contract is installed');
select is((select count(*)::integer from cron.job where jobname='nat-receivables-tick' and active and schedule='*/15 * * * *' and command='select private.dispatch_nat_receivables_tick();'),1,'receivables polling contract is installed');
select is((select count(*)::integer from cron.job where jobname='nat-receivables-status' and active and schedule='*/15 * * * *' and command='select private.refresh_receivable_critical_statuses();'),1,'receivables status contract is installed');
select is((select count(*)::integer from cron.job where jobname='nat-executive-summary-recovery' and active and schedule='10 * * * *' and command='select private.dispatch_nat_executive_summary_recovery();'),1,'executive recovery contract is installed');
select is((select count(*)::integer from cron.job where jobname='nat-scheduler-contract' and active and schedule='*/15 * * * *' and command='select private.ensure_nat_scheduler_contract();'),1,'scheduler self-healing watchdog is installed canonically');
select ok(position('ensure_nat_scheduler_contract' in pg_get_functiondef('private.dispatch_nat_push_local_tick()'::regprocedure))>0,'hourly local tick provides a secondary watchdog repair path');

-- Simulate accidental production drift. Repairs happen inside this transaction and are rolled back.
do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname='nat-push-local-tick' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;
select is((select count(*)::integer from cron.job where jobname='nat-push-local-tick'),0,'test fixture removes one required scheduler job');
select is((private.ensure_nat_scheduler_contract()->>'repaired')::integer,1,'scheduler reconciler repairs exactly the missing operational job');
select is((select count(*)::integer from cron.job where jobname='nat-push-local-tick' and active and schedule='0 * * * *' and command='select private.dispatch_nat_push_local_tick();'),1,'repaired operational scheduler job has canonical definition');

do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname='nat-scheduler-contract' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;
select is((select count(*)::integer from cron.job where jobname='nat-scheduler-contract'),0,'test fixture removes the scheduler watchdog');
select is((private.ensure_nat_scheduler_contract()->>'repaired')::integer,1,'scheduler contract can recreate its missing watchdog');
select is((select count(*)::integer from cron.job where jobname='nat-scheduler-contract' and active and schedule='*/15 * * * *' and command='select private.ensure_nat_scheduler_contract();'),1,'repaired watchdog has canonical definition');

select * from finish();
rollback;

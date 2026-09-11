-- Backend P3 operational retention. Business/audit history is intentionally preserved.
begin;

create or replace function private.cleanup_nat_operational_logs()
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  delete from public.mutation_requests where created_at < now() - interval '7 days';
  delete from public.ai_generation_log where created_at < now() - interval '90 days';
  delete from public.notification_delivery_log where created_at < now() - interval '90 days';
end;
$$;

revoke all on function private.cleanup_nat_operational_logs() from public,anon,authenticated;

-- Keep a single daily cleanup job. Operational logs are disposable; audit/business history is not touched.
do $$
declare v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname='nat-operational-retention' limit 1;
  if v_jobid is not null then perform cron.unschedule(v_jobid); end if;
  perform cron.schedule('nat-operational-retention','30 4 * * *','select private.cleanup_nat_operational_logs();');
exception when undefined_table or undefined_function then
  null;
end;
$$;

commit;

-- Preserve all pre-existing operational retention while adding integration scheduler telemetry.
begin;

create or replace function private.cleanup_nat_operational_logs()
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  delete from public.mutation_requests where created_at < now() - interval '7 days';
  delete from public.api_idempotency_requests where created_at < now() - interval '7 days';
  delete from public.ai_generation_log where created_at < now() - interval '90 days';
  delete from public.notification_delivery_log where created_at < now() - interval '90 days';
  delete from private.nat_scheduler_dispatches where created_at < now() - interval '30 days';
end;
$$;

revoke all on function private.cleanup_nat_operational_logs() from public,anon,authenticated;

commit;

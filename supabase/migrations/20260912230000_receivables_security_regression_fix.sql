begin;

-- Keep the new receivables delivery ledger under the same strict RLS posture as every
-- other public application table. Only service-role workflows use this ledger directly.
alter table public.business_alert_delivery_log enable row level security;
alter table public.business_alert_delivery_log force row level security;
revoke all on table public.business_alert_delivery_log from public,anon,authenticated;
grant select,insert,update,delete on table public.business_alert_delivery_log to service_role;

-- PostgreSQL grants EXECUTE on newly-created functions to PUBLIC by default. These are
-- implementation helpers for triggers/service jobs and must never be callable by clients.
revoke all on function private.sale_receivable_defaults() from public,anon,authenticated;
revoke all on function private.receivable_due_at(date,time) from public,anon,authenticated;
revoke all on function private.refresh_customer_credit_status() from public,anon,authenticated;
revoke all on function private.is_street_customer_source(text) from public,anon,authenticated;
revoke all on function private.normalize_pending_receivable_financials() from public,anon,authenticated;
revoke all on function private.refresh_receivable_critical_statuses() from public,anon,authenticated;
revoke all on function private.dispatch_nat_receivables_tick() from public,anon,authenticated;
revoke all on function private.dispatch_nat_executive_summary_recovery() from public,anon,authenticated;

commit;

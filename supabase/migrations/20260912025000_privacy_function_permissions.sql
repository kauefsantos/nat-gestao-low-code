-- Keep implementation helpers private and preserve the authenticated customer write RPC.
revoke all on function private.customer_audit_payload(jsonb) from public, anon, authenticated;
revoke all on function private.cleanup_privacy_retention_v1() from public, anon, authenticated;
grant execute on function public.save_customer(uuid,uuid,text,text,text,text,boolean,text,boolean) to authenticated;

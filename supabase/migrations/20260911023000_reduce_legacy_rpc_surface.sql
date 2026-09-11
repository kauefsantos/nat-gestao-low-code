-- Final hardening: keep compatibility wrappers in the schema, but expose only current API versions to authenticated clients.
begin;

revoke execute on function public.apply_nat_transition(uuid,jsonb) from public,anon,authenticated;
revoke execute on function public.save_sale(uuid,uuid,uuid,numeric,numeric,text,timestamptz) from public,anon,authenticated;
revoke execute on function public.delete_sale(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.save_calendar_event(uuid,uuid,date,time,text,text,text,text,text,text) from public,anon,authenticated;
revoke execute on function public.delete_calendar_event(uuid,uuid) from public,anon,authenticated;

commit;

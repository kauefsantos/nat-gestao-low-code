-- NAT Gestão focused RLS regression tests for calendar, push and AI boundaries.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into public.businesses(id,name) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','Calendar Tenant A'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','Calendar Tenant B');

insert into private.allowed_auth_emails(email,business_id,role) values
  ('rls-calendar-a@example.invalid','cccccccc-cccc-4ccc-8ccc-cccccccccccc','admin'),
  ('rls-calendar-b@example.invalid','dddddddd-dddd-4ddd-8ddd-dddddddddddd','admin')
on conflict (email) do update set business_id=excluded.business_id, role=excluded.role;

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('44444444-4444-4444-8444-444444444444','rls-calendar-a@example.invalid','authenticated','authenticated',now(),now()),
  ('55555555-5555-4555-8555-555555555555','rls-calendar-b@example.invalid','authenticated','authenticated',now(),now());

insert into public.business_members(business_id,user_id,role) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','44444444-4444-4444-8444-444444444444','admin'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','55555555-5555-4555-8555-555555555555','admin');

insert into public.calendar_events(id,business_id,event_date,event_time,kind,title,status,source) values
  ('cccccccc-0000-4000-8000-000000000001','cccccccc-cccc-4ccc-8ccc-cccccccccccc','2026-09-20','10:00','production','Produção Tenant A','planned','manual'),
  ('dddddddd-0000-4000-8000-000000000001','dddddddd-dddd-4ddd-8ddd-dddddddddddd','2026-09-20','11:00','delivery','Entrega Tenant B','planned','manual');

select ok(
  (select relrowsecurity from pg_class where oid='public.calendar_events'::regclass),
  'calendar_events has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid='public.push_subscriptions'::regclass),
  'push_subscriptions has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid='public.notification_delivery_log'::regclass),
  'notification_delivery_log has RLS enabled'
);
select ok(not has_table_privilege('authenticated','public.calendar_events','insert'), 'calendar events cannot be inserted directly');
select ok(not has_table_privilege('authenticated','public.calendar_events','update'), 'calendar events cannot be updated directly');
select ok(not has_table_privilege('authenticated','public.calendar_events','delete'), 'calendar events cannot be deleted directly');
select ok(not has_table_privilege('authenticated','public.push_subscriptions','select'), 'push subscriptions cannot be read directly');
select ok(not has_table_privilege('authenticated','public.push_subscriptions','insert'), 'push subscriptions cannot be inserted directly');
select ok(not has_table_privilege('authenticated','public.notification_delivery_log','select'), 'delivery log cannot be read directly');
select ok(not has_table_privilege('authenticated','public.notification_delivery_log','insert'), 'delivery log cannot be forged directly');
select ok(
  not has_function_privilege('authenticated','public.get_push_backend_config()','execute'),
  'authenticated clients cannot execute push backend secret RPC'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated","aal":"aal1"}',true);

select is((select count(*)::bigint from public.calendar_events),0::bigint,'AAL1 sees no calendar events');
select throws_ok(
  $$select public.save_calendar_event_v2('cccccccc-cccc-4ccc-8ccc-cccccccccccc','cccccccc-0000-4000-8000-000000000010',null,'2026-09-21','09:30','content','AAL1 blocked',null,null,null,'planned',false)$$,
  '42501', null, 'AAL1 cannot save calendar events'
);

select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated","aal":"aal2"}',true);

select is((select count(*)::bigint from public.calendar_events),1::bigint,'AAL2 sees only calendar events from its tenant');
select lives_ok(
  $$select public.save_calendar_event_v2('cccccccc-cccc-4ccc-8ccc-cccccccccccc','cccccccc-0000-4000-8000-000000000010',null,'2026-09-21','09:30','content','Post Tenant A','Teste de conteúdo','Instagram','Engajamento','planned',false)$$,
  'AAL2 member can save an event in its own tenant'
);
select throws_ok(
  $$select public.save_calendar_event_v2('dddddddd-dddd-4ddd-8ddd-dddddddddddd','dddddddd-0000-4000-8000-000000000010',null,'2026-09-21','09:30','content','Cross tenant blocked',null,null,null,'planned',false)$$,
  '42501', null, 'calendar RPC rejects writes to another tenant'
);
select throws_ok(
  $$select public.cancel_calendar_event_v2('dddddddd-dddd-4ddd-8ddd-dddddddddddd','dddddddd-0000-4000-8000-000000000001',null)$$,
  '42501', null, 'calendar cancel RPC rejects another tenant'
);
select throws_ok(
  $$select public.save_push_subscription('dddddddd-dddd-4ddd-8ddd-dddddddddddd','https://push.example.invalid/cross-tenant','abcdefghijklmnopqrstuvwxyz0123456789','abcdefghijklmno')$$,
  '42501', null, 'push subscription RPC rejects another tenant'
);
select throws_ok(
  $$select public.content_ai_status('dddddddd-dddd-4ddd-8ddd-dddddddddddd')$$,
  '42501', null, 'AI status RPC rejects another tenant'
);

select * from finish();
rollback;
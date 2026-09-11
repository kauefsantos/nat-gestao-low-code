-- Backend P3 regression tests.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

select has_table('public','mutation_requests','idempotency ledger exists');
select ok((select relrowsecurity from pg_class where oid='public.mutation_requests'::regclass),'idempotency ledger has RLS');
select ok(not has_table_privilege('authenticated','public.mutation_requests','select'),'authenticated cannot read idempotency ledger directly');
select ok((select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='apply_nat_transition_v2'),'idempotent transition RPC is SECURITY DEFINER');
select ok(has_function_privilege('authenticated','public.apply_nat_transition_v2(uuid,uuid,jsonb)','execute'),'authenticated can execute idempotent transition RPC');
select ok((select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_dashboard_summary'),'dashboard summary is SECURITY DEFINER');
select ok(has_function_privilege('authenticated','public.get_dashboard_summary(uuid,date)','execute'),'authenticated can execute dashboard summary');
select ok(has_function_privilege('authenticated','public.list_sales_page(uuid,integer,timestamptz,uuid)','execute'),'authenticated can execute paginated sales history');
select has_column('public','calendar_events','reminder_enabled','calendar events support per-event reminders');
select has_column('public','calendar_events','completed_at','calendar completion is historical');
select has_column('public','calendar_events','cancelled_at','calendar cancellation is historical');
select has_table('public','calendar_seed_runs','calendar seed execution is tracked');
select ok((select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='save_calendar_event_v2'),'versioned calendar save is SECURITY DEFINER');
select ok((select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='cancel_calendar_event_v2'),'versioned calendar cancel is SECURITY DEFINER');

insert into public.businesses(id,name) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','Backend P3');
insert into private.allowed_auth_emails(email,business_id,role) values ('backend-p3@example.invalid','cccccccc-cccc-4ccc-8ccc-cccccccccccc','admin');
insert into auth.users(id,email,aud,role,created_at,updated_at) values ('33333333-3333-4333-8333-333333333333','backend-p3@example.invalid','authenticated','authenticated',now(),now());
insert into public.business_members(business_id,user_id,role) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','33333333-3333-4333-8333-333333333333','admin');
insert into public.business_settings(business_id,owner_name,payment_fee_percent) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','Backend P3',5);

set local role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal2"}',true);

select lives_ok(
  $$select public.apply_nat_transition_v2('cccccccc-cccc-4ccc-8ccc-cccccccccccc','cccccccc-0000-4000-8000-000000000001','[{"type":"save_sporadic_expense","expectedUpdatedAt":null,"payload":{"id":"cccccccc-0000-4000-8000-000000000010","name":"Taxa de teste","amount":12.5,"spentAt":"2026-09-10"}}]'::jsonb)$$,
  'first idempotent mutation succeeds'
);
select is((select count(*)::bigint from public.sporadic_expenses where id='cccccccc-0000-4000-8000-000000000010'),1::bigint,'first mutation creates one row');
select lives_ok(
  $$select public.apply_nat_transition_v2('cccccccc-cccc-4ccc-8ccc-cccccccccccc','cccccccc-0000-4000-8000-000000000001','[{"type":"save_sporadic_expense","expectedUpdatedAt":null,"payload":{"id":"cccccccc-0000-4000-8000-000000000010","name":"Taxa de teste","amount":12.5,"spentAt":"2026-09-10"}}]'::jsonb)$$,
  'replaying the same request is safe'
);
select is((select count(*)::bigint from public.sporadic_expenses where id='cccccccc-0000-4000-8000-000000000010'),1::bigint,'replay does not duplicate the row');
select throws_ok(
  $$select public.apply_nat_transition_v2('cccccccc-cccc-4ccc-8ccc-cccccccccccc','cccccccc-0000-4000-8000-000000000001','[{"type":"save_sporadic_expense","expectedUpdatedAt":null,"payload":{"id":"cccccccc-0000-4000-8000-000000000011","name":"Payload diferente","amount":99,"spentAt":"2026-09-10"}}]'::jsonb)$$,
  '40001','CONFLICT: identificador de alteração reutilizado com conteúdo diferente.','request id cannot be reused for a different mutation'
);

select lives_ok(
  $$select public.save_calendar_event_v2('cccccccc-cccc-4ccc-8ccc-cccccccccccc','cccccccc-0000-4000-8000-000000000020',null,'2026-09-20','15:30','delivery','Entrega teste','Levar caixa','WhatsApp','Entregar no prazo','planned',true)$$,
  'calendar event can be created with reminder enabled'
);
select lives_ok(
  $$select public.cancel_calendar_event_v2('cccccccc-cccc-4ccc-8ccc-cccccccccccc','cccccccc-0000-4000-8000-000000000020',(select updated_at::text from public.calendar_events where id='cccccccc-0000-4000-8000-000000000020'))$$,
  'calendar event can be cancelled without deletion'
);
select is((select status from public.calendar_events where id='cccccccc-0000-4000-8000-000000000020'),'cancelled'::text,'cancelled event remains in history');
select is((select count(*)::bigint from public.calendar_events where id='cccccccc-0000-4000-8000-000000000020'),1::bigint,'calendar cancellation preserves the row');

select lives_ok($$select public.seed_nat_editorial_calendar('cccccccc-cccc-4ccc-8ccc-cccccccccccc')$$,'editorial seed runs once');
select is((select count(*)::bigint from public.calendar_events where business_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' and source='editorial_seed'),13::bigint,'editorial seed creates the expected suggestions');
select lives_ok(
  $$select public.cancel_calendar_event_v2(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    (select id from public.calendar_events where business_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' and source='editorial_seed' and title='Pré-lançamento da NAT'),
    (select updated_at::text from public.calendar_events where business_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' and source='editorial_seed' and title='Pré-lançamento da NAT')
  )$$,
  'versioned cancellation preserves a seeded event'
);
select lives_ok($$select public.seed_nat_editorial_calendar('cccccccc-cccc-4ccc-8ccc-cccccccccccc')$$,'reloading the seed is harmless');
select is((select count(*)::bigint from public.calendar_events where business_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' and source='editorial_seed' and title='Pré-lançamento da NAT' and status='cancelled'),1::bigint,'cancelled seed suggestion does not reappear');
select is((select count(*)::bigint from public.calendar_events where business_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' and source='editorial_seed'),13::bigint,'seed reload does not duplicate suggestions');
select is(jsonb_typeof(public.get_dashboard_summary('cccccccc-cccc-4ccc-8ccc-cccccccccccc','2026-09-10')),'object'::text,'dashboard summary returns a JSON object');
select is(jsonb_typeof(public.list_sales_page('cccccccc-cccc-4ccc-8ccc-cccccccccccc',30,null,null)),'object'::text,'sales pagination returns a JSON object');
select ok(not has_function_privilege('authenticated','private.cleanup_nat_operational_logs()','execute'),'operational cleanup is backend-only');
reset role;
select ok(exists(select 1 from cron.job where jobname='nat-operational-retention'),'daily operational retention job exists');

select * from finish();
rollback;
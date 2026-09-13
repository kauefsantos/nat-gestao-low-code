-- Backend P2 regression tests.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

select has_column('public','sales','updated_at','sales participate in record-level versioning');
select has_table('public','ai_generation_log','AI observability table exists');
select ok((select relrowsecurity from pg_class where oid='public.ai_generation_log'::regclass),'AI usage log has RLS enabled');
select ok((select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='apply_nat_transition_v4'),'current transition RPC is SECURITY DEFINER');
select ok(has_function_privilege('authenticated','public.apply_nat_transition_v4(uuid,uuid,jsonb)','execute'),'authenticated can invoke current transition RPC');
select ok(not has_function_privilege('anon','public.apply_nat_transition_v4(uuid,uuid,jsonb)','execute'),'anon cannot invoke current transition RPC');
select ok(not has_table_privilege('authenticated','public.ai_generation_log','select'),'authenticated cannot read AI usage log directly');
select ok(not has_function_privilege('authenticated','public.claim_content_ai_quota(uuid,uuid,text,integer)','execute'),'AI quota claim is backend-only');

insert into public.businesses(id,name) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','Backend P2');
insert into private.allowed_auth_emails(email,business_id,role) values ('backend-p2@example.invalid','dddddddd-dddd-4ddd-8ddd-dddddddddddd','admin');
insert into auth.users(id,email,aud,role,created_at,updated_at) values ('44444444-4444-4444-8444-444444444444','backend-p2@example.invalid','authenticated','authenticated',now(),now());
insert into public.business_members(business_id,user_id,role) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','44444444-4444-4444-8444-444444444444','admin');
insert into public.business_settings(business_id,owner_name,payment_fee_percent) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','Backend P2',5);
insert into public.supplies(id,business_id,name,category) values
  ('dddddddd-0000-4000-8000-000000000001','dddddddd-dddd-4ddd-8ddd-dddddddddddd','Chocolate','ingredient'),
  ('dddddddd-0000-4000-8000-000000000002','dddddddd-dddd-4ddd-8ddd-dddddddddddd','Embalagem','packaging');
-- An unrelated record changes before the transition. It must not block editing Chocolate.
update public.supplies set name='Embalagem nova' where id='dddddddd-0000-4000-8000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated","aal":"aal2"}',true);

select public.apply_nat_transition_v4(
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'dddddddd-1000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object(
    'type','save_supply',
    'expectedUpdatedAt',(select updated_at::text from public.supplies where id='dddddddd-0000-4000-8000-000000000001'),
    'payload',jsonb_build_object(
      'id','dddddddd-0000-4000-8000-000000000001','name','Chocolate 50%','category','ingredient',
      'packageQuantity',1000,'packageUnit','g','packagePrice',30,'purchasedAt','2026-09-10'
    )
  ))
);
select pass('an unrelated record change does not block the intended record');
select is((select name from public.supplies where id='dddddddd-0000-4000-8000-000000000001'),'Chocolate 50%'::text,'atomic transition saved the intended record');

select throws_ok(
  $$select public.apply_nat_transition_v4('dddddddd-dddd-4ddd-8ddd-dddddddddddd','dddddddd-1000-4000-8000-000000000002','[{"type":"save_supply","expectedUpdatedAt":"2000-01-01T00:00:00Z","payload":{"id":"dddddddd-0000-4000-8000-000000000001","name":"Stale","category":"ingredient","packageQuantity":1000,"packageUnit":"g","packagePrice":30,"purchasedAt":"2026-09-10"}}]'::jsonb)$$,
  '40001','CONFLICT: supply foi alterado em outro aparelho.','stale record version is rejected atomically'
);

select throws_ok(
  $$select public.apply_nat_transition_v4('dddddddd-dddd-4ddd-8ddd-dddddddddddd','dddddddd-1000-4000-8000-000000000003','[{"type":"save_sporadic_expense","payload":{"id":"dddddddd-0000-4000-8000-000000000010","name":"Teste rollback","amount":10,"spentAt":"2026-09-10"}},{"type":"unsupported","payload":{"id":"dddddddd-0000-4000-8000-000000000011"}}]'::jsonb)$$,
  '22023','Operação não suportada: unsupported.','a later failure aborts the whole transition'
);
select is((select count(*)::bigint from public.sporadic_expenses where id='dddddddd-0000-4000-8000-000000000010'),0::bigint,'failed transition leaves no partial write');

reset role;
set local role service_role;
select ok(public.claim_content_ai_quota('dddddddd-dddd-4ddd-8ddd-dddddddddddd','44444444-4444-4444-8444-444444444444','feed',120) is not null,'backend can claim an AI quota slot');
reset role;
insert into public.ai_generation_log(business_id,user_id,format,prompt_chars)
select 'dddddddd-dddd-4ddd-8ddd-dddddddddddd','44444444-4444-4444-8444-444444444444','feed',100 from generate_series(1,9);
set local role service_role;
select is(public.claim_content_ai_quota('dddddddd-dddd-4ddd-8ddd-dddddddddddd','44444444-4444-4444-8444-444444444444','feed',120),null::uuid,'AI quota refuses the 11th attempt in ten minutes');

select * from finish();
rollback;

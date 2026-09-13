-- ASVS session termination regression: a revoked Supabase session must stop
-- authorizing RLS/RPC access even while its signed JWT has not expired yet.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into public.businesses(id,name)
values ('f1000000-0000-4000-8000-000000000001','Session Revocation Tenant');
insert into private.allowed_auth_emails(email,business_id,role)
values ('session-revocation@example.invalid','f1000000-0000-4000-8000-000000000001','admin');
insert into auth.users(id,email,aud,role,created_at,updated_at)
values ('f2000000-0000-4000-8000-000000000001','session-revocation@example.invalid','authenticated','authenticated',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at)
values ('f3000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001',now(),now());
insert into public.business_members(business_id,user_id,role)
values ('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','admin');
insert into public.supplies(id,business_id,name,category,active)
values ('f4000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','Session-only supply','ingredient',true);

select ok(
  not has_function_privilege('authenticated','public.is_active_auth_session_for_user(uuid,uuid)','execute'),
  'session validation RPC is service-role only'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000001',true);
select set_config(
  'request.jwt.claims',
  '{"sub":"f2000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","iss":"http://127.0.0.1:54321/auth/v1","session_id":"f3000000-0000-4000-8000-000000000001"}',
  true
);
select is((select count(*)::bigint from public.supplies),1::bigint,'active AAL2 session can read its tenant');
select lives_ok(
  $$select public.apply_nat_transition_v4('f1000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object('type','save_supply','payload',jsonb_build_object('id','f4000000-0000-4000-8000-000000000002','name','Before logout','category','ingredient','packageQuantity',100,'packageUnit','g','packagePrice',5,'purchasedAt',current_date::text))))$$,
  'active session can use current business transition'
);

reset role;
delete from auth.sessions where id='f3000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000001',true);
select set_config(
  'request.jwt.claims',
  '{"sub":"f2000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","iss":"http://127.0.0.1:54321/auth/v1","session_id":"f3000000-0000-4000-8000-000000000001"}',
  true
);
select is((select count(*)::bigint from public.supplies),0::bigint,'same JWT loses RLS access immediately after session revocation');
select throws_ok(
  $$select public.apply_nat_transition_v4('f1000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000002',jsonb_build_array(jsonb_build_object('type','save_supply','payload',jsonb_build_object('id','f4000000-0000-4000-8000-000000000003','name','After logout','category','ingredient','packageQuantity',100,'packageUnit','g','packagePrice',5,'purchasedAt',current_date::text))))$$,
  '42501',null,'same revoked JWT cannot write through current transition'
);
select throws_ok(
  $$select public.bootstrap_nat_business('Must fail','Must fail')$$,
  '42501','Sessão inválida ou MFA ausente.','revoked session cannot bootstrap access'
);

select * from finish();
rollback;

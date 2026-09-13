-- Privacy erasure must be executable only by a business administrator.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into public.businesses(id,name)
values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Privacy RBAC');

insert into private.allowed_auth_emails(email,business_id,role)
values
  ('privacy-admin@example.invalid','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','admin'),
  ('privacy-member@example.invalid','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','member');

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('eeeeeeee-0000-4000-8000-000000000001','privacy-admin@example.invalid','authenticated','authenticated',now(),now()),
  ('eeeeeeee-0000-4000-8000-000000000002','privacy-member@example.invalid','authenticated','authenticated',now(),now());

insert into public.business_members(business_id,user_id,role)
values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeeeeeee-0000-4000-8000-000000000001','admin'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeeeeeee-0000-4000-8000-000000000002','member');

insert into public.customers(id,business_id,name)
values
  ('eeeeeeee-1000-4000-8000-000000000001','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Cliente protegido'),
  ('eeeeeeee-1000-4000-8000-000000000002','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Cliente apagável');

set local role authenticated;
select set_config('request.jwt.claim.sub','eeeeeeee-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"eeeeeeee-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);

select ok(
  has_function_privilege('authenticated','public.erase_customer_privacy_v1(uuid,uuid,text)','execute'),
  'privacy erasure RPC remains callable so it can enforce RBAC authoritatively'
);
select throws_ok(
  $$select public.erase_customer_privacy_v1('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeeeeeee-1000-4000-8000-000000000001','tentativa de membro')$$,
  '42501', null,
  'non-admin member cannot erase customer personal data'
);
select ok(
  exists(select 1 from public.customers where id='eeeeeeee-1000-4000-8000-000000000001'),
  'failed non-admin erasure preserves the customer'
);

select set_config('request.jwt.claim.sub','eeeeeeee-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"eeeeeeee-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select lives_ok(
  $$select public.erase_customer_privacy_v1('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeeeeeee-1000-4000-8000-000000000002','solicitação validada por admin')$$,
  'admin can erase customer personal data'
);
select ok(
  not exists(select 1 from public.customers where id='eeeeeeee-1000-4000-8000-000000000002'),
  'successful admin erasure removes the customer record'
);

select * from finish();
rollback;

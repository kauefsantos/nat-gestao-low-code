-- NAT Gestão security regression tests (pgTAP).
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into public.businesses(id,name) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Tenant A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Tenant B');
insert into private.allowed_auth_emails(email,business_id,role) values
  ('rls-a@example.invalid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin'),
  ('rls-b@example.invalid','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','admin'),
  ('rls-a2@example.invalid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','member')
on conflict (email) do update set business_id=excluded.business_id, role=excluded.role;
insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('11111111-1111-4111-8111-111111111111','rls-a@example.invalid','authenticated','authenticated',now(),now()),
  ('22222222-2222-4222-8222-222222222222','rls-b@example.invalid','authenticated','authenticated',now(),now()),
  ('33333333-3333-4333-8333-333333333333','rls-a2@example.invalid','authenticated','authenticated',now(),now());
insert into public.business_members(business_id,user_id,role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','admin'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','admin');
insert into public.business_settings(business_id,owner_name,payment_fee_percent) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','A',5),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','B',0);
insert into public.supplies(id,business_id,name,category) values
  ('aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Chocolate A','ingredient'),
  ('bbbbbbbb-0000-4000-8000-000000000001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Chocolate B','ingredient');
insert into public.supply_purchases(business_id,supply_id,package_quantity,package_unit,package_price,purchased_at) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000001',1000,'g',30,current_date),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bbbbbbbb-0000-4000-8000-000000000001',1000,'g',40,current_date);
insert into public.products(id,business_id,name,batch_yield,selling_price,production_cost_per_batch,loss_percent) values
  ('aaaaaaaa-0000-4000-8000-000000000002','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Brownie A',10,5,1,0),
  ('bbbbbbbb-0000-4000-8000-000000000002','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Brownie B',10,6,0,0);
insert into public.recipe_items(business_id,product_id,supply_id,quantity,unit) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000002','aaaaaaaa-0000-4000-8000-000000000001',100,'g');

select ok(not has_table_privilege('anon','public.sales','select'), 'anon cannot read sales');
select ok(not has_table_privilege('anon','public.supplies','select'), 'anon cannot read supplies');
select ok(not has_table_privilege('authenticated','public.sales','insert'), 'authenticated cannot insert sales directly');
select ok(not has_table_privilege('authenticated','public.sales','update'), 'authenticated cannot update sales directly');
select ok(not has_table_privilege('authenticated','public.sale_items','insert'), 'authenticated cannot insert sale items directly');
select ok(not has_table_privilege('authenticated','public.supply_purchases','update'), 'purchase history cannot be updated directly');
select ok(not has_table_privilege('authenticated','public.audit_log','insert'), 'frontend cannot forge audit log');

set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}',true);
select is((select count(*)::bigint from public.supplies),0::bigint,'AAL1 sees no protected rows');
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',true);
select is((select count(*)::bigint from public.supplies),1::bigint,'AAL2 sees only its tenant');
select throws_ok(
  $$insert into public.supplies(business_id,name,category) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Blocked','ingredient')$$,
  '42501', null, 'cross-tenant insert is blocked'
);
select throws_ok(
  $$update public.supplies set business_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where id='aaaaaaaa-0000-4000-8000-000000000001'$$,
  '42501', null, 'cross-tenant move is blocked'
);
select throws_ok(
  $$select public.delete_supply('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000001')$$,
  '23503', null, 'ingredient used by active recipe cannot be archived'
);
select throws_ok(
  $$update public.business_members set role='member' where business_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id='11111111-1111-4111-8111-111111111111'$$,
  '23514', null, 'sole admin cannot be demoted'
);
select lives_ok(
  $$select public.save_sale('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000010','aaaaaaaa-0000-4000-8000-000000000002',2,10,'pix',now())$$,
  'server-authoritative sale can be created'
);
select is(
  (select round(si.unit_cost_snapshot,2) from public.sale_items si where sale_id='aaaaaaaa-0000-4000-8000-000000000010'),
  0.40::numeric,
  'server computes unit cost snapshot (R$ 0.40)'
);
select is(
  (select round(s.contribution_snapshot,2) from public.sales s where id='aaaaaaaa-0000-4000-8000-000000000010'),
  8.70::numeric,
  'server computes contribution snapshot (R$ 8.70)'
);

reset role;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is(
  public.bootstrap_nat_business('Should not create','User'),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  'allowlisted second user joins the pre-assigned business'
);

select * from finish();
rollback;

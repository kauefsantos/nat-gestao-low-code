-- Authorization matrix regression tests: visitor, AAL1, member, admin and cross-tenant isolation.
begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

insert into public.businesses(id,name) values
  ('e1000000-0000-4000-8000-000000000001','Authorization Tenant A'),
  ('e1000000-0000-4000-8000-000000000002','Authorization Tenant B');

insert into private.allowed_auth_emails(email,business_id,role) values
  ('authorization-admin-a@example.invalid','e1000000-0000-4000-8000-000000000001','admin'),
  ('authorization-member-a@example.invalid','e1000000-0000-4000-8000-000000000001','member'),
  ('authorization-admin-b@example.invalid','e1000000-0000-4000-8000-000000000002','admin'),
  ('authorization-extra-a@example.invalid','e1000000-0000-4000-8000-000000000001','member');

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('e2000000-0000-4000-8000-000000000001','authorization-admin-a@example.invalid','authenticated','authenticated',now(),now()),
  ('e2000000-0000-4000-8000-000000000002','authorization-member-a@example.invalid','authenticated','authenticated',now(),now()),
  ('e2000000-0000-4000-8000-000000000003','authorization-admin-b@example.invalid','authenticated','authenticated',now(),now()),
  ('e2000000-0000-4000-8000-000000000004','authorization-extra-a@example.invalid','authenticated','authenticated',now(),now());

insert into public.business_members(business_id,user_id,role) values
  ('e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','admin'),
  ('e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000002','member'),
  ('e1000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000003','admin');

insert into public.business_settings(
  business_id,owner_name,monthly_fixed_costs,payment_fee_percent,
  pix_fee_percent,cash_fee_percent,card_fee_percent,
  default_minimum_margin_percent,default_target_margin_percent,
  owner_hourly_rate,owner_daily_hours
) values
  ('e1000000-0000-4000-8000-000000000001','Owner A',100,3,0,0,3,10,20,20,3),
  ('e1000000-0000-4000-8000-000000000002','Owner B',200,4,0,0,4,10,20,20,3);

insert into public.supplies(id,business_id,name,category,active) values
  ('e3000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','Supply A','ingredient',true),
  ('e3000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000002','Supply B','ingredient',true);

select is(
  (select count(*)::bigint from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity),
  0::bigint,
  'every public application table has RLS enabled'
);
select is(
  (select count(*)::bigint from information_schema.role_table_grants where table_schema='public' and grantee='anon'),
  0::bigint,
  'visitor role has no direct table privileges'
);
select is(
  (select count(*)::bigint from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('anon',p.oid,'execute')),
  0::bigint,
  'visitor role cannot execute public application RPCs'
);
select ok(not has_table_privilege('authenticated','public.push_subscriptions','select'),'push subscriptions are service/RPC only');
select ok(not has_table_privilege('authenticated','public.notification_delivery_log','select'),'notification delivery log is service only');
select ok(not has_table_privilege('authenticated','public.ai_generation_log','select'),'AI generation log is not directly readable');
select ok(not has_table_privilege('authenticated','public.mutation_requests','select'),'idempotency request log is not directly readable');
select ok(not has_table_privilege('authenticated','public.calendar_seed_runs','select'),'calendar seed log is not directly readable');
select ok(not has_table_privilege('authenticated','public.audit_log','insert'),'authenticated clients cannot forge audit records');
select ok(not has_function_privilege('authenticated','private.prevent_history_mutation()','execute'),'history trigger helper is not client-executable');
select ok(not has_function_privilege('authenticated','private.validate_business_margin()','execute'),'business margin trigger helper is not client-executable');
select ok(not has_function_privilege('authenticated','private.validate_product_margin()','execute'),'product margin trigger helper is not client-executable');
select ok(not has_function_privilege('authenticated','private.validate_settings_margin()','execute'),'settings margin trigger helper is not client-executable');

set local role authenticated;
select set_config('request.jwt.claim.sub','e2000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"e2000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
select is((select count(*)::bigint from public.supplies),0::bigint,'AAL1 member sees no protected operational rows');
select throws_ok(
  $$select public.apply_nat_transition_v4('e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object('type','save_supply','payload',jsonb_build_object('id','e3000000-0000-4000-8000-000000000010','name','AAL1 blocked','category','ingredient','packageQuantity',100,'packageUnit','g','packagePrice',10,'purchasedAt',current_date::text))))$$,
  '42501',null,'AAL1 member cannot write through protected transition'
);

select set_config('request.jwt.claims','{"sub":"e2000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
select is((select count(*)::bigint from public.supplies where business_id='e1000000-0000-4000-8000-000000000001'),1::bigint,'member reads own tenant operational data');
select is((select count(*)::bigint from public.supplies where business_id='e1000000-0000-4000-8000-000000000002'),0::bigint,'member cannot read another tenant operational data');
select is((select count(*)::bigint from public.business_members),2::bigint,'member sees membership only for own tenant');
select is((select count(*)::bigint from public.audit_log),0::bigint,'ordinary member cannot read audit log');
select lives_ok(
  $$update public.business_settings set owner_name='DIRECT MEMBER' where business_id='e1000000-0000-4000-8000-000000000001'$$,
  'member direct settings UPDATE is safely filtered by RLS'
);
select is((select owner_name from public.business_settings where business_id='e1000000-0000-4000-8000-000000000001'),'Owner A','member cannot change settings directly');
select lives_ok(
  $$update public.businesses set name='DIRECT MEMBER' where id='e1000000-0000-4000-8000-000000000001'$$,
  'member direct business UPDATE is safely filtered by RLS'
);
select is((select name from public.businesses where id='e1000000-0000-4000-8000-000000000001'),'Authorization Tenant A','member cannot change business metadata');
select throws_ok(
  $$select public.apply_nat_transition_v4('e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000002',jsonb_build_array(jsonb_build_object('type','save_business_settings','expectedUpdatedAt',(select updated_at::text from public.business_settings where business_id='e1000000-0000-4000-8000-000000000001'),'payload',jsonb_build_object('ownerName','RPC MEMBER','monthlyFixedCosts',321,'paymentFeePercent',3,'pixFeePercent',0,'cashFeePercent',0,'cardFeePercent',3,'defaultMinimumMarginPercent',10,'defaultTargetMarginPercent',20,'ownerHourlyRate',20,'ownerDailyHours',3,'fixedCostFundingSource','owner'))))$$,
  '42501','Apenas administradores podem alterar as configurações do negócio.','member cannot bypass admin-only settings through current transition'
);
select throws_ok(
  $$select public.configure_content_ai('e1000000-0000-4000-8000-000000000001',repeat('x',32))$$,
  '42501',null,'member cannot configure business AI secret'
);
select lives_ok(
  $$select public.apply_nat_transition_v4('e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000003',jsonb_build_array(jsonb_build_object('type','save_supply','payload',jsonb_build_object('id','e3000000-0000-4000-8000-000000000011','name','Own member RPC','category','ingredient','packageQuantity',100,'packageUnit','g','packagePrice',10,'purchasedAt',current_date::text))))$$,
  'member can create operational data in own tenant through current transition'
);
select throws_ok(
  $$select public.apply_nat_transition_v4('e1000000-0000-4000-8000-000000000002','e4000000-0000-4000-8000-000000000004',jsonb_build_array(jsonb_build_object('type','save_supply','payload',jsonb_build_object('id','e3000000-0000-4000-8000-000000000012','name','Cross tenant RPC','category','ingredient','packageQuantity',100,'packageUnit','g','packagePrice',10,'purchasedAt',current_date::text))))$$,
  '42501',null,'member transition cannot write another tenant'
);
select throws_ok(
  $$insert into public.business_members(business_id,user_id,role) values('e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000004','member')$$,
  '42501',null,'member cannot add another user to the business'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','e2000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select lives_ok(
  $$select public.apply_nat_transition_v4('e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000005',jsonb_build_array(jsonb_build_object('type','save_business_settings','expectedUpdatedAt',(select updated_at::text from public.business_settings where business_id='e1000000-0000-4000-8000-000000000001'),'payload',jsonb_build_object('ownerName','ADMIN RPC','monthlyFixedCosts',456,'paymentFeePercent',3,'pixFeePercent',0,'cashFeePercent',0,'cardFeePercent',3,'defaultMinimumMarginPercent',10,'defaultTargetMarginPercent',20,'ownerHourlyRate',20,'ownerDailyHours',3,'fixedCostFundingSource','owner'))))$$,
  'admin can update business settings through current transition'
);
select is((select owner_name from public.business_settings where business_id='e1000000-0000-4000-8000-000000000001'),'ADMIN RPC','admin settings change is persisted');
select lives_ok(
  $$update public.businesses set name='ADMIN DIRECT' where id='e1000000-0000-4000-8000-000000000001'$$,
  'admin may update own business metadata'
);
select is((select name from public.businesses where id='e1000000-0000-4000-8000-000000000001'),'ADMIN DIRECT','admin business metadata update is persisted');
select ok((select count(*) from public.audit_log where business_id='e1000000-0000-4000-8000-000000000001')>0,'admin can read audit records from own tenant');
select is((select count(*)::bigint from public.audit_log where business_id='e1000000-0000-4000-8000-000000000002'),0::bigint,'admin cannot read another tenant audit log');
select is((select count(*)::bigint from public.supplies where business_id='e1000000-0000-4000-8000-000000000002'),0::bigint,'admin cannot read another tenant operational data');
select throws_ok(
  $$select public.apply_nat_transition_v4('e1000000-0000-4000-8000-000000000002','e4000000-0000-4000-8000-000000000006',jsonb_build_array(jsonb_build_object('type','save_supply','payload',jsonb_build_object('id','e3000000-0000-4000-8000-000000000013','name','Admin cross tenant','category','ingredient','packageQuantity',100,'packageUnit','g','packagePrice',10,'purchasedAt',current_date::text))))$$,
  '42501',null,'admin transition cannot write another tenant'
);
select throws_ok(
  $$insert into public.business_members(business_id,user_id,role) values('e1000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000004','member')$$,
  '42501',null,'admin cannot add users to a foreign tenant'
);
select lives_ok(
  $$insert into public.business_members(business_id,user_id,role) values('e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000004','member')$$,
  'admin can add a user to own tenant'
);
select is((select count(*)::bigint from public.business_members),3::bigint,'admin sees newly added own-tenant member');
select lives_ok(
  $$delete from public.business_members where business_id='e1000000-0000-4000-8000-000000000001' and user_id='e2000000-0000-4000-8000-000000000004'$$,
  'admin can remove another user from own tenant'
);
select is((select count(*)::bigint from public.business_members),2::bigint,'removed user no longer appears in membership');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','e2000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"e2000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',true);
select is((select count(*)::bigint from public.supplies where business_id='e1000000-0000-4000-8000-000000000001'),0::bigint,'second tenant admin cannot read Tenant A data');
select is((select count(*)::bigint from public.supplies where business_id='e1000000-0000-4000-8000-000000000002'),1::bigint,'second tenant admin reads own Tenant B data');
select throws_ok(
  $$select public.apply_nat_transition_v4('e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000007',jsonb_build_array(jsonb_build_object('type','save_supply','payload',jsonb_build_object('id','e3000000-0000-4000-8000-000000000014','name','B to A blocked','category','ingredient','packageQuantity',100,'packageUnit','g','packagePrice',10,'purchasedAt',current_date::text))))$$,
  '42501',null,'second tenant admin cannot write Tenant A through transition'
);

select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

select has_column('public','sales','sale_value_snapshot','sales stores economic sale value');
select has_column('public','sales','payment_status','sales stores payment status');
select has_column('public','customers','credit_status','customer stores critical credit status');
select ok(to_regprocedure('public.apply_nat_transition_v4(uuid,uuid,jsonb)') is not null,'transition v4 exists');
select ok(to_regprocedure('public.mark_sale_paid_v1(uuid,uuid,text,text)') is not null,'settlement RPC exists');
select ok(to_regprocedure('private.refresh_receivable_critical_statuses()') is not null,'critical SLA job exists');
select ok(to_regprocedure('public.get_daily_executive_summary(uuid,date)') is not null,'daily executive summary exists');
select ok(to_regprocedure('public.list_due_business_alert_retries(integer)') is not null,'alert retry claim exists');
select is(private.receivable_due_at('2026-09-13'::date,null),'2026-09-13 12:00:00+00'::timestamptz,'date-only promise starts at 09:00 America/Sao_Paulo');
select ok(not has_function_privilege('anon','public.mark_sale_paid_v1(uuid,uuid,text,text)','EXECUTE'),'anonymous users cannot settle receivables');
select ok(exists(select 1 from cron.job where jobname='nat-receivables-tick'),'receivable notification poll is scheduled');
select ok(exists(select 1 from cron.job where jobname='nat-receivables-status'),'critical status refresh is scheduled');
select ok(exists(select 1 from cron.job where jobname='nat-executive-summary-recovery'),'executive summary recovery is scheduled');

insert into public.businesses(id,name) values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Receivables test');
insert into private.allowed_auth_emails(email,business_id,role) values('receivables@example.invalid','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','admin');
insert into auth.users(id,email,aud,role,created_at,updated_at) values('55555555-5555-4555-8555-555555555555','receivables@example.invalid','authenticated','authenticated',now(),now());
insert into public.business_members(business_id,user_id,role) values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','55555555-5555-4555-8555-555555555555','admin');
insert into public.business_settings(business_id,owner_name) values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Receivables');
insert into public.customers(id,business_id,name,phone,source,marketing_consent,active) values('eeeeeeee-0000-4000-8000-000000000001','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Cliente Crédito','11999999999','WhatsApp',false,true);
insert into public.sales(id,business_id,customer_id,transaction_type,sale_channel,total_received,sale_value_snapshot,payment_status,payment_promised_date,payment_due_at,payment_method,sold_at,contribution_snapshot,variable_fee_snapshot,status)
values('eeeeeeee-0000-4000-8000-000000000010','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeeeeeee-0000-4000-8000-000000000001','sale','whatsapp',0,25,'pending',(current_date-2),now()-interval '49 hours','other','2026-09-12 12:00:00+00',10,0,'completed');

select is((public.get_daily_executive_summary('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','2026-09-12'::date)->>'revenue')::numeric,25::numeric,'executive summary counts economic revenue even while unpaid');
select lives_ok($$select private.refresh_receivable_critical_statuses()$$,'48h SLA refresh executes independently from push');
select is((select credit_status from public.customers where id='eeeeeeee-0000-4000-8000-000000000001'),'critical','48h SLA marks customer as critical');

set local role authenticated;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select set_config('request.jwt.claims','{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated","aal":"aal2"}',true);

select throws_ok(
  $$select public.apply_nat_transition_v4('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeeeeeee-1000-4000-8000-000000000001','[{"type":"save_customer","payload":{"id":"eeeeeeee-0000-4000-8000-000000000002","name":"Sem Telefone","phone":null,"instagram":null,"source":"WhatsApp","marketingConsent":false,"notes":null,"active":true}}]'::jsonb)$$,
  '22023',null,'non-street customer requires a phone'
);
select lives_ok(
  $$select public.apply_nat_transition_v4('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeeeeeee-1000-4000-8000-000000000002','[{"type":"save_customer","payload":{"id":"eeeeeeee-0000-4000-8000-000000000003","name":"Cliente Rua","phone":null,"instagram":null,"source":"Rua","marketingConsent":false,"notes":null,"active":true}}]'::jsonb)$$,
  'street customer may be saved without phone'
);
select lives_ok(
  $$select public.mark_sale_paid_v1('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeeeeeee-0000-4000-8000-000000000010','pix',null)$$,
  'member can settle a pending receivable without an optional version token'
);
select is((select total_received from public.sales where id='eeeeeeee-0000-4000-8000-000000000010'),25::numeric,'settlement moves economic value into received cash');
select is((select credit_status from public.customers where id='eeeeeeee-0000-4000-8000-000000000001'),'normal','settlement clears current critical customer status');

select * from finish();
rollback;

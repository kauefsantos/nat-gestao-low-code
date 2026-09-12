begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select has_table('public','customer_marketing_consents','consent ledger exists');
select has_table('public','privacy_request_log','privacy request evidence exists');
select has_function('public','erase_customer_privacy_v1',array['uuid','uuid','text'],'privacy erasure RPC exists');

insert into public.businesses(id,name) values
('c1000000-0000-4000-8000-000000000001','Privacy A'),
('c1000000-0000-4000-8000-000000000002','Privacy B');
insert into private.allowed_auth_emails(email,business_id,role) values
('privacy-a@example.invalid','c1000000-0000-4000-8000-000000000001','admin');
insert into auth.users(id,email,aud,role,created_at,updated_at) values
('c2000000-0000-4000-8000-000000000001','privacy-a@example.invalid','authenticated','authenticated',now(),now());
insert into public.business_members(business_id,user_id,role) values
('c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','admin');

set local role authenticated;
select set_config('request.jwt.claim.sub','c2000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"c2000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);

select lives_ok($$select public.save_customer('c1000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','Cliente Privado','11999999999','@cliente','Instagram',true,'Observação simples',true)$$,'customer save works');
select is((select status from public.customer_marketing_consents where customer_id='c3000000-0000-4000-8000-000000000001' order by id desc limit 1),'granted','grant is recorded');
select ok((select not coalesce(before_data ?| array['name','phone','instagram','source','notes','marketing_consent'],false) and not coalesce(after_data ?| array['name','phone','instagram','source','notes','marketing_consent'],false) from public.audit_log where entity_table='customers' and entity_id='c3000000-0000-4000-8000-000000000001' order by id desc limit 1),'customer audit contains no PII fields');
select lives_ok($$select public.save_customer('c1000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','Cliente Privado',null,null,null,false,null,true)$$,'consent can be revoked');
select is((select status from public.customer_marketing_consents where customer_id='c3000000-0000-4000-8000-000000000001' order by id desc limit 1),'revoked','revocation is recorded');
select throws_ok($$select public.save_customer('c1000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000002','Documento',null,null,null,false,'CPF 123.456.789-00',true)$$,'22023',null,'CPF is rejected in notes');

reset role;
insert into public.sales(id,business_id,total_received,payment_method,variable_fee_snapshot,contribution_snapshot,customer_id)
values('c4000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',25,'pix',0,10,'c3000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','c2000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"c2000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select lives_ok($$select public.erase_customer_privacy_v1('c1000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','Teste')$$,'erasure succeeds');
select ok((select customer_id is null from public.sales where id='c4000000-0000-4000-8000-000000000001'),'sale is preserved and detached');
select throws_ok($$select public.erase_customer_privacy_v1('c1000000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000001','cross tenant')$$,'42501',null,'cross tenant erasure is blocked');

reset role;
insert into public.customers(id,business_id,name,marketing_consent,created_at,updated_at) values('c3000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000001','Antigo',false,now()-interval '25 months',now()-interval '25 months');
select private.cleanup_privacy_retention_v1();
select ok(not exists(select 1 from public.customers where id='c3000000-0000-4000-8000-000000000003'),'retention removes stale CRM PII');

select * from finish();
rollback;
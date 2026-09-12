-- Governance P2: audit context, correlation and actor classification.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select has_column('public','audit_log','source','audit log records source');
select has_column('public','audit_log','request_id','audit log records correlation request id');
select has_column('public','audit_log','change_reason','audit log records change reason');
select has_column('public','audit_log','actor_type','audit log records actor type');
select has_column('public','audit_log','app_version','audit log can record app version');
select has_trigger('public','access_reviews','access_reviews_audit','access reviews are included in the general audit trail');
select has_trigger('public','recipe_import_batches','recipe_import_batches_audit','CSV lineage records are included in the general audit trail');
select ok(position('app.audit_source' in pg_get_functiondef('public.apply_nat_transition_v2(uuid,uuid,jsonb)'::regprocedure))>0,'transition RPC sets audit source');
select ok(position('app.audit_request_id' in pg_get_functiondef('public.apply_nat_transition_v2(uuid,uuid,jsonb)'::regprocedure))>0,'transition RPC propagates request id');

insert into public.businesses(id,name) values ('b1000000-0000-4000-8000-000000000001','Audit Context');
insert into private.allowed_auth_emails(email,business_id,role) values ('audit-context@example.invalid','b1000000-0000-4000-8000-000000000001','admin');
insert into auth.users(id,email,aud,role,created_at,updated_at) values ('b2000000-0000-4000-8000-000000000001','audit-context@example.invalid','authenticated','authenticated',now(),now());
insert into public.business_members(business_id,user_id,role) values ('b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','admin');
insert into public.supplies(id,business_id,name,category,active) values ('b3000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','System insert','ingredient',true);

select is((select source from public.audit_log where entity_table='supplies' and entity_id='b3000000-0000-4000-8000-000000000001' order by id desc limit 1),'system','change without authenticated actor is classified as system');
select is((select actor_type from public.audit_log where entity_table='supplies' and entity_id='b3000000-0000-4000-8000-000000000001' order by id desc limit 1),'system','system change records system actor type');

select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select set_config('app.audit_source','ui_transition',true);
select set_config('app.audit_request_id','b4000000-0000-4000-8000-000000000001',true);
select set_config('app.audit_reason','Correção auditável',true);
select set_config('app.app_version','test-2026.09.12',true);

update public.supplies set name='User update' where id='b3000000-0000-4000-8000-000000000001';

select is((select source from public.audit_log where entity_table='supplies' and entity_id='b3000000-0000-4000-8000-000000000001' order by id desc limit 1),'ui_transition','explicit source is preserved');
select is((select request_id from public.audit_log where entity_table='supplies' and entity_id='b3000000-0000-4000-8000-000000000001' order by id desc limit 1),'b4000000-0000-4000-8000-000000000001'::uuid,'request id correlates the change');
select is((select change_reason from public.audit_log where entity_table='supplies' and entity_id='b3000000-0000-4000-8000-000000000001' order by id desc limit 1),'Correção auditável','reason is preserved');
select is((select actor_type from public.audit_log where entity_table='supplies' and entity_id='b3000000-0000-4000-8000-000000000001' order by id desc limit 1),'user','authenticated actor is classified as user');
select is((select app_version from public.audit_log where entity_table='supplies' and entity_id='b3000000-0000-4000-8000-000000000001' order by id desc limit 1),'test-2026.09.12','application version context is preserved when supplied');

select * from finish();
rollback;

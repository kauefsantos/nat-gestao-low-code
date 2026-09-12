-- Data governance P1: access review and CSV lineage controls.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select has_table('public','access_reviews','access review history exists');
select has_table('public','recipe_import_batches','recipe import lineage exists');
select has_function('public','stage_recipe_import_v1',array['text','text','text','text','integer'],'CSV lineage staging RPC exists');
select has_function('public','record_access_review_v1',array['uuid','uuid','text','text','date'],'access review RPC exists');
select has_function('public','list_access_review_status_v1',array['uuid'],'access review status RPC exists');
select ok((select relforcerowsecurity from pg_class where oid='public.access_reviews'::regclass),'access reviews force RLS');
select ok((select relforcerowsecurity from pg_class where oid='public.recipe_import_batches'::regclass),'recipe import batches force RLS');
select ok(not has_table_privilege('anon','public.access_reviews','select'),'visitor cannot read access reviews');
select ok(not has_table_privilege('anon','public.recipe_import_batches','select'),'visitor cannot read import lineage');

insert into public.businesses(id,name) values ('a1000000-0000-4000-8000-000000000001','Governance Test');
insert into private.allowed_auth_emails(email,business_id,role) values ('governance@example.invalid','a1000000-0000-4000-8000-000000000001','admin');
insert into auth.users(id,email,aud,role,created_at,updated_at) values ('a2000000-0000-4000-8000-000000000001','governance@example.invalid','authenticated','authenticated',now(),now());
insert into public.business_members(business_id,user_id,role) values ('a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','admin');
insert into public.products(id,business_id,name,batch_yield,selling_price,loss_percent,production_cost_per_batch,minimum_margin_percent,target_margin_percent,active)
values ('a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Produto antes',10,5,0,0,20,30,true);

insert into private.pending_recipe_imports(business_id,user_id,source_type,file_name,file_sha256,parser_version,row_count)
values ('a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','file_csv','receita.csv',repeat('a',64),'recipe-csv-v1',3);
select set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000001',true);
update public.products set name='Produto depois' where id='a3000000-0000-4000-8000-000000000001';

select is((select count(*)::bigint from public.recipe_import_batches where product_id='a3000000-0000-4000-8000-000000000001'),1::bigint,'saved product consumes staged CSV lineage');
select is((select count(*)::bigint from private.pending_recipe_imports where user_id='a2000000-0000-4000-8000-000000000001'),0::bigint,'staged lineage is consumed after product save');

select * from finish();
rollback;

-- Product temporary availability regression tests.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select has_column('public','products','available','products support temporary availability');
select ok(
  has_function_privilege('authenticated','public.set_product_availability(uuid,uuid,text,boolean)','execute'),
  'authenticated users can call the protected availability RPC'
);

insert into public.businesses(id,name) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','Availability test');
insert into private.allowed_auth_emails(email,business_id,role) values ('availability@example.invalid','dddddddd-dddd-4ddd-8ddd-dddddddddddd','admin');
insert into auth.users(id,email,aud,role,created_at,updated_at) values ('44444444-4444-4444-8444-444444444444','availability@example.invalid','authenticated','authenticated',now(),now());
insert into public.business_members(business_id,user_id,role) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','44444444-4444-4444-8444-444444444444','admin');
insert into public.business_settings(business_id,owner_name) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','Availability test');
insert into public.products(id,business_id,name,batch_yield,selling_price,loss_percent,production_cost_per_batch,minimum_margin_percent,target_margin_percent,active,available)
values ('dddddddd-0000-4000-8000-000000000001','dddddddd-dddd-4ddd-8ddd-dddddddddddd','Brownie teste',10,10,0,0,35,50,true,true);
insert into public.sales(id,business_id,sold_at,total_received,payment_method,variable_fee_snapshot,contribution_snapshot,status)
values ('dddddddd-0000-4000-8000-000000000002','dddddddd-dddd-4ddd-8ddd-dddddddddddd',now(),10,'pix',0,10,'completed');

set local role authenticated;
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated","aal":"aal2"}',true);

select lives_ok(
  $$select public.set_product_availability('dddddddd-dddd-4ddd-8ddd-dddddddddddd','dddddddd-0000-4000-8000-000000000001',(select updated_at::text from public.products where id='dddddddd-0000-4000-8000-000000000001'),false)$$,
  'product can be paused without archiving'
);
select is(
  (select available from public.products where id='dddddddd-0000-4000-8000-000000000001'),
  false,
  'paused product remains present and is marked unavailable'
);

reset role;
select throws_ok(
  $$insert into public.sale_items(business_id,sale_id,product_id,product_name_snapshot,quantity,unit_cost_snapshot,unit_price_snapshot)
    values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','dddddddd-0000-4000-8000-000000000002','dddddddd-0000-4000-8000-000000000001','Brownie teste',1,1,10)$$,
  '22023',
  'Produto temporariamente indisponível para venda.',
  'database rejects a new sale line for a paused product'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated","aal":"aal2"}',true);
select lives_ok(
  $$select public.set_product_availability('dddddddd-dddd-4ddd-8ddd-dddddddddddd','dddddddd-0000-4000-8000-000000000001',(select updated_at::text from public.products where id='dddddddd-0000-4000-8000-000000000001'),true)$$,
  'paused product can be resumed'
);
select is(
  (select available from public.products where id='dddddddd-0000-4000-8000-000000000001'),
  true,
  'resumed product becomes available again'
);

select * from finish();
rollback;

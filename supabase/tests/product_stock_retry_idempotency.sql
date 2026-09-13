-- Stage 3 regression: transport retries may regenerate producedAt without duplicating production.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into public.businesses(id,name)
values ('c1000000-0000-4000-8000-000000000001','Product stock retry');
insert into private.allowed_auth_emails(email,business_id,role)
values ('stock-retry@example.invalid','c1000000-0000-4000-8000-000000000001','admin');
insert into auth.users(id,email,aud,role,created_at,updated_at)
values ('c2000000-0000-4000-8000-000000000001','stock-retry@example.invalid','authenticated','authenticated',now(),now());
insert into public.business_members(business_id,user_id,role)
values ('c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','admin');
insert into public.business_settings(business_id,owner_name)
values ('c1000000-0000-4000-8000-000000000001','Product stock retry');

insert into public.supplies(id,business_id,name,category,active)
values ('c3000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','Ingrediente retry','ingredient',true);
insert into public.inventory_tracking(business_id,supply_id,base_unit,minimum_quantity)
values ('c1000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','g',0);
insert into public.supply_purchases(id,business_id,supply_id,package_quantity,package_unit,package_price,purchased_at,funding_source)
values ('c4000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001',200,'g',10,'2026-09-13','business');

insert into public.products(id,business_id,name,batch_yield,selling_price,loss_percent,labor_cost_per_batch,production_cost_per_batch,minimum_margin_percent,target_margin_percent,active,available)
values ('c5000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','Produto retry',10,5,0,0,0,10,20,true,true);
insert into public.recipe_items(id,business_id,product_id,supply_id,quantity,unit)
values ('c6000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001',100,'g');

-- Test-only access is rolled back at the end of this transaction.
grant usage on schema private to authenticated;
grant execute on function private.inventory_balance(uuid,text,uuid) to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','c2000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"c2000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);

select is(
  public.set_product_stock_v2(
    'c1000000-0000-4000-8000-000000000001','c7000000-0000-4000-8000-000000000001',
    'c5000000-0000-4000-8000-000000000001',10,0,'2026-09-13 15:00:00+00',null
  )->>'action',
  'opening',
  'initial finished-product count is an opening'
);

select is(
  public.set_product_stock_v2(
    'c1000000-0000-4000-8000-000000000001','c7000000-0000-4000-8000-000000000002',
    'c5000000-0000-4000-8000-000000000001',20,0,'2026-09-13 15:01:00+00',null
  )->>'action',
  'production',
  'raising the target consumes the recipe through production'
);

select lives_ok(
  $$select public.set_product_stock_v2(
    'c1000000-0000-4000-8000-000000000001','c7000000-0000-4000-8000-000000000002',
    'c5000000-0000-4000-8000-000000000001',20,0,'2026-09-13 15:01:09+00',null
  )$$,
  'same target request survives a regenerated server timestamp'
);

select is(
  private.inventory_balance(
    'c1000000-0000-4000-8000-000000000001','supply','c3000000-0000-4000-8000-000000000001'
  ),
  100::numeric,
  'retry with a different producedAt does not consume ingredients twice'
);

select * from finish();
rollback;

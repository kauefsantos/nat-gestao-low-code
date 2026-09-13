-- Backend P1 regression tests.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select ok(to_regclass('public.sale_items_one_item_per_sale_idx') is null,'one-item-per-sale restriction is removed');
select has_column('public','sales','status','sales keep lifecycle status');
select has_column('public','sales','cancelled_at','sales keep cancellation timestamp');
select ok(
  (select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='save_sale_items'),
  'multi-item sale implementation remains SECURITY DEFINER'
);
select ok(
  (select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='cancel_sale'),
  'cancel implementation remains SECURITY DEFINER'
);
select ok(not has_function_privilege('authenticated','private.dispatch_nat_push_slot(smallint)','execute'),'authenticated cannot invoke push scheduler helper');

insert into public.businesses(id,name) values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Backend P1');
insert into private.allowed_auth_emails(email,business_id,role) values ('backend-p1@example.invalid','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','admin');
insert into auth.users(id,email,aud,role,created_at,updated_at) values ('55555555-5555-4555-8555-555555555555','backend-p1@example.invalid','authenticated','authenticated',now(),now());
insert into public.business_members(business_id,user_id,role) values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','55555555-5555-4555-8555-555555555555','admin');
insert into public.business_settings(business_id,owner_name,payment_fee_percent) values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Backend P1',5);
insert into public.supplies(id,business_id,name,category) values ('eeeeeeee-0000-4000-8000-000000000001','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Chocolate','ingredient');
insert into public.supply_purchases(business_id,supply_id,package_quantity,package_unit,package_price,purchased_at) values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeeeeeee-0000-4000-8000-000000000001',1000,'g',30,'2026-09-01');
insert into public.products(id,business_id,name,batch_yield,selling_price,production_cost_per_batch,loss_percent,portfolio_key) values
  ('eeeeeeee-0000-4000-8000-000000000002','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Brownie A',10,5,1,0,'brownie-tradicional'),
  ('eeeeeeee-0000-4000-8000-000000000003','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Brownie B',10,8,0,0,'brownie-ninho');
insert into public.recipe_items(business_id,product_id,supply_id,quantity,unit) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeeeeeee-0000-4000-8000-000000000002','eeeeeeee-0000-4000-8000-000000000001',100,'g'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeeeeeee-0000-4000-8000-000000000003','eeeeeeee-0000-4000-8000-000000000001',200,'g');

set local role authenticated;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select set_config('request.jwt.claims','{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated","aal":"aal2"}',true);

select lives_ok(
  $$select public.apply_nat_transition_v4(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    'eeeeeeee-1000-4000-8000-000000000001',
    '[{"type":"create_sale","payload":{"id":"eeeeeeee-0000-4000-8000-000000000010","items":[{"productId":"eeeeeeee-0000-4000-8000-000000000002","quantity":2},{"productId":"eeeeeeee-0000-4000-8000-000000000003","quantity":3}],"totalReceived":30,"saleValue":30,"paymentStatus":"paid","paymentMethod":"pix","soldAt":"2026-09-10T15:00:00-03:00","transactionType":"sale","saleChannel":"other","deliveryCost":0,"discountReason":"Desconto de teste multi-item","belowCostOverride":false,"marginOverride":false}}]'::jsonb
  )$$,
  'one sale can contain multiple products through current transition'
);
select is((select count(*)::bigint from public.sale_items where sale_id='eeeeeeee-0000-4000-8000-000000000010'),2::bigint,'multi-product order stores two sale lines');
select is((select round(contribution_snapshot,2) from public.sales where id='eeeeeeee-0000-4000-8000-000000000010'),27.40::numeric,'order contribution is calculated from current authoritative pricing, discount and payment rules');
select lives_ok(
  $$select public.apply_nat_transition_v4(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    'eeeeeeee-1000-4000-8000-000000000002',
    jsonb_build_array(jsonb_build_object(
      'type','cancel_sale',
      'expectedUpdatedAt',(select updated_at::text from public.sales where id='eeeeeeee-0000-4000-8000-000000000010'),
      'payload',jsonb_build_object('id','eeeeeeee-0000-4000-8000-000000000010','reason','Cliente desistiu')
    ))
  )$$,
  'sale can be cancelled without deletion through current transition'
);
select is((select status from public.sales where id='eeeeeeee-0000-4000-8000-000000000010'),'cancelled'::text,'cancelled sale remains in history');
select is((select count(*)::bigint from public.sale_items where sale_id='eeeeeeee-0000-4000-8000-000000000010'),2::bigint,'cancellation preserves sale item history');

select * from finish();
rollback;

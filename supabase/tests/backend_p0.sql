-- Backend P0 regression tests.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select ok(
  (select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='archive_product' and pg_get_function_identity_arguments(p.oid)='p_business_id uuid, p_id uuid'),
  'archive_product remains SECURITY DEFINER'
);
select ok(
  (select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='delete_supply' and pg_get_function_identity_arguments(p.oid)='p_business_id uuid, p_id uuid'),
  'delete_supply remains SECURITY DEFINER'
);
select ok(
  (select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='save_sale_items' and pg_get_function_identity_arguments(p.oid)='p_business_id uuid, p_id uuid, p_items jsonb, p_total_received numeric, p_payment_method text, p_sold_at timestamp with time zone'),
  'save_sale_items remains SECURITY DEFINER'
);

insert into public.businesses(id,name)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','Backend P0');
insert into private.allowed_auth_emails(email,business_id,role)
values ('backend-p0@example.invalid','dddddddd-dddd-4ddd-8ddd-dddddddddddd','admin');
insert into auth.users(id,email,aud,role,created_at,updated_at)
values ('44444444-4444-4444-8444-444444444444','backend-p0@example.invalid','authenticated','authenticated',now(),now());
insert into public.business_members(business_id,user_id,role)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','44444444-4444-4444-8444-444444444444','admin');
insert into public.business_settings(business_id,owner_name,payment_fee_percent)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','Backend',5);
insert into public.supplies(id,business_id,name,category)
values ('dddddddd-0000-4000-8000-000000000001','dddddddd-dddd-4ddd-8ddd-dddddddddddd','Chocolate','ingredient');
insert into public.supply_purchases(business_id,supply_id,package_quantity,package_unit,package_price,purchased_at,created_at)
values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','dddddddd-0000-4000-8000-000000000001',1000,'g',30,'2026-09-09','2026-09-09 12:00:00+00'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','dddddddd-0000-4000-8000-000000000001',1000,'g',300,'2026-09-11','2026-09-11 12:00:00+00');
insert into public.products(id,business_id,name,batch_yield,selling_price,production_cost_per_batch,loss_percent)
values ('dddddddd-0000-4000-8000-000000000002','dddddddd-dddd-4ddd-8ddd-dddddddddddd','Brownie',10,5,1,0);
insert into public.recipe_items(business_id,product_id,supply_id,quantity,unit)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','dddddddd-0000-4000-8000-000000000002','dddddddd-0000-4000-8000-000000000001',100,'g');

set local role authenticated;
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated","aal":"aal2"}',true);

select lives_ok(
  $$select public.save_sale_items('dddddddd-dddd-4ddd-8ddd-dddddddddddd','dddddddd-0000-4000-8000-000000000010','[{"productId":"dddddddd-0000-4000-8000-000000000002","quantity":2}]'::jsonb,10,'pix','2026-09-10 15:00:00-03'::timestamptz)$$,
  'backdated sale can be created using costs valid on its sale date'
);
select is(
  (select round(si.unit_cost_snapshot,2) from public.sale_items si where si.sale_id='dddddddd-0000-4000-8000-000000000010'),
  0.40::numeric,
  'future purchase does not alter historical sale unit cost'
);
select throws_ok(
  $$select public.save_sale_items('dddddddd-dddd-4ddd-8ddd-dddddddddddd','dddddddd-0000-4000-8000-000000000011','[{"productId":"dddddddd-0000-4000-8000-000000000002","quantity":1}]'::jsonb,5,'pix','2026-09-08 15:00:00-03'::timestamptz)$$,
  '22023', null,
  'sale before the first known purchase is rejected instead of using a future cost'
);

select * from finish();
rollback;
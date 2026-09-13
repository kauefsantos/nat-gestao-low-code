-- Analysis UX: purchase groups preserve equivalent-brand history and stock.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into public.businesses(id,name)
values ('61000000-0000-4000-8000-000000000001','Analysis UX');
insert into auth.users(id,email,aud,role,created_at,updated_at)
values ('62000000-0000-4000-8000-000000000001','analysis-ux@example.invalid','authenticated','authenticated',now(),now());
insert into public.business_members(business_id,user_id,role)
values ('61000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001','admin');
insert into public.supplies(id,business_id,name,category,active) values
 ('63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','Chocolate Marca Antiga','ingredient',false),
 ('63000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000001','Chocolate Marca Atual','ingredient',true);
insert into private.supply_equivalence_members(business_id,group_id,supply_id,is_current,activated_at) values
 ('61000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',false,'2026-08-01'),
 ('61000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000002',true,'2026-09-01');
insert into public.supply_purchases(id,business_id,supply_id,package_quantity,package_unit,package_price,purchased_at,funding_source) values
 ('65000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',100,'g',10,'2026-08-01','owner'),
 ('65000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000002',100,'g',12,'2026-09-01','owner');
insert into public.inventory_tracking(business_id,supply_id,base_unit,minimum_quantity) values
 ('61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','g',0),
 ('61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000002','g',0);
insert into public.inventory_movements(business_id,supply_id,quantity_delta,base_unit,movement_type,note,occurred_at) values
 ('61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',30,'g','opening','Saldo antigo','2026-08-01'),
 ('61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000002',70,'g','opening','Saldo atual','2026-09-01');

set local role authenticated;
select set_config('request.jwt.claim.sub','62000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"62000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);

select has_function('public','get_analysis_supply_groups_v1',array['uuid'],'analysis purchase-group RPC exists');
select is(jsonb_array_length(public.get_analysis_supply_groups_v1('61000000-0000-4000-8000-000000000001')),1,'equivalent brands collapse into one main supply');
select is((public.get_analysis_supply_groups_v1('61000000-0000-4000-8000-000000000001')->0->>'name')::text,'Chocolate Marca Atual','current equivalent brand names the main supply');
select is(jsonb_array_length(public.get_analysis_supply_groups_v1('61000000-0000-4000-8000-000000000001')->0->'brands'),2,'expanded group exposes both purchased brands');
select is((public.get_analysis_supply_groups_v1('61000000-0000-4000-8000-000000000001')->0->>'purchases')::int,2,'group counts purchases across brands');
select is((public.get_analysis_supply_groups_v1('61000000-0000-4000-8000-000000000001')->0->>'stockQuantity')::numeric,100::numeric,'group stock reconciles all equivalent supply balances');
select is(round((public.get_analysis_supply_groups_v1('61000000-0000-4000-8000-000000000001')->0->>'variation')::numeric,2),20.00::numeric,'price variation compares latest equivalent purchases');

select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select has_table('private','brigadeiro_mass_definitions','mass definition exists');
select has_table('private','brigadeiro_mass_cost_layers','mass FIFO cost layers exist');
select ok(has_function_privilege('authenticated','public.record_brigadeiro_mass_production_v1(uuid,uuid,text,integer,timestamptz,text)','execute'),'mass production is authenticated RPC');
select ok(has_function_privilege('authenticated','public.record_brigadeiro_production_v1(uuid,uuid,uuid,integer,timestamptz,text)','execute'),'finished brigadeiro production is authenticated RPC');

insert into public.businesses(id,name) values('b1000000-0000-4000-8000-000000000001','Brigadeiro flow test');
insert into private.allowed_auth_emails(email,business_id,role) values('brigadeiro-flow@example.invalid','b1000000-0000-4000-8000-000000000001','admin');
insert into auth.users(id,email,aud,role,created_at,updated_at) values('b1000000-0000-4000-8000-000000000002','brigadeiro-flow@example.invalid','authenticated','authenticated',now(),now());
insert into public.business_members(business_id,user_id,role) values('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002','admin');
insert into public.business_settings(business_id,owner_name,pix_fee_percent) values('b1000000-0000-4000-8000-000000000001','Teste',0);

insert into public.supplies(id,business_id,name,category,active) values
('b1100000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','Leite condensado','ingredient',true),
('b1100000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000001','Creme','ingredient',true),
('b1100000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000001','Chocolate','ingredient',true),
('b1100000-0000-4000-8000-000000000004','b1000000-0000-4000-8000-000000000001','Granulado','ingredient',true),
('b1100000-0000-4000-8000-000000000005','b1000000-0000-4000-8000-000000000001','Massa Tradicional','other',true),
('b1100000-0000-4000-8000-000000000006','b1000000-0000-4000-8000-000000000001','Caixa unitária','packaging',true),
('b1100000-0000-4000-8000-000000000007','b1000000-0000-4000-8000-000000000001','Forminha','packaging',true),
('b1100000-0000-4000-8000-000000000008','b1000000-0000-4000-8000-000000000001','Sacola','packaging',true),
('b1100000-0000-4000-8000-000000000009','b1000000-0000-4000-8000-000000000001','Caixa quarteto','packaging',true),
('b1100000-0000-4000-8000-000000000010','b1000000-0000-4000-8000-000000000001','Suporte','packaging',true),
('b1100000-0000-4000-8000-000000000011','b1000000-0000-4000-8000-000000000001','Validade','packaging',true),
('b1100000-0000-4000-8000-000000000012','b1000000-0000-4000-8000-000000000001','Contato','packaging',true);

insert into public.supply_purchases(business_id,supply_id,package_quantity,package_unit,package_price,purchased_at)
select 'b1000000-0000-4000-8000-000000000001',id,case when category='packaging' then 100 else 1000 end,case when category='packaging' then 'unit' else 'g' end,10,current_date
from public.supplies where business_id='b1000000-0000-4000-8000-000000000001' and id<>'b1100000-0000-4000-8000-000000000005';

insert into private.brigadeiro_mass_definitions(business_id,mass_key,name,mass_supply_id,flavor_supply_id,cream_supply_id,available)
values('b1000000-0000-4000-8000-000000000001','traditional','Tradicional','b1100000-0000-4000-8000-000000000005','b1100000-0000-4000-8000-000000000003','b1100000-0000-4000-8000-000000000002',true);
insert into private.brigadeiro_condensed_milk_options(business_id,supply_id,priority) values('b1000000-0000-4000-8000-000000000001','b1100000-0000-4000-8000-000000000001',1);
insert into private.brigadeiro_packaging_profile(business_id,packaging_format,supply_id,quantity_per_package,package_capacity) values
('b1000000-0000-4000-8000-000000000001','unit','b1100000-0000-4000-8000-000000000006',1,1),
('b1000000-0000-4000-8000-000000000001','unit','b1100000-0000-4000-8000-000000000007',1,1),
('b1000000-0000-4000-8000-000000000001','unit','b1100000-0000-4000-8000-000000000008',1,1),
('b1000000-0000-4000-8000-000000000001','quartet','b1100000-0000-4000-8000-000000000009',1,4),
('b1000000-0000-4000-8000-000000000001','quartet','b1100000-0000-4000-8000-000000000007',4,4),
('b1000000-0000-4000-8000-000000000001','quartet','b1100000-0000-4000-8000-000000000010',4,4),
('b1000000-0000-4000-8000-000000000001','quartet','b1100000-0000-4000-8000-000000000011',1,4),
('b1000000-0000-4000-8000-000000000001','quartet','b1100000-0000-4000-8000-000000000012',1,4);

insert into public.products(id,business_id,name,portfolio_key,batch_yield,selling_price,loss_percent,labor_cost_per_batch,production_cost_per_batch,minimum_margin_percent,target_margin_percent,active,available)
values('b1200000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','Brigadeiro Tradicional','brigadeiro-tradicional',1,20,0,1.5,0,10,15,true,true);
insert into public.recipe_items(business_id,product_id,supply_id,quantity,unit) values
('b1000000-0000-4000-8000-000000000001','b1200000-0000-4000-8000-000000000001','b1100000-0000-4000-8000-000000000005',20,'g'),
('b1000000-0000-4000-8000-000000000001','b1200000-0000-4000-8000-000000000001','b1100000-0000-4000-8000-000000000004',6,'g');
insert into public.inventory_tracking(business_id,supply_id,base_unit,minimum_quantity)
select 'b1000000-0000-4000-8000-000000000001',id,case when category='packaging' then 'unit' else 'g' end,0 from public.supplies where business_id='b1000000-0000-4000-8000-000000000001';
insert into public.inventory_tracking(business_id,product_id,base_unit,minimum_quantity) values('b1000000-0000-4000-8000-000000000001','b1200000-0000-4000-8000-000000000001','unit',0);

set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);

select lives_ok($$select public.set_inventory_balance('b1000000-0000-4000-8000-000000000001','supply',id,1000,0,'opening') from public.supplies where business_id='b1000000-0000-4000-8000-000000000001' and id<>'b1100000-0000-4000-8000-000000000005'$$,'raw and packaging stock can be opened');
select lives_ok($$select public.record_brigadeiro_mass_production_v1('b1000000-0000-4000-8000-000000000001','b1300000-0000-4000-8000-000000000001','traditional',1,now(),'massa')$$,'mother mass production succeeds');
select is(private.inventory_supply_balance('b1000000-0000-4000-8000-000000000001','b1100000-0000-4000-8000-000000000003'),954::numeric,'mass production consumes exactly 46g chocolate');
select is(private.inventory_supply_balance('b1000000-0000-4000-8000-000000000001','b1100000-0000-4000-8000-000000000005'),800::numeric,'mass production adds 800g intermediate mass');
select lives_ok($$select public.record_brigadeiro_production_v1('b1000000-0000-4000-8000-000000000001','b1300000-0000-4000-8000-000000000002','b1200000-0000-4000-8000-000000000001',4,now(),'4 doces')$$,'finished brigadeiro production succeeds');
select is(private.inventory_supply_balance('b1000000-0000-4000-8000-000000000001','b1100000-0000-4000-8000-000000000005'),720::numeric,'finished production consumes mass inventory');
select is(private.inventory_supply_balance('b1000000-0000-4000-8000-000000000001','b1100000-0000-4000-8000-000000000003'),954::numeric,'finished production does not consume mother chocolate again');
select is((select sum(quantity_delta)::numeric from public.inventory_movements where business_id='b1000000-0000-4000-8000-000000000001' and product_id='b1200000-0000-4000-8000-000000000001'),4::numeric,'four finished units enter inventory');

select lives_ok($$select public.apply_nat_transition_v5('b1000000-0000-4000-8000-000000000001','b1400000-0000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object('type','create_sale','payload',jsonb_build_object('id','b1500000-0000-4000-8000-000000000001','items','[{"productId":"b1200000-0000-4000-8000-000000000001","quantity":4}]'::jsonb,'totalReceived',80,'saleValue',80,'paymentStatus','paid','paymentMethod','pix','soldAt',now()::text,'transactionType','sale','saleChannel','other','deliveryCost',0,'packagingFormat','quartet','discountReason','Teste','belowCostOverride',true,'marginOverride',true))))$$,'quartet sale succeeds atomically');
select is(private.inventory_supply_balance('b1000000-0000-4000-8000-000000000001','b1100000-0000-4000-8000-000000000009'),999::numeric,'quartet sale consumes one quartet box');
select is(private.inventory_supply_balance('b1000000-0000-4000-8000-000000000001','b1100000-0000-4000-8000-000000000007'),996::numeric,'quartet sale consumes four cups');
select lives_ok($$select public.apply_nat_transition_v5('b1000000-0000-4000-8000-000000000001','b1400000-0000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object('type','create_sale','payload',jsonb_build_object('id','b1500000-0000-4000-8000-000000000001','items','[{"productId":"b1200000-0000-4000-8000-000000000001","quantity":4}]'::jsonb,'totalReceived',80,'saleValue',80,'paymentStatus','paid','paymentMethod','pix','soldAt',now()::text,'transactionType','sale','saleChannel','other','deliveryCost',0,'packagingFormat','quartet','discountReason','Teste','belowCostOverride',true,'marginOverride',true))))$$,'retry with same request is idempotent');
select is(private.inventory_supply_balance('b1000000-0000-4000-8000-000000000001','b1100000-0000-4000-8000-000000000009'),999::numeric,'retry does not consume packaging twice');

select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

select has_column('public','sales','sale_channel','sales store channel');
select has_column('public','sales','delivery_cost_snapshot','sales store delivery cost');
select has_column('public','sales','discount_reason','sales store discount reason');
select has_column('public','sales','below_cost_override','sales store below-cost override');
select ok(not has_function_privilege('authenticated','public.save_sale_items_v4(uuid,uuid,jsonb,numeric,text,timestamptz,uuid,text,text,numeric,text,boolean)','execute'),'direct v4 sale implementation is not client-executable');
select is(has_table_privilege('authenticated','public.sales','UPDATE'),false,'authenticated cannot directly rewrite sales snapshots');

insert into public.businesses(id,name) values ('b1111111-1111-4111-8111-111111111111','P2 test');
insert into private.allowed_auth_emails(email,business_id,role) values ('p2@example.invalid','b1111111-1111-4111-8111-111111111111','admin');
insert into auth.users(id,email,aud,role,created_at,updated_at) values ('b2222222-2222-4222-8222-222222222222','p2@example.invalid','authenticated','authenticated',now(),now());
insert into public.business_members(business_id,user_id,role) values ('b1111111-1111-4111-8111-111111111111','b2222222-2222-4222-8222-222222222222','admin');
insert into public.business_settings(business_id,owner_name,pix_fee_percent,cash_fee_percent,card_fee_percent,payment_fee_percent,default_minimum_margin_percent,default_target_margin_percent)
values ('b1111111-1111-4111-8111-111111111111','P2',0,0,0,0,10,15);
insert into public.supplies(id,business_id,name,category,active) values
 ('b3333333-3333-4333-8333-333333333331','b1111111-1111-4111-8111-111111111111','Ingrediente fictício','ingredient',true),
 ('b3333333-3333-4333-8333-333333333332','b1111111-1111-4111-8111-111111111111','Embalagem fictícia','packaging',true);
insert into public.supply_purchases(id,business_id,supply_id,package_quantity,package_unit,package_price,purchased_at) values
 ('b4444444-4444-4444-8444-444444444441','b1111111-1111-4111-8111-111111111111','b3333333-3333-4333-8333-333333333331',100,'g',10,current_date),
 ('b4444444-4444-4444-8444-444444444442','b1111111-1111-4111-8111-111111111111','b3333333-3333-4333-8333-333333333332',10,'unit',5,current_date);
insert into public.products(id,business_id,name,batch_yield,selling_price,loss_percent,labor_cost_per_batch,production_cost_per_batch,minimum_margin_percent,target_margin_percent,active,available)
values ('b5555555-5555-4555-8555-555555555555','b1111111-1111-4111-8111-111111111111','Produto fictício',10,6,0,10,0,10,15,true,true);
insert into public.recipe_items(id,business_id,product_id,supply_id,quantity,unit) values
 ('b6666666-6666-4666-8666-666666666661','b1111111-1111-4111-8111-111111111111','b5555555-5555-4555-8555-555555555555','b3333333-3333-4333-8333-333333333331',100,'g'),
 ('b6666666-6666-4666-8666-666666666662','b1111111-1111-4111-8111-111111111111','b5555555-5555-4555-8555-555555555555','b3333333-3333-4333-8333-333333333332',10,'unit');

set local role authenticated;
select set_config('request.jwt.claim.sub','b2222222-2222-4222-8222-222222222222',true);
select set_config('request.jwt.claims','{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}',true);

select lives_ok($$select public.apply_nat_transition_v4('b1111111-1111-4111-8111-111111111111','b7777777-1000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object('type','create_sale','payload',jsonb_build_object('id','b7777777-7777-4777-8777-777777777771','items','[{"productId":"b5555555-5555-4555-8555-555555555555","quantity":2}]'::jsonb,'totalReceived',12,'saleValue',12,'paymentStatus','paid','paymentMethod','pix','soldAt',now()::text,'transactionType','sale','saleChannel','street','deliveryCost',2,'belowCostOverride',false,'marginOverride',false))))$$,'P2 sale with delivery succeeds');
select is((select delivery_cost_snapshot from public.sales where id='b7777777-7777-4777-8777-777777777771'),2::numeric,'delivery is frozen');
select is((select sale_channel from public.sales where id='b7777777-7777-4777-8777-777777777771'),'street','channel is frozen');
select is((select contribution_snapshot from public.sales where id='b7777777-7777-4777-8777-777777777771'),5::numeric,'delivery reduces contribution: 12 - 5 product cost - 2 delivery');

select throws_ok($$select public.apply_nat_transition_v4('b1111111-1111-4111-8111-111111111111','b7777777-1000-4000-8000-000000000002',jsonb_build_array(jsonb_build_object('type','create_sale','payload',jsonb_build_object('id','b7777777-7777-4777-8777-777777777772','items','[{"productId":"b5555555-5555-4555-8555-555555555555","quantity":2}]'::jsonb,'totalReceived',1,'saleValue',1,'paymentStatus','paid','paymentMethod','pix','soldAt',now()::text,'transactionType','sale','saleChannel','street','deliveryCost',0,'discountReason','Promo fictícia','belowCostOverride',false,'marginOverride',false))))$$,'22023','Venda abaixo do custo exige confirmação explícita.','below-cost sale is rejected without override');
select is((select count(*)::integer from public.sales where id='b7777777-7777-4777-8777-777777777772'),0,'rejected sale rolls back');
select lives_ok($$select public.apply_nat_transition_v4('b1111111-1111-4111-8111-111111111111','b7777777-1000-4000-8000-000000000003',jsonb_build_array(jsonb_build_object('type','create_sale','payload',jsonb_build_object('id','b7777777-7777-4777-8777-777777777773','items','[{"productId":"b5555555-5555-4555-8555-555555555555","quantity":2}]'::jsonb,'totalReceived',1,'saleValue',1,'paymentStatus','paid','paymentMethod','pix','soldAt',now()::text,'transactionType','sale','saleChannel','street','deliveryCost',0,'discountReason','Promo fictícia','belowCostOverride',true,'marginOverride',true))))$$,'below-cost sale can be consciously overridden');
select is((select below_cost_override from public.sales where id='b7777777-7777-4777-8777-777777777773'),true,'override is frozen');
select is((select discount_reason from public.sales where id='b7777777-7777-4777-8777-777777777773'),'Promo fictícia','reason is frozen');
select throws_ok($$select public.apply_nat_transition_v4('b1111111-1111-4111-8111-111111111111','b7777777-1000-4000-8000-000000000004',jsonb_build_array(jsonb_build_object('type','create_sale','payload',jsonb_build_object('id','b7777777-7777-4777-8777-777777777774','items','[{"productId":"b5555555-5555-4555-8555-555555555555","quantity":1.5}]'::jsonb,'totalReceived',9,'saleValue',9,'paymentStatus','paid','paymentMethod','pix','soldAt',now()::text,'transactionType','sale','saleChannel','other','deliveryCost',0,'belowCostOverride',false,'marginOverride',false))))$$,'22023','A quantidade de produtos acabados precisa ser inteira e maior que zero.','fractional finished-product quantity is rejected');
select throws_ok($$select public.apply_nat_transition_v4('b1111111-1111-4111-8111-111111111111','b7777777-1000-4000-8000-000000000005',jsonb_build_array(jsonb_build_object('type','create_sale','payload',jsonb_build_object('id','b7777777-7777-4777-8777-777777777775','items','[{"productId":"b5555555-5555-4555-8555-555555555555","quantity":1}]'::jsonb,'totalReceived',0,'saleValue',0,'paymentStatus','paid','paymentMethod','other','soldAt',now()::text,'transactionType','courtesy','saleChannel','other','deliveryCost',1,'belowCostOverride',false,'marginOverride',false))))$$,'22023','Movimentações sem venda não podem ter custo de entrega.','courtesy cannot carry delivery cost');

select * from finish();
rollback;

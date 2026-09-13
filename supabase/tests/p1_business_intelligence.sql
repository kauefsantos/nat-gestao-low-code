begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

select has_table('public','owner_cash_movements','owner cash movements table exists');
select has_table('public','inventory_product_cost_layers','frozen production cost layers exist');
select has_column('public','business_settings','pix_fee_percent','Pix fee has its own setting');
select has_column('public','business_settings','card_fee_percent','card fee has its own setting');
select is(has_table_privilege('authenticated','public.owner_cash_movements','INSERT'),false,'authenticated cannot insert owner cash directly');
select ok(not has_function_privilege('authenticated','public.save_owner_cash_movement(uuid,uuid,text,numeric,date,text)','execute'),'owner cash implementation is internal to authoritative transition');

insert into public.businesses(id,name) values ('a1111111-1111-4111-8111-111111111111','P1 test');
insert into private.allowed_auth_emails(email,business_id,role) values ('p1@example.invalid','a1111111-1111-4111-8111-111111111111','admin');
insert into auth.users(id,email,aud,role,created_at,updated_at) values ('a2222222-2222-4222-8222-222222222222','p1@example.invalid','authenticated','authenticated',now(),now());
insert into public.business_members(business_id,user_id,role) values ('a1111111-1111-4111-8111-111111111111','a2222222-2222-4222-8222-222222222222','admin');
insert into public.business_settings(business_id,owner_name,pix_fee_percent,cash_fee_percent,card_fee_percent,payment_fee_percent,default_minimum_margin_percent,default_target_margin_percent)
values ('a1111111-1111-4111-8111-111111111111','P1 test',0,0,3,3,10,15);

insert into public.supplies(id,business_id,name,category,active) values
 ('a3333333-3333-4333-8333-333333333331','a1111111-1111-4111-8111-111111111111','Ingrediente P1','ingredient',true),
 ('a3333333-3333-4333-8333-333333333332','a1111111-1111-4111-8111-111111111111','Embalagem P1','packaging',true);
insert into public.supply_purchases(id,business_id,supply_id,package_quantity,package_unit,package_price,purchased_at) values
 ('a4444444-4444-4444-8444-444444444441','a1111111-1111-4111-8111-111111111111','a3333333-3333-4333-8333-333333333331',100,'g',10,current_date),
 ('a4444444-4444-4444-8444-444444444442','a1111111-1111-4111-8111-111111111111','a3333333-3333-4333-8333-333333333332',100,'unit',50,current_date);
insert into public.products(id,business_id,name,batch_yield,selling_price,loss_percent,labor_cost_per_batch,production_cost_per_batch,minimum_margin_percent,target_margin_percent,active,available,portfolio_key)
values ('a5555555-5555-4555-8555-555555555555','a1111111-1111-4111-8111-111111111111','Produto P1',10,10,10,20,0,10,15,true,true,'brigadeiro-oreo');
insert into public.recipe_items(id,business_id,product_id,supply_id,quantity,unit) values
 ('a6666666-6666-4666-8666-666666666661','a1111111-1111-4111-8111-111111111111','a5555555-5555-4555-8555-555555555555','a3333333-3333-4333-8333-333333333331',100,'g'),
 ('a6666666-6666-4666-8666-666666666662','a1111111-1111-4111-8111-111111111111','a5555555-5555-4555-8555-555555555555','a3333333-3333-4333-8333-333333333332',10,'unit');

set local role authenticated;
select set_config('request.jwt.claim.sub','a2222222-2222-4222-8222-222222222222',true);
select set_config('request.jwt.claims','{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}',true);

select lives_ok($$select public.apply_nat_transition_v4('a1111111-1111-4111-8111-111111111111','a7777777-1000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object('type','save_owner_cash_movement','payload',jsonb_build_object('id','a7777777-7777-4777-8777-777777777771','movementType','contribution','amount',100,'occurredAt',current_date::text,'note','Capital de teste'))))$$,'owner contribution can be registered through current transition');
select lives_ok($$select public.apply_nat_transition_v4('a1111111-1111-4111-8111-111111111111','a7777777-1000-4000-8000-000000000002',jsonb_build_array(jsonb_build_object('type','save_owner_cash_movement','payload',jsonb_build_object('id','a7777777-7777-4777-8777-777777777772','movementType','withdrawal','amount',20,'occurredAt',current_date::text,'note','Retirada de teste'))))$$,'owner withdrawal can be registered through current transition');
select is((select sum(case when movement_type='contribution' then amount else -amount end) from public.owner_cash_movements where business_id='a1111111-1111-4111-8111-111111111111'),80::numeric,'owner cash movements net to 80 without becoming sales');
select is((select count(*)::integer from public.sales where business_id='a1111111-1111-4111-8111-111111111111'),0,'owner cash movements do not create revenue records');

select lives_ok($$select public.set_inventory_balance('a1111111-1111-4111-8111-111111111111','supply','a3333333-3333-4333-8333-333333333331',1000,0,'Saldo inicial')$$,'ingredient tracking starts');
select lives_ok($$select public.set_inventory_balance('a1111111-1111-4111-8111-111111111111','supply','a3333333-3333-4333-8333-333333333332',100,0,'Saldo inicial')$$,'packaging tracking starts');
select lives_ok($$select public.set_inventory_balance('a1111111-1111-4111-8111-111111111111','product','a5555555-5555-4555-8555-555555555555',0,0,'Saldo inicial')$$,'finished-product tracking starts without invented balance');
select lives_ok($$select public.record_inventory_production_v2('a1111111-1111-4111-8111-111111111111','a7777777-1000-4000-8000-000000000003','a5555555-5555-4555-8555-555555555555',1,now(),'Lote P1')$$,'production succeeds under P1 rules');
select is((select sum(quantity_delta)::numeric from public.inventory_movements where business_id='a1111111-1111-4111-8111-111111111111' and supply_id='a3333333-3333-4333-8333-333333333331'),890::numeric,'10 percent physical loss makes production consume 110g ingredient');
select is((select sum(quantity_delta)::numeric from public.inventory_movements where business_id='a1111111-1111-4111-8111-111111111111' and supply_id='a3333333-3333-4333-8333-333333333332'),100::numeric,'production does not consume packaging');
select is((select unit_cost_snapshot::numeric from public.inventory_product_cost_layers where business_id='a1111111-1111-4111-8111-111111111111' limit 1),3.1::numeric,'production freezes ingredient loss plus labor at R$3.10 per finished unit');

reset role;
insert into public.supply_purchases(id,business_id,supply_id,package_quantity,package_unit,package_price,purchased_at)
values ('a4444444-4444-4444-8444-444444444443','a1111111-1111-4111-8111-111111111111','a3333333-3333-4333-8333-333333333331',100,'g',100,current_date);

set local role authenticated;
select set_config('request.jwt.claim.sub','a2222222-2222-4222-8222-222222222222',true);
select set_config('request.jwt.claims','{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}',true);
select lives_ok($$select public.apply_nat_transition_v4('a1111111-1111-4111-8111-111111111111','a7777777-1000-4000-8000-000000000004',jsonb_build_array(jsonb_build_object('type','create_sale','payload',jsonb_build_object('id','a8888888-8888-4888-8888-888888888881','items','[{"productId":"a5555555-5555-4555-8555-555555555555","quantity":2}]'::jsonb,'totalReceived',20,'saleValue',20,'paymentStatus','paid','paymentMethod','card','soldAt',now()::text,'transactionType','sale','saleChannel','other','deliveryCost',0,'belowCostOverride',false,'marginOverride',false))))$$,'card sale uses frozen production layer');
select is((select round(unit_cost_snapshot,2) from public.sale_items where sale_id='a8888888-8888-4888-8888-888888888881'),3.60::numeric,'sale cost uses frozen R$3.10 production plus R$0.50 packaging, not later ingredient price');
select is((select variable_fee_snapshot from public.sales where id='a8888888-8888-4888-8888-888888888881'),0.60::numeric,'card sale freezes its 3 percent payment fee');
select is((select sum(quantity_delta)::numeric from public.inventory_movements where business_id='a1111111-1111-4111-8111-111111111111' and supply_id='a3333333-3333-4333-8333-333333333332'),98::numeric,'sale consumes packaging at dispatch time');
select is((select sum(quantity_delta)::numeric from public.inventory_movements where business_id='a1111111-1111-4111-8111-111111111111' and product_id='a5555555-5555-4555-8555-555555555555'),8::numeric,'sale consumes finished-product stock');
select is((select units_remaining::numeric from public.inventory_product_cost_layers where business_id='a1111111-1111-4111-8111-111111111111' limit 1),8::numeric,'FIFO cost layer is consumed with finished stock');

select lives_ok($$select public.apply_nat_transition_v4('a1111111-1111-4111-8111-111111111111','a7777777-1000-4000-8000-000000000005',jsonb_build_array(jsonb_build_object('type','cancel_sale','expectedUpdatedAt',(select updated_at::text from public.sales where id='a8888888-8888-4888-8888-888888888881'),'payload',jsonb_build_object('id','a8888888-8888-4888-8888-888888888881','reason','Cancelamento P1'))))$$,'sale cancellation succeeds');
select is((select sum(quantity_delta)::numeric from public.inventory_movements where business_id='a1111111-1111-4111-8111-111111111111' and supply_id='a3333333-3333-4333-8333-333333333332'),100::numeric,'cancellation restores packaging');
select is((select units_remaining::numeric from public.inventory_product_cost_layers where business_id='a1111111-1111-4111-8111-111111111111' limit 1),10::numeric,'cancellation restores FIFO cost allocation');

select lives_ok($$select public.apply_nat_transition_v4('a1111111-1111-4111-8111-111111111111','a7777777-1000-4000-8000-000000000006',jsonb_build_array(jsonb_build_object('type','create_sale','payload',jsonb_build_object('id','a8888888-8888-4888-8888-888888888882','items','[{"productId":"a5555555-5555-4555-8555-555555555555","quantity":1}]'::jsonb,'totalReceived',0,'saleValue',0,'paymentStatus','paid','paymentMethod','other','soldAt',now()::text,'transactionType','courtesy','saleChannel','other','deliveryCost',0,'belowCostOverride',false,'marginOverride',false))))$$,'courtesy can leave stock without revenue');
select is((select variable_fee_snapshot from public.sales where id='a8888888-8888-4888-8888-888888888882'),0::numeric,'courtesy never has payment fee');
select is((select total_received from public.sales where id='a8888888-8888-4888-8888-888888888882'),0::numeric,'courtesy remains noncommercial');

select * from finish();
rollback;

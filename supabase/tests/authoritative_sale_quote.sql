begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select ok(has_function_privilege('authenticated','public.quote_sale_v1(uuid,jsonb,numeric,text,timestamptz,text,numeric)','execute'),'authenticated can request authoritative sale quote');

insert into public.businesses(id,name) values ('b1111111-1111-4111-8111-111111111111','Quote test');
insert into private.allowed_auth_emails(email,business_id,role) values ('quote@example.invalid','b1111111-1111-4111-8111-111111111111','admin');
insert into auth.users(id,email,aud,role,created_at,updated_at) values ('b2222222-2222-4222-8222-222222222222','quote@example.invalid','authenticated','authenticated',now(),now());
insert into public.business_members(business_id,user_id,role) values ('b1111111-1111-4111-8111-111111111111','b2222222-2222-4222-8222-222222222222','admin');
insert into public.business_settings(business_id,owner_name,pix_fee_percent,cash_fee_percent,card_fee_percent,payment_fee_percent,default_minimum_margin_percent,default_target_margin_percent)
values ('b1111111-1111-4111-8111-111111111111','Quote test',0,0,3,3,10,20);
insert into public.supplies(id,business_id,name,category,active) values
 ('b3333333-3333-4333-8333-333333333331','b1111111-1111-4111-8111-111111111111','Ingrediente quote','ingredient',true),
 ('b3333333-3333-4333-8333-333333333332','b1111111-1111-4111-8111-111111111111','Embalagem quote','packaging',true);
insert into public.supply_purchases(id,business_id,supply_id,package_quantity,package_unit,package_price,purchased_at) values
 ('b4444444-4444-4444-8444-444444444441','b1111111-1111-4111-8111-111111111111','b3333333-3333-4333-8333-333333333331',100,'g',10,date '2026-09-13'),
 ('b4444444-4444-4444-8444-444444444442','b1111111-1111-4111-8111-111111111111','b3333333-3333-4333-8333-333333333332',100,'unit',50,date '2026-09-13');
insert into public.products(id,business_id,name,batch_yield,selling_price,loss_percent,labor_cost_per_batch,production_cost_per_batch,minimum_margin_percent,target_margin_percent,active,available)
values ('b5555555-5555-4555-8555-555555555555','b1111111-1111-4111-8111-111111111111','Produto quote',10,10,10,20,0,10,20,true,true);
insert into public.recipe_items(id,business_id,product_id,supply_id,quantity,unit) values
 ('b6666666-6666-4666-8666-666666666661','b1111111-1111-4111-8111-111111111111','b5555555-5555-4555-8555-555555555555','b3333333-3333-4333-8333-333333333331',100,'g'),
 ('b6666666-6666-4666-8666-666666666662','b1111111-1111-4111-8111-111111111111','b5555555-5555-4555-8555-555555555555','b3333333-3333-4333-8333-333333333332',10,'unit');

set local role authenticated;
select set_config('request.jwt.claim.sub','b2222222-2222-4222-8222-222222222222',true);
select set_config('request.jwt.claims','{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}',true);
select lives_ok($$select public.set_inventory_balance('b1111111-1111-4111-8111-111111111111','supply','b3333333-3333-4333-8333-333333333331',1000,0,'Saldo inicial')$$,'ingredient tracking starts');
select lives_ok($$select public.set_inventory_balance('b1111111-1111-4111-8111-111111111111','product','b5555555-5555-4555-8555-555555555555',0,0,'Saldo inicial')$$,'product tracking starts');
select lives_ok($$select public.record_inventory_production_v2('b1111111-1111-4111-8111-111111111111','b7777777-7777-4777-8777-777777777771','b5555555-5555-4555-8555-555555555555',1,timestamptz '2026-09-13 09:00:00-03','Lote inicial')$$,'production creates FIFO cost layer through idempotent API');

reset role;
insert into public.supply_purchases(id,business_id,supply_id,package_quantity,package_unit,package_price,purchased_at)
values ('b4444444-4444-4444-8444-444444444443','b1111111-1111-4111-8111-111111111111','b3333333-3333-4333-8333-333333333331',100,'g',100,date '2026-09-14');

set local role authenticated;
select set_config('request.jwt.claim.sub','b2222222-2222-4222-8222-222222222222',true);
select set_config('request.jwt.claims','{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}',true);

select is(
  round(((public.quote_sale_v1('b1111111-1111-4111-8111-111111111111','[{"productId":"b5555555-5555-4555-8555-555555555555","quantity":2}]'::jsonb,20,'card',timestamptz '2026-09-14 12:00:00-03','sale',2)->>'totalCost')::numeric),2),
  7.20::numeric,
  'quote uses frozen FIFO production cost plus packaging instead of latest ingredient purchase'
);
select is(
  ((public.quote_sale_v1('b1111111-1111-4111-8111-111111111111','[{"productId":"b5555555-5555-4555-8555-555555555555","quantity":2}]'::jsonb,20,'card',timestamptz '2026-09-14 12:00:00-03','sale',2)->>'variableFee')::numeric),
  0.60::numeric,
  'quote uses payment-method fee'
);
select is(
  round(((public.quote_sale_v1('b1111111-1111-4111-8111-111111111111','[{"productId":"b5555555-5555-4555-8555-555555555555","quantity":2}]'::jsonb,20,'card',timestamptz '2026-09-14 12:00:00-03','sale',2)->>'contribution')::numeric),2),
  10.20::numeric,
  'quote includes FIFO cost, fee and delivery in contribution'
);
select lives_ok(
  $$select public.apply_nat_transition_v4(
    'b1111111-1111-4111-8111-111111111111',
    'b7777777-7777-4777-8777-777777777772',
    '[{"type":"create_sale","payload":{"id":"b8888888-8888-4888-8888-888888888881","items":[{"productId":"b5555555-5555-4555-8555-555555555555","quantity":2}],"totalReceived":20,"saleValue":20,"paymentStatus":"paid","paymentMethod":"card","soldAt":"2026-09-13T12:00:00-03:00","transactionType":"sale","saleChannel":"in_person","deliveryCost":2,"discountReason":null,"belowCostOverride":false,"marginOverride":false}}]'::jsonb
  )$$,
  'sale persists after authoritative quote through current transition'
);
select is((select contribution_snapshot from public.sales where id='b8888888-8888-4888-8888-888888888881'),10.20::numeric,'persisted contribution matches quote');

reset role;
update public.products set available=false where id='b5555555-5555-4555-8555-555555555555';
set local role authenticated;
select set_config('request.jwt.claim.sub','b2222222-2222-4222-8222-222222222222',true);
select set_config('request.jwt.claims','{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}',true);
select lives_ok(
  $$select public.quote_sale_v1('b1111111-1111-4111-8111-111111111111','[{"productId":"b5555555-5555-4555-8555-555555555555","quantity":1}]'::jsonb,0,'other',timestamptz '2026-09-14 12:00:00-03','courtesy',0)$$,
  'paused product can still be quoted for a noncommercial stock exit'
);
select throws_ok(
  $$select public.quote_sale_v1('b1111111-1111-4111-8111-111111111111','[{"productId":"b5555555-5555-4555-8555-555555555555","quantity":1}]'::jsonb,10,'pix',timestamptz '2026-09-14 12:00:00-03','sale',0)$$,
  '22023','Produto temporariamente indisponível para venda.','paused product remains blocked for a paid sale'
);

select * from finish();
rollback;

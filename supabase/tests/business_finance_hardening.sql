begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

select has_column('public','sales','margin_override','sales records explicit margin exceptions');

insert into public.businesses(id,name) values ('c1111111-1111-4111-8111-111111111111','Business finance hardening');
insert into private.allowed_auth_emails(email,business_id,role) values ('finance-hardening@example.invalid','c1111111-1111-4111-8111-111111111111','admin');
insert into auth.users(id,email,aud,role,created_at,updated_at) values ('c2222222-2222-4222-8222-222222222222','finance-hardening@example.invalid','authenticated','authenticated',now(),now());
insert into public.business_members(business_id,user_id,role) values ('c1111111-1111-4111-8111-111111111111','c2222222-2222-4222-8222-222222222222','admin');
insert into public.business_settings(business_id,owner_name,pix_fee_percent,cash_fee_percent,card_fee_percent,payment_fee_percent,default_minimum_margin_percent,default_target_margin_percent)
values ('c1111111-1111-4111-8111-111111111111','Finance test',0,0,0,0,10,20);
insert into public.supplies(id,business_id,name,category,active) values
 ('c3333333-3333-4333-8333-333333333331','c1111111-1111-4111-8111-111111111111','Ingrediente','ingredient',true),
 ('c3333333-3333-4333-8333-333333333332','c1111111-1111-4111-8111-111111111111','Embalagem','packaging',true);
insert into public.supply_purchases(id,business_id,supply_id,package_quantity,package_unit,package_price,purchased_at) values
 ('c4444444-4444-4444-8444-444444444441','c1111111-1111-4111-8111-111111111111','c3333333-3333-4333-8333-333333333331',100,'g',10,current_date),
 ('c4444444-4444-4444-8444-444444444442','c1111111-1111-4111-8111-111111111111','c3333333-3333-4333-8333-333333333332',10,'unit',5,current_date);
insert into public.products(id,business_id,name,batch_yield,selling_price,loss_percent,labor_cost_per_batch,production_cost_per_batch,minimum_margin_percent,target_margin_percent,active,available)
values ('c5555555-5555-4555-8555-555555555555','c1111111-1111-4111-8111-111111111111','Produto',10,6,10,20,10,10,20,true,true);
insert into public.recipe_items(id,business_id,product_id,supply_id,quantity,unit) values
 ('c6666666-6666-4666-8666-666666666661','c1111111-1111-4111-8111-111111111111','c5555555-5555-4555-8555-555555555555','c3333333-3333-4333-8333-333333333331',100,'g'),
 ('c6666666-6666-4666-8666-666666666662','c1111111-1111-4111-8111-111111111111','c5555555-5555-4555-8555-555555555555','c3333333-3333-4333-8333-333333333332',10,'unit');

set local role authenticated;
select set_config('request.jwt.claim.sub','c2222222-2222-4222-8222-222222222222',true);
select set_config('request.jwt.claims','{"sub":"c2222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}',true);

select lives_ok(
  $$select public.save_owner_cash_movement('c1111111-1111-4111-8111-111111111111','c7777777-7777-4777-8777-777777777771','initial_capital',100,current_date,'Capital inicial')$$,
  'initial capital is a valid owner cash movement'
);
select lives_ok(
  $$select public.save_owner_cash_movement('c1111111-1111-4111-8111-111111111111','c7777777-7777-4777-8777-777777777772','contribution',20,current_date,'Aporte posterior')$$,
  'subsequent owner contribution remains valid'
);
select throws_ok(
  $$select public.save_owner_cash_movement('c1111111-1111-4111-8111-111111111111','c7777777-7777-4777-8777-777777777773','initial_capital',10,current_date,'Duplicado')$$,
  '23505',null,'only one initial capital record is allowed per business'
);
select is(
  (public.get_financial_funding_snapshot('c1111111-1111-4111-8111-111111111111',date_trunc('month',current_date)::date)->>'initialCapital')::numeric,
  100::numeric,
  'financial snapshot exposes initial capital separately'
);
select is(
  (public.get_financial_funding_snapshot('c1111111-1111-4111-8111-111111111111',date_trunc('month',current_date)::date)->>'ownerContributions')::numeric,
  20::numeric,
  'initial capital does not inflate later owner contributions'
);

select lives_ok($$select public.set_inventory_balance('c1111111-1111-4111-8111-111111111111','supply','c3333333-3333-4333-8333-333333333331',1000,0,'Saldo inicial')$$,'ingredient inventory is tracked');
select lives_ok($$select public.set_inventory_balance('c1111111-1111-4111-8111-111111111111','product','c5555555-5555-4555-8555-555555555555',0,0,'Saldo inicial')$$,'product inventory is tracked');
select lives_ok($$select public.record_inventory_production('c1111111-1111-4111-8111-111111111111','c5555555-5555-4555-8555-555555555555',1,now(),'Lote inicial')$$,'production freezes a FIFO cost layer');

select is(
  public.quote_sale_v1('c1111111-1111-4111-8111-111111111111','[{"productId":"c5555555-5555-4555-8555-555555555555","quantity":1}]'::jsonb,5,'pix',now(),'sale',0)->>'marginStatus',
  'below_minimum',
  'positive sale below protected margin is distinguished from below-cost sale'
);
select ok(
  (public.quote_sale_v1('c1111111-1111-4111-8111-111111111111','[{"productId":"c5555555-5555-4555-8555-555555555555","quantity":1}]'::jsonb,6,'pix',now(),'sale',0)->>'recommendedRequiredValue')::numeric
  >
  (public.quote_sale_v1('c1111111-1111-4111-8111-111111111111','[{"productId":"c5555555-5555-4555-8555-555555555555","quantity":1}]'::jsonb,6,'pix',now(),'sale',0)->>'minimumRequiredValue')::numeric,
  'recommended order value is above the protected minimum'
);

select throws_ok(
  $$select public.apply_nat_transition_v4('c1111111-1111-4111-8111-111111111111','c8888888-8888-4888-8888-888888888881','[{"type":"create_sale","expectedUpdatedAt":null,"payload":{"id":"c9999999-9999-4999-8999-999999999991","items":[{"productId":"c5555555-5555-4555-8555-555555555555","quantity":1}],"totalReceived":5,"saleValue":5,"paymentStatus":"paid","paymentMethod":"pix","soldAt":"2026-09-12T12:00:00-03:00","transactionType":"sale","saleChannel":"in_person","deliveryCost":0,"discountReason":"Combo consciente","belowCostOverride":false,"marginOverride":false}}]'::jsonb)$$,
  '22023','Venda abaixo da margem mínima exige confirmação explícita.','backend rejects below-minimum sale without an explicit exception'
);
select lives_ok(
  $$select public.apply_nat_transition_v4('c1111111-1111-4111-8111-111111111111','c8888888-8888-4888-8888-888888888882','[{"type":"create_sale","expectedUpdatedAt":null,"payload":{"id":"c9999999-9999-4999-8999-999999999992","items":[{"productId":"c5555555-5555-4555-8555-555555555555","quantity":1}],"totalReceived":5,"saleValue":5,"paymentStatus":"paid","paymentMethod":"pix","soldAt":"2026-09-12T12:00:00-03:00","transactionType":"sale","saleChannel":"in_person","deliveryCost":0,"discountReason":"Combo consciente","belowCostOverride":false,"marginOverride":true}}]'::jsonb)$$,
  'backend accepts a conscious below-minimum exception with reason'
);

select * from finish();
rollback;

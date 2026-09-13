-- Inventory ledger, automatic movements and opt-in enforcement regression tests.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

select has_table('public','inventory_tracking','inventory tracking table exists');
select has_table('public','inventory_movements','inventory movement ledger exists');
select has_table('public','inventory_productions','inventory production history exists');
select ok(has_function_privilege('authenticated','public.get_inventory_snapshot(uuid)','execute'),'authenticated can read inventory snapshot through RPC');
select ok(has_function_privilege('authenticated','public.set_inventory_balance(uuid,text,uuid,numeric,numeric,text)','execute'),'authenticated can configure counted stock through RPC');
select ok(has_function_privilege('authenticated','public.record_inventory_production_v2(uuid,uuid,uuid,numeric,timestamptz,text)','execute'),'authenticated can register production through idempotent RPC');
select ok(not has_table_privilege('authenticated','public.inventory_movements','insert'),'authenticated cannot forge ledger movements directly');

insert into public.businesses(id,name) values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Inventory test');
insert into private.allowed_auth_emails(email,business_id,role) values ('inventory@example.invalid','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','admin');
insert into auth.users(id,email,aud,role,created_at,updated_at) values ('55555555-5555-4555-8555-555555555555','inventory@example.invalid','authenticated','authenticated',now(),now());
insert into public.business_members(business_id,user_id,role) values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','55555555-5555-4555-8555-555555555555','admin');
insert into public.business_settings(business_id,owner_name) values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Inventory test');
insert into public.supplies(id,business_id,name,category,active) values ('eeeeeeee-0000-4000-8000-000000000001','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Chocolate','ingredient',true);
insert into public.supply_purchases(id,business_id,supply_id,package_quantity,package_unit,package_price,purchased_at)
values ('eeeeeeee-0000-4000-8000-000000000002','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeeeeeee-0000-4000-8000-000000000001',1,'kg',40,current_date);
insert into public.products(id,business_id,name,batch_yield,selling_price,loss_percent,production_cost_per_batch,minimum_margin_percent,target_margin_percent,active,available)
values ('eeeeeeee-0000-4000-8000-000000000003','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Brownie estoque',5,10,0,0,35,50,true,true);
insert into public.recipe_items(id,business_id,product_id,supply_id,quantity,unit)
values ('eeeeeeee-0000-4000-8000-000000000004','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeeeeeee-0000-4000-8000-000000000003','eeeeeeee-0000-4000-8000-000000000001',100,'g');

set local role authenticated;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select set_config('request.jwt.claims','{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated","aal":"aal2"}',true);

select lives_ok(
  $$select public.set_inventory_balance('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','supply','eeeeeeee-0000-4000-8000-000000000001',2000,300,'Contagem inicial')$$,
  'supply stock can be activated from a counted opening balance'
);
select lives_ok(
  $$select public.set_inventory_balance('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','product','eeeeeeee-0000-4000-8000-000000000003',10,2,'Contagem inicial')$$,
  'finished-product stock can be activated from a counted opening balance'
);
select is(
  (select sum(quantity_delta)::numeric from public.inventory_movements where business_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' and supply_id='eeeeeeee-0000-4000-8000-000000000001'),
  2000::numeric,
  'opening balance normalizes one supply to its base unit'
);

reset role;
insert into public.supply_purchases(id,business_id,supply_id,package_quantity,package_unit,package_price,purchased_at)
values ('eeeeeeee-0000-4000-8000-000000000005','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeeeeeee-0000-4000-8000-000000000001',500,'g',22,current_date);

set local role authenticated;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select set_config('request.jwt.claims','{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated","aal":"aal2"}',true);
select is(
  (select sum(quantity_delta)::numeric from public.inventory_movements where business_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' and supply_id='eeeeeeee-0000-4000-8000-000000000001'),
  2500::numeric,
  'a new purchase automatically enters monitored supply stock'
);
select lives_ok(
  $$select public.record_inventory_production_v2('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeeeeeee-1000-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000003',2,now(),'Dois lotes')$$,
  'production can be registered atomically through idempotent API'
);
select is(
  (select sum(quantity_delta)::numeric from public.inventory_movements where business_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' and supply_id='eeeeeeee-0000-4000-8000-000000000001'),
  2300::numeric,
  'production consumes tracked recipe supplies'
);
select is(
  (select sum(quantity_delta)::numeric from public.inventory_movements where business_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' and product_id='eeeeeeee-0000-4000-8000-000000000003'),
  20::numeric,
  'production adds batch yield to finished-product stock'
);

select lives_ok(
  $$select public.apply_nat_transition_v4(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeeeeeee-1000-4000-8000-000000000002',
    jsonb_build_array(jsonb_build_object('type','create_sale','payload',jsonb_build_object(
      'id','eeeeeeee-0000-4000-8000-000000000006','items','[{"productId":"eeeeeeee-0000-4000-8000-000000000003","quantity":3}]'::jsonb,
      'totalReceived',30,'saleValue',30,'paymentStatus','paid','paymentMethod','pix',
      'soldAt',((current_date::timestamp + interval '12 hours') at time zone 'America/Sao_Paulo')::text,
      'transactionType','sale','saleChannel','other','deliveryCost',0,'belowCostOverride',false,'marginOverride',false
    )))
  )$$,
  'a sale succeeds when monitored finished stock is sufficient'
);
select is(
  (select sum(quantity_delta)::numeric from public.inventory_movements where business_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' and product_id='eeeeeeee-0000-4000-8000-000000000003'),
  17::numeric,
  'sale automatically removes finished-product quantity'
);
select lives_ok(
  $$select public.apply_nat_transition_v4(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeeeeeee-1000-4000-8000-000000000003',
    jsonb_build_array(jsonb_build_object(
      'type','cancel_sale','expectedUpdatedAt',(select updated_at::text from public.sales where id='eeeeeeee-0000-4000-8000-000000000006'),
      'payload',jsonb_build_object('id','eeeeeeee-0000-4000-8000-000000000006','reason','Teste de devolução')
    ))
  )$$,
  'cancelling a sale succeeds with inventory enabled'
);
select is(
  (select sum(quantity_delta)::numeric from public.inventory_movements where business_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' and product_id='eeeeeeee-0000-4000-8000-000000000003'),
  20::numeric,
  'sale cancellation restores only stock previously removed by that sale'
);

select lives_ok(
  $$select public.set_inventory_balance('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','supply','eeeeeeee-0000-4000-8000-000000000001',100,300,'Contagem física')$$,
  'manual stock count creates an adjustment without deleting history'
);
select is(
  (select sum(quantity_delta)::numeric from public.inventory_movements where business_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' and supply_id='eeeeeeee-0000-4000-8000-000000000001'),
  100::numeric,
  'manual adjustment reaches the counted balance'
);
select is(
  ((public.get_inventory_snapshot('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')->'items') @> '[{"kind":"supply","itemId":"eeeeeeee-0000-4000-8000-000000000001","lowStock":true}]'::jsonb),
  true,
  'snapshot flags monitored items at or below minimum stock'
);

select throws_ok(
  $$select public.apply_nat_transition_v4(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeeeeeee-1000-4000-8000-000000000004',
    jsonb_build_array(jsonb_build_object('type','create_sale','payload',jsonb_build_object(
      'id','eeeeeeee-0000-4000-8000-000000000007','items','[{"productId":"eeeeeeee-0000-4000-8000-000000000003","quantity":21}]'::jsonb,
      'totalReceived',210,'saleValue',210,'paymentStatus','paid','paymentMethod','pix',
      'soldAt',((current_date::timestamp + interval '12 hours') at time zone 'America/Sao_Paulo')::text,
      'transactionType','sale','saleChannel','other','deliveryCost',0,'belowCostOverride',false,'marginOverride',false
    )))
  )$$,
  '22023',
  'Estoque insuficiente do produto acabado para concluir a venda.',
  'database rejects a sale that exceeds monitored finished stock'
);
select is(
  (select count(*)::integer from public.sales where id='eeeeeeee-0000-4000-8000-000000000007'),
  0,
  'failed stock enforcement rolls the whole sale back'
);
select is(
  (select count(*)::integer from public.inventory_productions where business_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  1,
  'production history is preserved as its own auditable record'
);
select is(
  (select count(*)::integer from public.inventory_movements where business_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' and movement_type='purchase'),
  1,
  'only purchases occurring after tracking starts are added automatically'
);
select ok(
  (select count(*) from public.inventory_movements where business_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') >= 7,
  'inventory is represented by an append-only movement ledger'
);

select * from finish();
rollback;

-- Stage 3 regression: purchase correction, unit integrity, idempotency and product stock targets.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

insert into public.businesses(id,name) values ('a1000000-0000-4000-8000-000000000001','Purchase inventory integrity');
insert into private.allowed_auth_emails(email,business_id,role) values ('purchase-integrity@example.invalid','a1000000-0000-4000-8000-000000000001','admin');
insert into auth.users(id,email,aud,role,created_at,updated_at) values ('a2000000-0000-4000-8000-000000000001','purchase-integrity@example.invalid','authenticated','authenticated',now(),now());
insert into public.business_members(business_id,user_id,role) values ('a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','admin');
insert into public.business_settings(business_id,owner_name) values ('a1000000-0000-4000-8000-000000000001','Purchase integrity');
insert into public.supplies(id,business_id,name,category,active)
values ('a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Chocolate teste','ingredient',true);
insert into public.inventory_tracking(business_id,supply_id,base_unit,minimum_quantity)
values ('a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','g',0);
insert into public.supply_purchases(id,business_id,supply_id,package_quantity,package_unit,package_price,purchased_at,funding_source)
values ('a4000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001',100,'g',10,'2026-09-13','business');
insert into public.products(id,business_id,name,batch_yield,selling_price,loss_percent,labor_cost_per_batch,production_cost_per_batch,minimum_margin_percent,target_margin_percent,active,available)
values ('a5000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Produto teste',10,5,0,0,0,10,20,true,true);
insert into public.recipe_items(id,business_id,product_id,supply_id,quantity,unit)
values ('a6000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001',100,'g');

-- Test-only grants are rolled back with this pgTAP transaction. Production keeps
-- private helpers inaccessible to authenticated users.
grant usage on schema private to authenticated;
grant execute on function private.inventory_balance(uuid,text,uuid) to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);

select is(
  (select ((public.get_supply_purchase_snapshot('a1000000-0000-4000-8000-000000000001','2026-09-01'::date)->'latest'->0->>'purchaseId')::uuid)),
  'a4000000-0000-4000-8000-000000000001'::uuid,
  'purchase snapshot exposes the exact latest purchase id'
);
select is(
  (select (occurred_at at time zone 'America/Sao_Paulo')::date from public.inventory_movements where source_key='purchase:a4000000-0000-4000-8000-000000000001'),
  '2026-09-13'::date,
  'purchase movement keeps the business purchase date'
);

select lives_ok(
  format(
    'select public.apply_nat_transition_v4(%L::uuid,%L::uuid,%L::jsonb)',
    'a1000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'type','save_supply','expectedUpdatedAt',(select updated_at::text from public.supplies where id='a3000000-0000-4000-8000-000000000001'),
      'payload',jsonb_build_object(
        'id','a3000000-0000-4000-8000-000000000001','name','Chocolate teste','category','ingredient',
        'packageQuantity',100,'packageUnit','g','packagePrice',12,'purchasedAt','2026-09-13','fundingSource','business',
        'purchaseMode','correct','purchaseId','a4000000-0000-4000-8000-000000000001'
      )
    ))::text
  ),
  'price-only correction updates the existing purchase'
);
select is((select count(*)::integer from public.supply_purchases where supply_id='a3000000-0000-4000-8000-000000000001'),1,'price correction does not append another purchase');
select is((select package_price::numeric from public.supply_purchases where id='a4000000-0000-4000-8000-000000000001'),12::numeric,'price correction persists the corrected price');
select is(private.inventory_balance('a1000000-0000-4000-8000-000000000001','supply','a3000000-0000-4000-8000-000000000001'),100::numeric,'price-only correction does not change physical stock');
select is((select count(*)::integer from public.inventory_movements where source_key like 'purchase-correction:a4000000-0000-4000-8000-000000000001:%'),0,'price-only correction does not invent stock movements');

select lives_ok(
  format(
    'select public.apply_nat_transition_v4(%L::uuid,%L::uuid,%L::jsonb)',
    'a1000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000002',
    jsonb_build_array(jsonb_build_object(
      'type','save_supply','expectedUpdatedAt',(select updated_at::text from public.supplies where id='a3000000-0000-4000-8000-000000000001'),
      'payload',jsonb_build_object(
        'id','a3000000-0000-4000-8000-000000000001','name','Chocolate teste','category','ingredient',
        'packageQuantity',120,'packageUnit','g','packagePrice',12,'purchasedAt','2026-09-14','fundingSource','owner',
        'purchaseMode','correct','purchaseId','a4000000-0000-4000-8000-000000000001'
      )
    ))::text
  ),
  'quantity/date/funding correction succeeds without a second purchase'
);
select is((select count(*)::integer from public.supply_purchases where supply_id='a3000000-0000-4000-8000-000000000001'),1,'quantity correction still preserves one purchase row');
select is((select package_quantity::numeric from public.supply_purchases where id='a4000000-0000-4000-8000-000000000001'),120::numeric,'corrected purchase quantity is persisted');
select is(private.inventory_balance('a1000000-0000-4000-8000-000000000001','supply','a3000000-0000-4000-8000-000000000001'),120::numeric,'immutable ledger compensation reconciles stock to corrected quantity');
select is((select count(*)::integer from public.inventory_movements where source_key like 'purchase-correction:a4000000-0000-4000-8000-000000000001:%'),2,'stock-affecting correction creates reversal and replacement movements');
select is((select max((occurred_at at time zone 'America/Sao_Paulo')::date) from public.inventory_movements where source_key like 'purchase-correction:a4000000-0000-4000-8000-000000000001:%:replacement'),'2026-09-14'::date,'replacement movement uses the corrected business date');

select lives_ok(
  format(
    'select public.apply_nat_transition_v4(%L::uuid,%L::uuid,%L::jsonb)',
    'a1000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000003',
    jsonb_build_array(jsonb_build_object(
      'type','save_supply','expectedUpdatedAt',(select updated_at::text from public.supplies where id='a3000000-0000-4000-8000-000000000001'),
      'payload',jsonb_build_object(
        'id','a3000000-0000-4000-8000-000000000001','name','Chocolate teste','category','ingredient',
        'packageQuantity',50,'packageUnit','g','packagePrice',6,'purchasedAt','2026-09-15','fundingSource','business',
        'purchaseMode','append','appendPurchase',true
      )
    ))::text
  ),
  'new physical purchase appends history explicitly'
);
select is((select count(*)::integer from public.supply_purchases where supply_id='a3000000-0000-4000-8000-000000000001'),2,'new purchase creates a second purchase row');
select is(private.inventory_balance('a1000000-0000-4000-8000-000000000001','supply','a3000000-0000-4000-8000-000000000001'),170::numeric,'new purchase adds physical stock exactly once');

select throws_ok(
  format(
    'select public.apply_nat_transition_v4(%L::uuid,%L::uuid,%L::jsonb)',
    'a1000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000004',
    jsonb_build_array(jsonb_build_object(
      'type','save_supply','expectedUpdatedAt',(select updated_at::text from public.supplies where id='a3000000-0000-4000-8000-000000000001'),
      'payload',jsonb_build_object(
        'id','a3000000-0000-4000-8000-000000000001','name','Chocolate teste','category','ingredient',
        'packageQuantity',130,'packageUnit','g','packagePrice',13,'purchasedAt','2026-09-14','fundingSource','owner',
        'purchaseMode','correct','purchaseId','a4000000-0000-4000-8000-000000000001'
      )
    ))::text
  ),
  '40001','A compra mudou desde que esta tela foi aberta. Atualize os dados antes de corrigir.',
  'stale correction cannot overwrite an older purchase after a new purchase was appended'
);

select throws_ok(
  format(
    'select public.apply_nat_transition_v4(%L::uuid,%L::uuid,%L::jsonb)',
    'a1000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000005',
    jsonb_build_array(jsonb_build_object(
      'type','save_supply','expectedUpdatedAt',(select updated_at::text from public.supplies where id='a3000000-0000-4000-8000-000000000001'),
      'payload',jsonb_build_object(
        'id','a3000000-0000-4000-8000-000000000001','name','Chocolate teste','category','ingredient',
        'packageQuantity',1,'packageUnit','unit','packagePrice',6,'purchasedAt','2026-09-16','fundingSource','business',
        'purchaseMode','append'
      )
    ))::text
  ),
  '22023','A unidade desta compra é incompatível com o histórico do insumo. Cadastre outro item para mudar de dimensão.',
  'same supply identity cannot change unit dimension across purchases'
);

select is((public.set_product_stock_v2('a1000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001',10,0,'2026-09-16 12:00:00+00',null)->>'action'),'opening','first product balance is an opening, not synthetic production');
select is(private.inventory_balance('a1000000-0000-4000-8000-000000000001','supply','a3000000-0000-4000-8000-000000000001'),170::numeric,'opening finished stock does not consume current ingredients');
select throws_ok(
  $$select public.set_inventory_balance('a1000000-0000-4000-8000-000000000001','product','a5000000-0000-4000-8000-000000000001',20,0,null)$$,
  '22023','Para aumentar produto acabado, registre produção para que os ingredientes sejam descontados.',
  'direct positive finished-product adjustment cannot bypass recipe consumption'
);
select is((public.set_product_stock_v2('a1000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000002','a5000000-0000-4000-8000-000000000001',20,0,'2026-09-16 13:00:00+00',null)->>'action'),'production','raising tracked product stock uses production');
select is(private.inventory_balance('a1000000-0000-4000-8000-000000000001','supply','a3000000-0000-4000-8000-000000000001'),70::numeric,'raising finished stock consumes the recipe exactly once');
select is(private.inventory_balance('a1000000-0000-4000-8000-000000000001','product','a5000000-0000-4000-8000-000000000001'),20::numeric,'atomic target reaches the requested finished-product stock');
select lives_ok($sql$
  select public.set_product_stock_v2('a1000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000002','a5000000-0000-4000-8000-000000000001',20,0,'2026-09-16 13:00:00+00',null)
$sql$,'retrying the same target request is idempotent');
select is(private.inventory_balance('a1000000-0000-4000-8000-000000000001','supply','a3000000-0000-4000-8000-000000000001'),70::numeric,'idempotent retry does not consume ingredients twice');
select is((public.set_product_stock_v2('a1000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000003','a5000000-0000-4000-8000-000000000001',15,0,'2026-09-16 14:00:00+00','Ajuste de conferência')->>'action'),'adjustment','reducing finished stock remains an explicit adjustment');
select is(private.inventory_balance('a1000000-0000-4000-8000-000000000001','product','a5000000-0000-4000-8000-000000000001'),15::numeric,'downward target reaches the requested product balance');
select is(private.inventory_balance('a1000000-0000-4000-8000-000000000001','supply','a3000000-0000-4000-8000-000000000001'),70::numeric,'reducing finished stock does not alter ingredient stock');

select * from finish();
rollback;

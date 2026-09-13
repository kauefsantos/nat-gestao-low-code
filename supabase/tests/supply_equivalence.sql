-- Purchase history + equivalent/current ingredient regression tests.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into public.businesses(id,name) values ('f1000000-0000-4000-8000-000000000001','Supply equivalence test');
insert into private.allowed_auth_emails(email,business_id,role) values ('supply-equivalence@example.invalid','f1000000-0000-4000-8000-000000000001','admin');
insert into auth.users(id,email,aud,role,created_at,updated_at) values ('f2000000-0000-4000-8000-000000000001','supply-equivalence@example.invalid','authenticated','authenticated',now(),now());
insert into public.business_members(business_id,user_id,role) values ('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','admin');
insert into public.business_settings(business_id,owner_name) values ('f1000000-0000-4000-8000-000000000001','Supply test');

insert into public.supplies(id,business_id,name,category,active)
values ('f3000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','Chocolate Marca A','ingredient',true);
insert into public.inventory_tracking(business_id,supply_id,base_unit,minimum_quantity)
values ('f1000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000001','g',10);
insert into public.supply_purchases(id,business_id,supply_id,package_quantity,package_unit,package_price,purchased_at,funding_source)
values ('f4000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000001',200,'g',20,current_date,'business');
insert into public.products(id,business_id,name,batch_yield,selling_price,loss_percent,labor_cost_per_batch,production_cost_per_batch,minimum_margin_percent,target_margin_percent,active,available)
values ('f5000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','Brigadeiro equivalência',10,5,0,0,0,20,30,true,true);
insert into public.recipe_items(id,business_id,product_id,supply_id,quantity,unit)
values ('f6000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000001',40,'g');

set local role authenticated;
select set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"f2000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);

select lives_ok($sql$
  select public.apply_nat_transition_v4(
    'f1000000-0000-4000-8000-000000000001',
    'f7000000-0000-4000-8000-000000000001',
    '[{"type":"save_supply","expectedUpdatedAt":null,"payload":{"id":"f3000000-0000-4000-8000-000000000002","name":"Chocolate Marca B","category":"ingredient","packageQuantity":100,"packageUnit":"g","packagePrice":30,"purchasedAt":"2026-09-13","fundingSource":"business","equivalentToSupplyId":"f3000000-0000-4000-8000-000000000001","appendPurchase":true}}]'::jsonb
  )
$sql$,'a new equivalent ingredient can be saved through the protected transition');

select is((select count(*)::integer from public.supplies where business_id='f1000000-0000-4000-8000-000000000001' and name='Chocolate Marca B'),1,'new brand has one supply identity');
select is((select count(*)::integer from public.supply_purchases where business_id='f1000000-0000-4000-8000-000000000001' and supply_id='f3000000-0000-4000-8000-000000000002'),1,'new brand keeps its own purchase history');
select is((select coalesce(sum(quantity_delta),0)::numeric from public.inventory_movements where business_id='f1000000-0000-4000-8000-000000000001' and supply_id='f3000000-0000-4000-8000-000000000002'),100::numeric,'equivalent brand inherits tracking before its purchase enters stock');
select is((select supply_id from public.recipe_items where id='f6000000-0000-4000-8000-000000000001'),'f3000000-0000-4000-8000-000000000002'::uuid,'active recipe switches to the current equivalent ingredient');
select ok((select is_current from private.supply_equivalence_members where business_id='f1000000-0000-4000-8000-000000000001' and supply_id='f3000000-0000-4000-8000-000000000002'),'current brand is persisted in the equivalence group');
select is((select minimum_quantity::numeric from public.inventory_tracking where business_id='f1000000-0000-4000-8000-000000000001' and supply_id='f3000000-0000-4000-8000-000000000002'),10::numeric,'equivalent brand inherits the stock minimum');

select lives_ok(
  format(
    'select public.apply_nat_transition_v4(%L::uuid,%L::uuid,%L::jsonb)',
    'f1000000-0000-4000-8000-000000000001',
    'f7000000-0000-4000-8000-000000000002',
    jsonb_build_array(jsonb_build_object(
      'type','save_supply',
      'expectedUpdatedAt',(select updated_at::text from public.supplies where id='f3000000-0000-4000-8000-000000000002'),
      'payload',jsonb_build_object(
        'id','f3000000-0000-4000-8000-000000000002','name','Chocolate Marca B','category','ingredient',
        'packageQuantity',50,'packageUnit','g','packagePrice',15,'purchasedAt','2026-09-14','fundingSource','business',
        'equivalentToSupplyId',null,'appendPurchase',true
      )
    ))::text
  ),
  'a repeat purchase reuses the same supply identity with the current version'
);
select is((select count(*)::integer from public.supplies where business_id='f1000000-0000-4000-8000-000000000001' and name='Chocolate Marca B'),1,'repeat purchase does not duplicate the supply');
select is((select count(*)::integer from public.supply_purchases where business_id='f1000000-0000-4000-8000-000000000001' and supply_id='f3000000-0000-4000-8000-000000000002'),2,'repeat purchase appends purchase history');
select is((select coalesce(sum(quantity_delta),0)::numeric from public.inventory_movements where business_id='f1000000-0000-4000-8000-000000000001' and supply_id='f3000000-0000-4000-8000-000000000002'),150::numeric,'repeat purchase adds stock to the same ingredient');

select lives_ok(
  format(
    'select public.apply_nat_transition_v4(%L::uuid,%L::uuid,%L::jsonb)',
    'f1000000-0000-4000-8000-000000000001',
    'f7000000-0000-4000-8000-000000000005',
    jsonb_build_array(jsonb_build_object(
      'type','save_supply',
      'expectedUpdatedAt',(select updated_at::text from public.supplies where id='f3000000-0000-4000-8000-000000000002'),
      'payload',jsonb_build_object(
        'id','f3000000-0000-4000-8000-000000000002','name','Chocolate Marca B','category','ingredient',
        'packageQuantity',50,'packageUnit','g','packagePrice',15,'purchasedAt','2026-09-14','fundingSource','business',
        'equivalentToSupplyId',null,'appendPurchase',true
      )
    ))::text
  ),
  'an identical legitimate purchase on the same day is still preserved'
);
select is((select count(*)::integer from public.supply_purchases where business_id='f1000000-0000-4000-8000-000000000001' and supply_id='f3000000-0000-4000-8000-000000000002'),3,'identical repeat purchase creates another history row');
select is((select coalesce(sum(quantity_delta),0)::numeric from public.inventory_movements where business_id='f1000000-0000-4000-8000-000000000001' and supply_id='f3000000-0000-4000-8000-000000000002'),200::numeric,'identical repeat purchase also adds stock');

select throws_ok($sql$
  select public.apply_nat_transition_v4(
    'f1000000-0000-4000-8000-000000000001',
    'f7000000-0000-4000-8000-000000000003',
    '[{"type":"save_supply","expectedUpdatedAt":null,"payload":{"id":"f3000000-0000-4000-8000-000000000003","name":"  chocolate   marca b ","category":"ingredient","packageQuantity":10,"packageUnit":"g","packagePrice":4,"purchasedAt":"2026-09-15","fundingSource":"business","equivalentToSupplyId":null,"appendPurchase":true}}]'::jsonb
  )
$sql$,'22023','Esse insumo já existe. Registre a nova compra no cadastro existente para preservar o histórico.','backend rejects a duplicate normalized supply name');

select lives_ok(
  format(
    'select public.apply_nat_transition_v4(%L::uuid,%L::uuid,%L::jsonb)',
    'f1000000-0000-4000-8000-000000000001',
    'f7000000-0000-4000-8000-000000000004',
    jsonb_build_array(jsonb_build_object(
      'type','save_supply',
      'expectedUpdatedAt',(select updated_at::text from public.supplies where id='f3000000-0000-4000-8000-000000000001'),
      'payload',jsonb_build_object(
        'id','f3000000-0000-4000-8000-000000000001','name','Chocolate Marca A','category','ingredient',
        'packageQuantity',50,'packageUnit','g','packagePrice',6,'purchasedAt','2026-09-16','fundingSource','business',
        'equivalentToSupplyId','f3000000-0000-4000-8000-000000000002','appendPurchase',true
      )
    ))::text
  ),
  'an earlier brand can become current again without losing either history'
);
select is((select supply_id from public.recipe_items where id='f6000000-0000-4000-8000-000000000001'),'f3000000-0000-4000-8000-000000000001'::uuid,'recipe can switch back to another member of the same equivalence group');
select ok((select is_current from private.supply_equivalence_members where business_id='f1000000-0000-4000-8000-000000000001' and supply_id='f3000000-0000-4000-8000-000000000001'),'the switched-back ingredient becomes current in the persisted group');

select * from finish();
rollback;

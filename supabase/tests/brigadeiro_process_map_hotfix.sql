-- Regression for quartet packaging: one quartet must consume one bag.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into public.businesses(id,name)
values('b9000000-0000-4000-8000-000000000001','Quartet bag hotfix');

insert into public.supplies(id,business_id,name,category,active)
values('b9100000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001','Sacola','packaging',true);

insert into public.supply_purchases(
  business_id,supply_id,package_quantity,package_unit,package_price,purchased_at
) values(
  'b9000000-0000-4000-8000-000000000001',
  'b9100000-0000-4000-8000-000000000001',
  100,'unit',10,current_date
);

insert into public.inventory_tracking(business_id,supply_id,base_unit,minimum_quantity)
values(
  'b9000000-0000-4000-8000-000000000001',
  'b9100000-0000-4000-8000-000000000001',
  'unit',0
);

insert into public.inventory_movements(
  business_id,supply_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at
) values(
  'b9000000-0000-4000-8000-000000000001',
  'b9100000-0000-4000-8000-000000000001',
  100,'unit','opening','quartet-hotfix:opening','Opening bag stock',now()
);

insert into private.brigadeiro_packaging_profile(
  business_id,packaging_format,supply_id,quantity_per_package,package_capacity
) values(
  'b9000000-0000-4000-8000-000000000001',
  'quartet',
  'b9100000-0000-4000-8000-000000000001',
  1,4
);

select is(
  (select quantity_per_package::numeric
   from private.brigadeiro_packaging_profile
   where business_id='b9000000-0000-4000-8000-000000000001'
     and packaging_format='quartet'
     and supply_id='b9100000-0000-4000-8000-000000000001'),
  1::numeric,
  'quartet profile consumes one bag per package'
);

select is(
  private.brigadeiro_packaging_cost(
    'b9000000-0000-4000-8000-000000000001',
    'quartet',4,current_date
  ),
  0.10::numeric,
  'quartet quote includes one bag cost'
);

select lives_ok(
  $$select private.consume_brigadeiro_packaging(
    'b9000000-0000-4000-8000-000000000001',
    'b9200000-0000-4000-8000-000000000001',
    'quartet',4,now()
  )$$,
  'quartet packaging consumption succeeds'
);

select is(
  (select coalesce(sum(quantity_delta),0)::numeric
   from public.inventory_movements
   where business_id='b9000000-0000-4000-8000-000000000001'
     and supply_id='b9100000-0000-4000-8000-000000000001'),
  99::numeric,
  'one quartet consumes exactly one bag'
);

select lives_ok(
  $$select private.consume_brigadeiro_packaging(
    'b9000000-0000-4000-8000-000000000001',
    'b9200000-0000-4000-8000-000000000002',
    'quartet',8,now()
  )$$,
  'two quartet packages consume two bags without conflict'
);

select * from finish();
rollback;

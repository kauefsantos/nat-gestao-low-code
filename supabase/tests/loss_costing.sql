begin;
create extension if not exists pgtap with schema extensions;
select plan(1);

insert into public.businesses(id,name)
values('cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd','Loss costing test');

insert into public.business_settings(
  business_id,owner_name,monthly_fixed_costs,payment_fee_percent,
  default_minimum_margin_percent,default_target_margin_percent
)
values('cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd','Loss test',0,0,10,15);

insert into public.supplies(id,business_id,name,category,active)
values
('cdcdcdcd-0000-4000-8000-000000000001','cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd','Ingrediente','ingredient',true),
('cdcdcdcd-0000-4000-8000-000000000002','cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd','Embalagem','packaging',true);

insert into public.supply_purchases(
  business_id,supply_id,package_quantity,package_unit,package_price,purchased_at
)
values
('cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd','cdcdcdcd-0000-4000-8000-000000000001',100,'g',100,current_date),
('cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd','cdcdcdcd-0000-4000-8000-000000000002',10,'unit',10,current_date);

insert into public.products(
  id,business_id,name,batch_yield,selling_price,loss_percent,
  production_cost_per_batch,minimum_margin_percent,target_margin_percent,active,available
)
values(
  'cdcdcdcd-0000-4000-8000-000000000003','cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd',
  'Produto teste',1,20,10,5,10,15,true,true
);

insert into public.recipe_items(
  id,business_id,product_id,supply_id,quantity,unit
)
values
('cdcdcdcd-0000-4000-8000-000000000004','cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd','cdcdcdcd-0000-4000-8000-000000000003','cdcdcdcd-0000-4000-8000-000000000001',10,'g'),
('cdcdcdcd-0000-4000-8000-000000000005','cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd','cdcdcdcd-0000-4000-8000-000000000003','cdcdcdcd-0000-4000-8000-000000000002',1,'unit');

-- Ingredientes = 10; perda de 10% = 1; embalagem = 1; produção/mão de obra = 5.
-- Total correto = 17. O cálculo antigo retornaria 17,60 por aplicar a perda sobre tudo.
select is(
  round(private.product_unit_cost_at_date(
    'cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd',
    'cdcdcdcd-0000-4000-8000-000000000003',
    current_date
  ),2),
  17.00::numeric,
  'perda percentual incide somente sobre ingredientes'
);

select * from finish();
rollback;

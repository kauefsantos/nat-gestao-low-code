begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select ok(
  exists(select 1 from pg_constraint where conrelid='public.inventory_sale_cost_allocations'::regclass and conname='inventory_sale_cost_allocations_cost_layer_business_fk' and pg_get_constraintdef(oid) like 'FOREIGN KEY (business_id, cost_layer_id)%'),
  'cost allocation uses business-scoped cost-layer FK'
);

select ok(
  exists(select 1 from pg_constraint where conrelid='public.recipe_import_batches'::regclass and conname='recipe_import_batches_product_business_fk' and pg_get_constraintdef(oid) like 'FOREIGN KEY (business_id, product_id)%'),
  'recipe import lineage uses business-scoped product FK'
);

select ok(
  exists(select 1 from pg_constraint where conrelid='public.recipe_items'::regclass and conname='recipe_items_business_product_supply_key' and contype='u'),
  'recipe item supply is unique per business and product'
);

select ok(
  exists(select 1 from pg_trigger where tgrelid='public.recipe_items'::regclass and tgname='recipe_items_prevent_duplicate_supply' and not tgisinternal),
  'duplicate recipe supply has a domain-friendly trigger'
);

select ok(
  exists(select 1 from pg_constraint where conrelid='public.notification_delivery_log'::regclass and conname='notification_delivery_log_subscription_business_user_fk' and pg_get_constraintdef(oid) like 'FOREIGN KEY (business_id, user_id, subscription_id)%'),
  'notification log is bound to subscription business and user'
);

select ok(
  to_regclass('public.recipe_import_batches_dedup_idx') is null,
  'misleading recipe import dedup index is removed'
);

select ok(
  exists(select 1 from pg_index i join pg_class c on c.oid=i.indexrelid where c.relname='recipe_import_batches_lineage_idx' and not i.indisunique),
  'recipe import lineage index is non-unique so intentional reimports remain possible'
);

select ok(
  to_regclass('public.customers_business_phone_normalized_uidx') is not null,
  'normalized customer phone unique index exists'
);

select ok(
  to_regclass('public.customers_business_instagram_normalized_uidx') is not null,
  'normalized customer Instagram unique index exists'
);

select ok(
  exists(select 1 from pg_trigger where tgrelid='public.customers'::regclass and tgname='customers_prevent_duplicate_contact' and not tgisinternal),
  'customer duplicate contact trigger exists'
);

select ok(
  position('business_id=p_business_id' in replace(pg_get_functiondef('private.restore_inventory_cost_layers(uuid,uuid)'::regprocedure),' ','')) > 0,
  'cost-layer restore filters by business id'
);

select ok(
  exists(select 1 from pg_trigger where tgrelid='public.products'::regclass and tgname='products_detach_recipe_import_lineage' and not tgisinternal),
  'product deletion preserves recipe import lineage by detaching product id'
);

select * from finish();
rollback;

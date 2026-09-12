begin;

-- Six-point database integrity hardening.
-- Fail closed if production already contains conflicting data. No valid rows are deleted.

do $$
begin
  if exists (
    select 1
    from public.inventory_sale_cost_allocations a
    join public.inventory_product_cost_layers l on l.id=a.cost_layer_id
    where l.business_id<>a.business_id
  ) then
    raise exception 'Integrity preflight failed: cross-business inventory cost allocation exists.';
  end if;

  if exists (
    select 1
    from public.recipe_import_batches r
    join public.products p on p.id=r.product_id
    where r.product_id is not null and p.business_id<>r.business_id
  ) then
    raise exception 'Integrity preflight failed: cross-business recipe import lineage exists.';
  end if;

  if exists (
    select 1 from public.recipe_items
    group by business_id,product_id,supply_id
    having count(*)>1
  ) then
    raise exception 'Integrity preflight failed: duplicated supply in recipe exists.';
  end if;

  if exists (
    select 1
    from public.notification_delivery_log n
    join public.push_subscriptions s on s.id=n.subscription_id
    where s.business_id<>n.business_id or s.user_id<>n.user_id
  ) then
    raise exception 'Integrity preflight failed: notification/subscription ownership mismatch exists.';
  end if;

  if exists (
    select 1 from public.customers
    where phone is not null and regexp_replace(phone,'\D','','g')<>''
    group by business_id,regexp_replace(phone,'\D','','g')
    having count(*)>1
  ) then
    raise exception 'Integrity preflight failed: duplicated normalized customer phone exists.';
  end if;

  if exists (
    select 1 from public.customers
    where instagram is not null and regexp_replace(lower(btrim(instagram)),'^@','','')<>''
    group by business_id,regexp_replace(lower(btrim(instagram)),'^@','','')
    having count(*)>1
  ) then
    raise exception 'Integrity preflight failed: duplicated normalized customer Instagram exists.';
  end if;
end $$;

-- 1) Cost allocations must reference a cost layer owned by the same business.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.inventory_product_cost_layers'::regclass
      and conname='inventory_product_cost_layers_business_id_id_key'
  ) then
    alter table public.inventory_product_cost_layers
      add constraint inventory_product_cost_layers_business_id_id_key unique (business_id,id);
  end if;
end $$;

alter table public.inventory_sale_cost_allocations
  drop constraint if exists inventory_sale_cost_allocations_cost_layer_id_fkey;
alter table public.inventory_sale_cost_allocations
  drop constraint if exists inventory_sale_cost_allocations_cost_layer_business_fk;
alter table public.inventory_sale_cost_allocations
  add constraint inventory_sale_cost_allocations_cost_layer_business_fk
  foreign key (business_id,cost_layer_id)
  references public.inventory_product_cost_layers(business_id,id)
  on delete restrict;

create or replace function private.restore_inventory_cost_layers(p_business_id uuid,p_sale_item_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_alloc record;
begin
  for v_alloc in
    select * from public.inventory_sale_cost_allocations
    where business_id=p_business_id and sale_item_id=p_sale_item_id
  loop
    update public.inventory_product_cost_layers
    set units_remaining=least(units_original,units_remaining+v_alloc.quantity)
    where business_id=p_business_id and id=v_alloc.cost_layer_id;
  end loop;
end;
$$;
revoke all on function private.restore_inventory_cost_layers(uuid,uuid) from public,anon,authenticated;

-- 2) Recipe import lineage must keep product and business ownership aligned.
create or replace function private.detach_recipe_import_lineage_before_product_delete()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  update public.recipe_import_batches
  set product_id=null
  where business_id=old.business_id and product_id=old.id;
  return old;
end;
$$;
revoke all on function private.detach_recipe_import_lineage_before_product_delete() from public,anon,authenticated;

drop trigger if exists products_detach_recipe_import_lineage on public.products;
create trigger products_detach_recipe_import_lineage
before delete on public.products
for each row execute function private.detach_recipe_import_lineage_before_product_delete();

alter table public.recipe_import_batches
  drop constraint if exists recipe_import_batches_product_id_fkey;
alter table public.recipe_import_batches
  drop constraint if exists recipe_import_batches_product_business_fk;
alter table public.recipe_import_batches
  add constraint recipe_import_batches_product_business_fk
  foreign key (business_id,product_id)
  references public.products(business_id,id)
  on delete no action;

-- 3) A supply may appear only once in the same recipe.
create or replace function private.prevent_duplicate_recipe_supply()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if exists (
    select 1 from public.recipe_items r
    where r.business_id=new.business_id
      and r.product_id=new.product_id
      and r.supply_id=new.supply_id
      and r.id<>new.id
  ) then
    raise exception 'O mesmo insumo não pode aparecer duas vezes na receita.' using errcode='23505';
  end if;
  return new;
end;
$$;

drop trigger if exists recipe_items_prevent_duplicate_supply on public.recipe_items;
create trigger recipe_items_prevent_duplicate_supply
before insert or update of business_id,product_id,supply_id on public.recipe_items
for each row execute function private.prevent_duplicate_recipe_supply();

alter table public.recipe_items
  drop constraint if exists recipe_items_business_product_supply_key;
alter table public.recipe_items
  add constraint recipe_items_business_product_supply_key unique (business_id,product_id,supply_id);

-- 4) Notification log ownership must match its subscription.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.push_subscriptions'::regclass
      and conname='push_subscriptions_business_user_id_key'
  ) then
    alter table public.push_subscriptions
      add constraint push_subscriptions_business_user_id_key unique (business_id,user_id,id);
  end if;
end $$;

alter table public.notification_delivery_log
  drop constraint if exists notification_delivery_log_subscription_id_fkey;
alter table public.notification_delivery_log
  drop constraint if exists notification_delivery_log_subscription_business_user_fk;
alter table public.notification_delivery_log
  add constraint notification_delivery_log_subscription_business_user_fk
  foreign key (business_id,user_id,subscription_id)
  references public.push_subscriptions(business_id,user_id,id)
  on delete cascade;

-- 5) This is a lineage lookup index, not a uniqueness contract.
drop index if exists public.recipe_import_batches_dedup_idx;
create index if not exists recipe_import_batches_lineage_idx
  on public.recipe_import_batches(business_id,actor_user_id,product_id,file_sha256,imported_at desc);

-- 6) Prevent probable duplicate customers by normalized phone/Instagram within a business.
create or replace function private.prevent_duplicate_customer_contact()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  v_phone text:=regexp_replace(coalesce(new.phone,''),'\D','','g');
  v_instagram text:=regexp_replace(lower(btrim(coalesce(new.instagram,''))),'^@','','');
begin
  if v_phone<>'' and exists (
    select 1 from public.customers c
    where c.business_id=new.business_id
      and c.id<>new.id
      and regexp_replace(coalesce(c.phone,''),'\D','','g')=v_phone
  ) then
    raise exception 'Já existe um cliente com este telefone neste negócio.' using errcode='23505';
  end if;

  if v_instagram<>'' and exists (
    select 1 from public.customers c
    where c.business_id=new.business_id
      and c.id<>new.id
      and regexp_replace(lower(btrim(coalesce(c.instagram,''))),'^@','','')=v_instagram
  ) then
    raise exception 'Já existe um cliente com este Instagram neste negócio.' using errcode='23505';
  end if;

  return new;
end;
$$;

drop trigger if exists customers_prevent_duplicate_contact on public.customers;
create trigger customers_prevent_duplicate_contact
before insert or update of business_id,phone,instagram on public.customers
for each row execute function private.prevent_duplicate_customer_contact();

create unique index if not exists customers_business_phone_normalized_uidx
  on public.customers (business_id,(regexp_replace(phone,'\D','','g')))
  where phone is not null and regexp_replace(phone,'\D','','g')<>'';

create unique index if not exists customers_business_instagram_normalized_uidx
  on public.customers (business_id,(regexp_replace(lower(btrim(instagram)),'^@','','')))
  where instagram is not null and regexp_replace(lower(btrim(instagram)),'^@','','')<>'';

commit;

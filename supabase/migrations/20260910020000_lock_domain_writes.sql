-- Centralize domain writes in reviewed RPCs so direct PostgREST calls cannot bypass invariants.
begin;

create or replace function public.save_supply(
  p_business_id uuid,
  p_id uuid,
  p_name text,
  p_category text,
  p_package_quantity numeric,
  p_package_unit text,
  p_package_price numeric,
  p_purchased_at date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_latest record;
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_id is null or char_length(btrim(coalesce(p_name,''))) not between 1 and 160
     or p_category not in ('ingredient','packaging')
     or p_package_quantity is null or p_package_quantity <= 0
     or p_package_unit not in ('g','kg','ml','l','unit')
     or p_package_price is null or p_package_price < 0
     or p_purchased_at is null then
    raise exception 'Dados da compra inválidos.' using errcode = '22023';
  end if;

  insert into public.supplies(id,business_id,name,category,active)
  values (p_id,p_business_id,btrim(p_name),p_category,true)
  on conflict (id) do update set
    name = excluded.name,
    category = excluded.category,
    active = true
  where public.supplies.business_id = p_business_id;

  if not exists (
    select 1 from public.supplies s
    where s.id = p_id and s.business_id = p_business_id
  ) then
    raise exception 'O identificador do item pertence a outra empresa.' using errcode = '42501';
  end if;

  select sp.package_quantity,sp.package_unit,sp.package_price,sp.purchased_at
    into v_latest
  from public.supply_purchases sp
  where sp.business_id = p_business_id and sp.supply_id = p_id
  order by sp.purchased_at desc,sp.created_at desc
  limit 1;

  if v_latest is null
     or v_latest.package_quantity is distinct from p_package_quantity
     or v_latest.package_unit is distinct from p_package_unit
     or v_latest.package_price is distinct from p_package_price
     or v_latest.purchased_at is distinct from p_purchased_at then
    insert into public.supply_purchases(
      business_id,supply_id,package_quantity,package_unit,package_price,purchased_at
    ) values (
      p_business_id,p_id,p_package_quantity,p_package_unit,p_package_price,p_purchased_at
    );
  end if;
end;
$$;

create or replace function public.delete_supply(p_business_id uuid,p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.recipe_items ri
    join public.products p on p.business_id = ri.business_id and p.id = ri.product_id
    where ri.business_id = p_business_id and ri.supply_id = p_id and p.active = true
  ) then
    raise exception 'Este item está em uma receita ativa e não pode ser arquivado.' using errcode = '23503';
  end if;
  update public.supplies set active = false
  where business_id = p_business_id and id = p_id;
end;
$$;

create or replace function public.save_product(
  p_business_id uuid,
  p_id uuid,
  p_name text,
  p_batch_yield numeric,
  p_selling_price numeric,
  p_loss_percent numeric,
  p_production_cost_per_batch numeric,
  p_minimum_margin_percent numeric,
  p_target_margin_percent numeric,
  p_recipe jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  v_supply_id uuid;
  v_quantity numeric;
  v_unit text;
  v_package_unit text;
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_id is null or char_length(btrim(coalesce(p_name,''))) not between 1 and 160
     or p_batch_yield is null or p_batch_yield <= 0
     or p_selling_price is null or p_selling_price < 0
     or p_loss_percent is null or p_loss_percent < 0 or p_loss_percent > 100
     or p_production_cost_per_batch is null or p_production_cost_per_batch < 0
     or p_minimum_margin_percent is null or p_minimum_margin_percent < 0 or p_minimum_margin_percent >= 95
     or p_target_margin_percent is null or p_target_margin_percent < 0 or p_target_margin_percent >= 95 then
    raise exception 'Dados do produto inválidos.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_recipe,'[]'::jsonb)) <> 'array' then
    raise exception 'Receita inválida.' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(coalesce(p_recipe,'[]'::jsonb)) loop
    v_supply_id := nullif(item ->> 'supplyId','')::uuid;
    v_quantity := nullif(item ->> 'quantity','')::numeric;
    v_unit := item ->> 'unit';
    if v_supply_id is null or v_quantity is null or v_quantity <= 0 then
      raise exception 'Todo item da receita precisa de ingrediente e quantidade maior que zero.' using errcode = '22023';
    end if;
    select sp.package_unit into v_package_unit
    from public.supply_purchases sp
    where sp.business_id = p_business_id and sp.supply_id = v_supply_id
    order by sp.purchased_at desc,sp.created_at desc
    limit 1;
    if v_package_unit is null then
      raise exception 'Ingrediente sem compra válida cadastrada.' using errcode = '22023';
    end if;
    if private.unit_dimension(v_unit) is null
       or private.unit_dimension(v_unit) <> private.unit_dimension(v_package_unit) then
      raise exception 'Unidade incompatível com a unidade de compra do ingrediente.' using errcode = '22023';
    end if;
  end loop;

  insert into public.products(
    id,business_id,name,batch_yield,selling_price,loss_percent,
    production_cost_per_batch,minimum_margin_percent,target_margin_percent,active
  ) values (
    p_id,p_business_id,btrim(p_name),p_batch_yield,p_selling_price,p_loss_percent,
    p_production_cost_per_batch,p_minimum_margin_percent,p_target_margin_percent,true
  )
  on conflict (id) do update set
    name = excluded.name,
    batch_yield = excluded.batch_yield,
    selling_price = excluded.selling_price,
    loss_percent = excluded.loss_percent,
    production_cost_per_batch = excluded.production_cost_per_batch,
    minimum_margin_percent = excluded.minimum_margin_percent,
    target_margin_percent = excluded.target_margin_percent,
    active = true
  where public.products.business_id = p_business_id;

  if not exists (
    select 1 from public.products p
    where p.id = p_id and p.business_id = p_business_id
  ) then
    raise exception 'O identificador do produto pertence a outra empresa.' using errcode = '42501';
  end if;

  delete from public.recipe_items
  where business_id = p_business_id and product_id = p_id;
  insert into public.recipe_items(id,business_id,product_id,supply_id,quantity,unit)
  select
    coalesce(nullif(x ->> 'id','')::uuid,gen_random_uuid()),
    p_business_id,p_id,(x ->> 'supplyId')::uuid,(x ->> 'quantity')::numeric,x ->> 'unit'
  from jsonb_array_elements(coalesce(p_recipe,'[]'::jsonb)) x;
end;
$$;

create or replace function public.archive_product(p_business_id uuid,p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  update public.products set active = false
  where business_id = p_business_id and id = p_id;
end;
$$;

revoke all on function public.save_supply(uuid,uuid,text,text,numeric,text,numeric,date) from public,anon;
revoke all on function public.delete_supply(uuid,uuid) from public,anon;
revoke all on function public.save_product(uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,jsonb) from public,anon;
revoke all on function public.archive_product(uuid,uuid) from public,anon;
grant execute on function public.save_supply(uuid,uuid,text,text,numeric,text,numeric,date) to authenticated;
grant execute on function public.delete_supply(uuid,uuid) to authenticated;
grant execute on function public.save_product(uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,jsonb) to authenticated;
grant execute on function public.archive_product(uuid,uuid) to authenticated;

-- Keep read policies, but remove every direct mutation path for core costing data.
drop policy if exists supplies_insert on public.supplies;
drop policy if exists supplies_update on public.supplies;
drop policy if exists supplies_delete on public.supplies;
drop policy if exists supply_purchases_insert on public.supply_purchases;
drop policy if exists products_insert on public.products;
drop policy if exists products_update on public.products;
drop policy if exists products_delete on public.products;
drop policy if exists recipe_items_insert on public.recipe_items;
drop policy if exists recipe_items_update on public.recipe_items;
drop policy if exists recipe_items_delete on public.recipe_items;

revoke insert,update,delete on public.supplies from authenticated;
revoke insert,update,delete on public.supply_purchases from authenticated;
revoke insert,update,delete on public.products from authenticated;
revoke insert,update,delete on public.recipe_items from authenticated;

commit;

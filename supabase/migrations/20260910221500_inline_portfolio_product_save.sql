-- Keep only the portfolio-aware product mutation without depending on a removed overload.
begin;

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
  p_recipe jsonb,
  p_portfolio_key text
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
  v_portfolio_key text := nullif(btrim(coalesce(p_portfolio_key,'')),'');
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
     or p_target_margin_percent is null or p_target_margin_percent < 0 or p_target_margin_percent >= 95
     or (v_portfolio_key is not null and char_length(v_portfolio_key) not between 1 and 80) then
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
    order by sp.purchased_at desc, sp.created_at desc
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
    production_cost_per_batch,minimum_margin_percent,target_margin_percent,portfolio_key,active
  ) values (
    p_id,p_business_id,btrim(p_name),p_batch_yield,p_selling_price,p_loss_percent,
    p_production_cost_per_batch,p_minimum_margin_percent,p_target_margin_percent,v_portfolio_key,true
  )
  on conflict (id) do update set
    name = excluded.name,
    batch_yield = excluded.batch_yield,
    selling_price = excluded.selling_price,
    loss_percent = excluded.loss_percent,
    production_cost_per_batch = excluded.production_cost_per_batch,
    minimum_margin_percent = excluded.minimum_margin_percent,
    target_margin_percent = excluded.target_margin_percent,
    portfolio_key = excluded.portfolio_key,
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

revoke all on function public.save_product(uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,jsonb,text) from public,anon;
grant execute on function public.save_product(uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,jsonb,text) to authenticated;

commit;

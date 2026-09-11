-- Corrige o custeio para que a perda percentual incida somente sobre ingredientes.
-- Embalagens e custo de produção/mão de obra não sofrem acréscimo de perda.
create or replace function private.product_unit_cost_at_date(
  p_business_id uuid,
  p_product_id uuid,
  p_sale_date date
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_product public.products%rowtype;
  v_item record;
  v_package record;
  v_ingredients numeric := 0;
  v_packaging numeric := 0;
  v_package_base numeric;
  v_usage_base numeric;
  v_item_cost numeric;
begin
  select *
  into v_product
  from public.products
  where business_id = p_business_id
    and id = p_product_id
    and active = true;

  if not found then
    raise exception 'Produto não encontrado ou inativo.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.recipe_items
    where business_id = p_business_id
      and product_id = p_product_id
  ) then
    raise exception 'Complete a receita antes de registrar uma venda.' using errcode = '22023';
  end if;

  for v_item in
    select ri.supply_id, ri.quantity, ri.unit, s.category
    from public.recipe_items ri
    join public.supplies s
      on s.business_id = ri.business_id
     and s.id = ri.supply_id
    where ri.business_id = p_business_id
      and ri.product_id = p_product_id
  loop
    select sp.package_quantity, sp.package_unit, sp.package_price
    into v_package
    from public.supply_purchases sp
    where sp.business_id = p_business_id
      and sp.supply_id = v_item.supply_id
      and sp.purchased_at <= p_sale_date
    order by sp.purchased_at desc, sp.created_at desc
    limit 1;

    if not found then
      raise exception 'Não há compra válida do ingrediente na data desta venda.' using errcode = '22023';
    end if;

    if private.unit_dimension(v_item.unit) is null
       or private.unit_dimension(v_item.unit) <> private.unit_dimension(v_package.package_unit) then
      raise exception 'A receita contém unidade incompatível.' using errcode = '22023';
    end if;

    v_package_base := private.unit_base_amount(v_package.package_quantity, v_package.package_unit);
    v_usage_base := private.unit_base_amount(v_item.quantity, v_item.unit);

    if v_package_base is null or v_package_base <= 0
       or v_usage_base is null or v_usage_base <= 0 then
      raise exception 'Quantidade inválida na receita.' using errcode = '22023';
    end if;

    v_item_cost := (v_package.package_price / v_package_base) * v_usage_base;

    if v_item.category = 'packaging' then
      v_packaging := v_packaging + v_item_cost;
    else
      v_ingredients := v_ingredients + v_item_cost;
    end if;
  end loop;

  return (
    (v_ingredients * (1 + v_product.loss_percent / 100))
    + v_packaging
    + v_product.production_cost_per_batch
  ) / v_product.batch_yield;
end;
$function$;

-- Backend P0: align archive RPCs with the reviewed write model and make sale costing historical.
begin;

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
    join public.products p
      on p.business_id = ri.business_id and p.id = ri.product_id
    where ri.business_id = p_business_id
      and ri.supply_id = p_id
      and p.active = true
  ) then
    raise exception 'Este item está em uma receita ativa e não pode ser arquivado.' using errcode = '23503';
  end if;

  update public.supplies
  set active = false
  where business_id = p_business_id and id = p_id;
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

  update public.products
  set active = false
  where business_id = p_business_id and id = p_id;
end;
$$;

create or replace function public.save_sale(
  p_business_id uuid,
  p_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_total_received numeric,
  p_payment_method text,
  p_sold_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_item record;
  v_package record;
  v_inputs numeric := 0;
  v_before_loss numeric;
  v_total_batch numeric;
  v_unit_cost numeric;
  v_fee_percent numeric := 0;
  v_variable_fee numeric;
  v_contribution numeric;
  v_package_base numeric;
  v_usage_base numeric;
  v_sale_date date;
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  if p_quantity is null or p_quantity <= 0
     or p_total_received is null or p_total_received < 0
     or p_payment_method not in ('pix','cash','card','other')
     or p_sold_at is null then
    raise exception 'Dados da venda inválidos.' using errcode = '22023';
  end if;

  -- Purchases are dated in the operating timezone of NAT. A backdated sale must
  -- only use costs that were already valid on that local calendar date.
  v_sale_date := (p_sold_at at time zone 'America/Sao_Paulo')::date;

  select * into v_product
  from public.products
  where business_id = p_business_id and id = p_product_id and active = true;

  if not found then
    raise exception 'Produto não encontrado ou inativo.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.recipe_items ri
    where ri.business_id = p_business_id and ri.product_id = p_product_id
  ) then
    raise exception 'Complete a receita antes de registrar uma venda.' using errcode = '22023';
  end if;

  for v_item in
    select ri.supply_id, ri.quantity, ri.unit
    from public.recipe_items ri
    where ri.business_id = p_business_id and ri.product_id = p_product_id
  loop
    select sp.package_quantity, sp.package_unit, sp.package_price
      into v_package
    from public.supply_purchases sp
    where sp.business_id = p_business_id
      and sp.supply_id = v_item.supply_id
      and sp.purchased_at <= v_sale_date
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

    if v_package_base is null or v_package_base <= 0 or v_usage_base is null or v_usage_base <= 0 then
      raise exception 'Quantidade inválida na receita.' using errcode = '22023';
    end if;

    v_inputs := v_inputs + (v_package.package_price / v_package_base) * v_usage_base;
  end loop;

  v_before_loss := v_inputs + v_product.production_cost_per_batch;
  v_total_batch := v_before_loss * (1 + v_product.loss_percent / 100);
  v_unit_cost := v_total_batch / v_product.batch_yield;

  select payment_fee_percent into v_fee_percent
  from public.business_settings
  where business_id = p_business_id;

  v_fee_percent := coalesce(v_fee_percent,0);
  v_variable_fee := p_total_received * v_fee_percent / 100;
  v_contribution := p_total_received - (v_unit_cost * p_quantity) - v_variable_fee;

  insert into public.sales(
    id,business_id,sold_at,total_received,payment_method,variable_fee_snapshot,contribution_snapshot
  ) values (
    p_id,p_business_id,p_sold_at,p_total_received,p_payment_method,v_variable_fee,v_contribution
  );

  insert into public.sale_items(
    business_id,sale_id,product_id,product_name_snapshot,portfolio_key_snapshot,
    quantity,unit_cost_snapshot,unit_price_snapshot
  ) values (
    p_business_id,p_id,p_product_id,v_product.name,v_product.portfolio_key,
    p_quantity,v_unit_cost,p_total_received / p_quantity
  );
end;
$$;

revoke all on function public.delete_supply(uuid,uuid) from public,anon;
revoke all on function public.archive_product(uuid,uuid) from public,anon;
revoke all on function public.save_sale(uuid,uuid,uuid,numeric,numeric,text,timestamptz) from public,anon;
grant execute on function public.delete_supply(uuid,uuid) to authenticated;
grant execute on function public.archive_product(uuid,uuid) to authenticated;
grant execute on function public.save_sale(uuid,uuid,uuid,numeric,numeric,text,timestamptz) to authenticated;

commit;

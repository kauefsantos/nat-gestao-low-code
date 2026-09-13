-- NAT Gestão — chocolate 50% Nestlé como insumo separado e ativo nas receitas.
-- Mantém o Chocolate em pó Garoto cadastrado para histórico e comparação de custo.
-- A migração é deliberadamente idempotente e só atua no negócio real da NAT quando ele existe.

do $$
declare
  v_business_id uuid := '4b8f4ef8-a9a4-41c1-b4e2-18443ae4c638';
  v_nestle_id uuid := 'b9ad51ed-d2b2-4db4-8fdc-61f353548e41';
  v_garoto_id uuid;
  v_purchase_date date := date '2026-09-13';
begin
  if not exists (select 1 from public.businesses where id = v_business_id) then
    return;
  end if;

  select id into v_garoto_id
  from public.supplies
  where business_id = v_business_id
    and name = 'Chocolate em pó Garoto'
  limit 1;

  insert into public.supplies (id, business_id, name, category, active)
  values (
    v_nestle_id,
    v_business_id,
    'Chocolate em Pó Solúvel 50% Cacau Nestlé Dois Frades',
    'ingredient',
    true
  )
  on conflict (id) do update
    set name = excluded.name,
        category = excluded.category,
        active = true,
        updated_at = now()
  where public.supplies.business_id = v_business_id;

  if not exists (
    select 1
    from public.supply_purchases sp
    where sp.business_id = v_business_id
      and sp.supply_id = v_nestle_id
      and sp.package_quantity = 200
      and sp.package_unit = 'g'
      and sp.package_price = 32.80
      and sp.purchased_at = v_purchase_date
      and sp.funding_source = 'business'
  ) then
    insert into public.supply_purchases (
      business_id,
      supply_id,
      package_quantity,
      package_unit,
      package_price,
      purchased_at,
      funding_source
    ) values (
      v_business_id,
      v_nestle_id,
      200,
      'g',
      32.80,
      v_purchase_date,
      'business'
    );
  end if;

  insert into public.inventory_tracking (
    business_id,
    supply_id,
    base_unit,
    minimum_quantity
  )
  select v_business_id, v_nestle_id, 'g', 0
  where not exists (
    select 1
    from public.inventory_tracking t
    where t.business_id = v_business_id
      and t.supply_id = v_nestle_id
  );

  if not exists (
    select 1
    from public.inventory_movements m
    where m.business_id = v_business_id
      and m.supply_id = v_nestle_id
      and m.source_key = 'purchase:nestle-dois-frades-200g:2026-09-13'
  ) then
    insert into public.inventory_movements (
      business_id,
      supply_id,
      quantity_delta,
      base_unit,
      movement_type,
      source_key,
      note,
      occurred_at
    ) values (
      v_business_id,
      v_nestle_id,
      200,
      'g',
      'purchase',
      'purchase:nestle-dois-frades-200g:2026-09-13',
      'Compra informada pelo usuário: 1 caixa de 200 g por R$ 32,80, paga com dinheiro da empresa.',
      timestamptz '2026-09-13 00:00:00-03'
    );
  end if;

  -- O estoque do Garoto permanece intacto (atualmente zero) e seu histórico de compra é preservado.
  -- As receitas que ainda apontavam para Garoto passam a usar o Nestlé enquanto ele é o insumo em estoque.
  if v_garoto_id is not null then
    update public.recipe_items
    set supply_id = v_nestle_id
    where business_id = v_business_id
      and supply_id = v_garoto_id;
  end if;
end
$$;

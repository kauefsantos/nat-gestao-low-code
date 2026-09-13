-- NAT Gestão — fluxo permanente de compras, equivalência de ingredientes e estoque coerente.
-- 1) Marcas/itens equivalentes continuam sendo supplies distintos para preservar histórico e custo.
-- 2) A escolha de um substituto fica registrada em grupo de equivalência e as receitas ativas passam ao item vigente.
-- 3) Recompras reutilizam o mesmo supply_id; nomes duplicados em IDs diferentes são rejeitados no backend.
-- 4) Se o item substituído já é controlado em estoque, o novo equivalente herda a unidade/mínimo antes da compra entrar.

create table if not exists private.supply_equivalence_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  group_id uuid not null,
  supply_id uuid not null references public.supplies(id) on delete cascade,
  is_current boolean not null default false,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (business_id, supply_id)
);

create index if not exists supply_equivalence_members_group_idx
  on private.supply_equivalence_members(business_id, group_id);
create unique index if not exists supply_equivalence_members_one_current_idx
  on private.supply_equivalence_members(business_id, group_id)
  where is_current;

revoke all on table private.supply_equivalence_members from public, anon, authenticated;

create or replace function private.activate_supply_equivalence(
  p_business_id uuid,
  p_previous_supply_id uuid,
  p_current_supply_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_category text;
  v_current_category text;
  v_previous_group uuid;
  v_current_group uuid;
  v_group uuid;
  v_previous_unit text;
  v_current_unit text;
begin
  if p_business_id is null or p_previous_supply_id is null or p_current_supply_id is null then
    raise exception 'Informe os dois ingredientes equivalentes.' using errcode='22023';
  end if;
  if p_previous_supply_id = p_current_supply_id then
    raise exception 'O ingrediente vigente precisa ser diferente do substituído.' using errcode='22023';
  end if;

  select category into v_previous_category
  from public.supplies
  where business_id=p_business_id and id=p_previous_supply_id and active=true;
  if not found then raise exception 'Ingrediente substituído não encontrado.' using errcode='22023'; end if;

  select category into v_current_category
  from public.supplies
  where business_id=p_business_id and id=p_current_supply_id and active=true;
  if not found then raise exception 'Ingrediente vigente não encontrado.' using errcode='22023'; end if;

  if v_previous_category <> 'ingredient' or v_current_category <> 'ingredient' then
    raise exception 'Somente ingredientes podem ser marcados como equivalentes.' using errcode='22023';
  end if;

  select package_unit into v_previous_unit
  from public.supply_purchases
  where business_id=p_business_id and supply_id=p_previous_supply_id
  order by purchased_at desc,created_at desc,id desc limit 1;

  select package_unit into v_current_unit
  from public.supply_purchases
  where business_id=p_business_id and supply_id=p_current_supply_id
  order by purchased_at desc,created_at desc,id desc limit 1;

  if v_previous_unit is not null and v_current_unit is not null
     and private.unit_dimension(v_previous_unit) <> private.unit_dimension(v_current_unit) then
    raise exception 'Os ingredientes equivalentes precisam usar unidades compatíveis.' using errcode='22023';
  end if;

  select group_id into v_previous_group
  from private.supply_equivalence_members
  where business_id=p_business_id and supply_id=p_previous_supply_id;

  select group_id into v_current_group
  from private.supply_equivalence_members
  where business_id=p_business_id and supply_id=p_current_supply_id;

  if v_previous_group is not null and v_current_group is not null and v_previous_group <> v_current_group then
    update private.supply_equivalence_members
    set is_current=false
    where business_id=p_business_id and group_id in (v_previous_group,v_current_group);
    update private.supply_equivalence_members
    set group_id=v_previous_group
    where business_id=p_business_id and group_id=v_current_group;
    v_group:=v_previous_group;
  else
    v_group:=coalesce(v_previous_group,v_current_group,gen_random_uuid());
  end if;

  insert into private.supply_equivalence_members(business_id,group_id,supply_id,is_current)
  values(p_business_id,v_group,p_previous_supply_id,false)
  on conflict (business_id,supply_id) do update set group_id=excluded.group_id;

  insert into private.supply_equivalence_members(business_id,group_id,supply_id,is_current,activated_at)
  values(p_business_id,v_group,p_current_supply_id,false,now())
  on conflict (business_id,supply_id) do update set group_id=excluded.group_id,activated_at=now();

  -- Uma receita não pode conter simultaneamente duas marcas do mesmo ingrediente equivalente,
  -- pois a substituição automática ficaria ambígua.
  if exists (
    select r.product_id
    from public.recipe_items r
    join public.products p on p.business_id=r.business_id and p.id=r.product_id and p.active=true
    where r.business_id=p_business_id
      and r.supply_id in (
        select m.supply_id from private.supply_equivalence_members m
        where m.business_id=p_business_id and m.group_id=v_group
      )
    group by r.product_id
    having count(*) > 1
  ) then
    raise exception 'Uma receita ativa já contém mais de um ingrediente deste grupo equivalente. Revise a receita antes de trocar a marca vigente.' using errcode='22023';
  end if;

  update private.supply_equivalence_members
  set is_current=false
  where business_id=p_business_id and group_id=v_group;

  update private.supply_equivalence_members
  set is_current=true,activated_at=now()
  where business_id=p_business_id and supply_id=p_current_supply_id;

  update public.recipe_items r
  set supply_id=p_current_supply_id
  from public.products p
  where p.business_id=r.business_id
    and p.id=r.product_id
    and p.active=true
    and r.business_id=p_business_id
    and r.supply_id<>p_current_supply_id
    and r.supply_id in (
      select m.supply_id from private.supply_equivalence_members m
      where m.business_id=p_business_id and m.group_id=v_group
    );

  return v_group;
end;
$$;

revoke all on function private.activate_supply_equivalence(uuid,uuid,uuid) from public, anon, authenticated;

create or replace function private.save_supply_v3(
  p_business_id uuid,
  p_id uuid,
  p_name text,
  p_category text,
  p_package_quantity numeric,
  p_package_unit text,
  p_package_price numeric,
  p_purchased_at date,
  p_funding_source text,
  p_equivalent_to_supply_id uuid default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_latest record;
  v_duplicate_id uuid;
  v_tracking public.inventory_tracking%rowtype;
  v_name_key text:=lower(regexp_replace(btrim(coalesce(p_name,'')),'\s+',' ','g'));
begin
  if p_id is null or char_length(btrim(coalesce(p_name,''))) not between 1 and 160
     or p_category not in ('ingredient','packaging','other') or p_package_quantity is null or p_package_quantity<=0
     or p_package_unit not in ('g','kg','ml','l','unit') or p_package_price is null or p_package_price<0
     or p_purchased_at is null or p_funding_source not in ('owner','business') then
    raise exception 'Dados da compra inválidos.' using errcode='22023';
  end if;

  select id into v_duplicate_id
  from public.supplies
  where business_id=p_business_id
    and id<>p_id
    and active=true
    and lower(regexp_replace(btrim(name),'\s+',' ','g'))=v_name_key
  limit 1;
  if v_duplicate_id is not null then
    raise exception 'Esse insumo já existe. Registre a nova compra no cadastro existente para preservar o histórico.' using errcode='22023';
  end if;

  if p_equivalent_to_supply_id=p_id then p_equivalent_to_supply_id:=null; end if;
  if p_equivalent_to_supply_id is not null and p_category<>'ingredient' then
    raise exception 'Somente ingredientes podem substituir outro ingrediente nas receitas.' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':supply-save:'||p_id::text,0));

  insert into public.supplies(id,business_id,name,category,active)
  values(p_id,p_business_id,btrim(p_name),p_category,true)
  on conflict(id) do update set name=excluded.name,category=excluded.category,active=true
  where public.supplies.business_id=p_business_id;

  if not exists(select 1 from public.supplies where id=p_id and business_id=p_business_id) then
    raise exception 'O identificador do item pertence a outra empresa.' using errcode='42501';
  end if;

  -- Se a marca nova substitui um ingrediente já controlado, começa a ser controlada antes da compra,
  -- garantindo que o gatilho da compra some o pacote ao estoque correto.
  if p_equivalent_to_supply_id is not null then
    select * into v_tracking
    from public.inventory_tracking
    where business_id=p_business_id and supply_id=p_equivalent_to_supply_id;
    if found and not exists(
      select 1 from public.inventory_tracking
      where business_id=p_business_id and supply_id=p_id
    ) then
      if private.unit_dimension(p_package_unit)<>private.unit_dimension(v_tracking.base_unit) then
        raise exception 'A unidade da nova marca é incompatível com o estoque do ingrediente substituído.' using errcode='22023';
      end if;
      insert into public.inventory_tracking(business_id,supply_id,base_unit,minimum_quantity)
      values(p_business_id,p_id,v_tracking.base_unit,v_tracking.minimum_quantity);
    end if;
  end if;

  select sp.package_quantity,sp.package_unit,sp.package_price,sp.purchased_at,sp.funding_source into v_latest
  from public.supply_purchases sp where sp.business_id=p_business_id and sp.supply_id=p_id
  order by sp.purchased_at desc,sp.created_at desc,sp.id desc limit 1;

  if v_latest is null or v_latest.package_quantity is distinct from p_package_quantity
     or v_latest.package_unit is distinct from p_package_unit or v_latest.package_price is distinct from p_package_price
     or v_latest.purchased_at is distinct from p_purchased_at or v_latest.funding_source is distinct from p_funding_source then
    insert into public.supply_purchases(business_id,supply_id,package_quantity,package_unit,package_price,purchased_at,funding_source)
    values(p_business_id,p_id,p_package_quantity,p_package_unit,p_package_price,p_purchased_at,p_funding_source);
  end if;

  if p_equivalent_to_supply_id is not null then
    perform private.activate_supply_equivalence(p_business_id,p_equivalent_to_supply_id,p_id);
  end if;
end;
$$;

revoke all on function private.save_supply_v3(uuid,uuid,text,text,numeric,text,numeric,date,text,uuid) from public, anon, authenticated;

-- A transição protegida passa a usar a versão que conhece equivalência de ingredientes.
create or replace function public.apply_nat_transition(p_business_id uuid, p_operations jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_operation jsonb;v_payload jsonb;v_type text;v_expected text;v_id uuid;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_operations is null or jsonb_typeof(p_operations)<>'array' then raise exception 'Operações inválidas.' using errcode='22023'; end if;
  if jsonb_array_length(p_operations)>500 then raise exception 'Muitas operações em uma única alteração.' using errcode='22023'; end if;
  for v_operation in select value from jsonb_array_elements(p_operations) loop
    v_type:=v_operation->>'type';v_payload:=coalesce(v_operation->'payload','{}'::jsonb);v_expected:=nullif(v_operation->>'expectedUpdatedAt','');
    if v_type='save_business_settings' then
      perform private.assert_nat_version('settings',p_business_id,null,v_expected);
      perform public.save_business_settings_v4(p_business_id,v_payload->>'ownerName',(v_payload->>'monthlyFixedCosts')::numeric,
        coalesce((v_payload->>'paymentFeePercent')::numeric,0),coalesce((v_payload->>'pixFeePercent')::numeric,0),
        coalesce((v_payload->>'cashFeePercent')::numeric,0),coalesce((v_payload->>'cardFeePercent')::numeric,0),
        (v_payload->>'defaultMinimumMarginPercent')::numeric,(v_payload->>'defaultTargetMarginPercent')::numeric,
        coalesce((v_payload->>'ownerHourlyRate')::numeric,20),coalesce((v_payload->>'ownerDailyHours')::numeric,3),
        coalesce(nullif(v_payload->>'fixedCostFundingSource',''),'owner'));continue;
    elsif v_type='save_customer' then
      perform public.save_customer(p_business_id,(v_payload->>'id')::uuid,v_payload->>'name',v_payload->>'phone',v_payload->>'instagram',v_payload->>'source',coalesce((v_payload->>'marketingConsent')::boolean,false),v_payload->>'notes',coalesce((v_payload->>'active')::boolean,true));continue;
    elsif v_type in ('create_sale','save_sale_items') then
      begin v_id:=(v_payload->>'id')::uuid;exception when others then raise exception 'Identificador inválido em %.',v_type using errcode='22023';end;
      perform private.assert_nat_version('sale',p_business_id,v_id,null);
      perform public.save_sale_items_v4(p_business_id,v_id,coalesce(v_payload->'items','[]'::jsonb),(v_payload->>'totalReceived')::numeric,v_payload->>'paymentMethod',(v_payload->>'soldAt')::timestamptz,nullif(v_payload->>'customerId','')::uuid,coalesce(nullif(v_payload->>'transactionType',''),'sale'),coalesce(nullif(v_payload->>'saleChannel',''),'other'),coalesce((v_payload->>'deliveryCost')::numeric,0),nullif(v_payload->>'discountReason',''),coalesce((v_payload->>'belowCostOverride')::boolean,false));continue;
    end if;
    begin v_id:=(v_payload->>'id')::uuid;exception when others then raise exception 'Identificador inválido em %.',coalesce(v_type,'operação') using errcode='22023';end;
    case v_type
      when 'cancel_sale' then perform private.assert_nat_version('sale',p_business_id,v_id,v_expected);perform public.cancel_sale(p_business_id,v_id,coalesce(nullif(v_payload->>'reason',''),'Cancelada pelo usuário'));
      when 'archive_product' then perform private.assert_nat_version('product',p_business_id,v_id,v_expected);perform public.archive_product(p_business_id,v_id);
      when 'delete_supply' then perform private.assert_nat_version('supply',p_business_id,v_id,v_expected);perform public.delete_supply(p_business_id,v_id);
      when 'delete_sporadic_expense' then perform private.assert_nat_version('expense',p_business_id,v_id,v_expected);perform public.delete_sporadic_expense(p_business_id,v_id);
      when 'delete_owner_cash_movement' then perform public.delete_owner_cash_movement(p_business_id,v_id);
      when 'save_owner_cash_movement' then perform public.save_owner_cash_movement(p_business_id,v_id,v_payload->>'movementType',(v_payload->>'amount')::numeric,(v_payload->>'occurredAt')::date,v_payload->>'note');
      when 'save_supply' then perform private.assert_nat_version('supply',p_business_id,v_id,v_expected);perform private.save_supply_v3(p_business_id,v_id,v_payload->>'name',v_payload->>'category',(v_payload->>'packageQuantity')::numeric,v_payload->>'packageUnit',(v_payload->>'packagePrice')::numeric,(v_payload->>'purchasedAt')::date,coalesce(nullif(v_payload->>'fundingSource',''),'owner'),nullif(v_payload->>'equivalentToSupplyId','')::uuid);
      when 'save_product' then perform private.assert_nat_version('product',p_business_id,v_id,v_expected);perform public.save_product_v2(p_business_id,v_id,v_payload->>'name',(v_payload->>'batchYield')::numeric,(v_payload->>'sellingPrice')::numeric,(v_payload->>'lossPercent')::numeric,coalesce((v_payload->>'laborCostPerBatch')::numeric,0),(v_payload->>'productionCostPerBatch')::numeric,(v_payload->>'minimumMarginPercent')::numeric,(v_payload->>'targetMarginPercent')::numeric,coalesce(v_payload->'recipe','[]'::jsonb),nullif(v_payload->>'portfolioKey',''));
      when 'save_sporadic_expense' then perform private.assert_nat_version('expense',p_business_id,v_id,v_expected);perform public.save_sporadic_expense_v2(p_business_id,v_id,v_payload->>'name',(v_payload->>'amount')::numeric,(v_payload->>'spentAt')::date,coalesce(nullif(v_payload->>'fundingSource',''),'owner'));
      else raise exception 'Operação não suportada: %.',coalesce(v_type,'(vazia)') using errcode='22023';
    end case;
  end loop;
end
$$;

-- Reconciliação do caso real já existente: Garoto continua cadastrado e controlado em zero;
-- Nestlé permanece a marca vigente nas receitas, com o vínculo persistido para futuras trocas.
do $$
declare
  v_business_id uuid := '4b8f4ef8-a9a4-41c1-b4e2-18443ae4c638';
  v_garoto_id uuid;
  v_nestle_id uuid;
begin
  if not exists(select 1 from public.businesses where id=v_business_id) then return; end if;
  select id into v_garoto_id from public.supplies where business_id=v_business_id and name='Chocolate em pó Garoto' limit 1;
  select id into v_nestle_id from public.supplies where business_id=v_business_id and name='Chocolate em Pó Solúvel 50% Cacau Nestlé Dois Frades' limit 1;
  if v_garoto_id is not null and not exists(
    select 1 from public.inventory_tracking where business_id=v_business_id and supply_id=v_garoto_id
  ) then
    insert into public.inventory_tracking(business_id,supply_id,base_unit,minimum_quantity)
    values(v_business_id,v_garoto_id,'g',0);
  end if;
  if v_garoto_id is not null and v_nestle_id is not null then
    perform private.activate_supply_equivalence(v_business_id,v_garoto_id,v_nestle_id);
  end if;
end
$$;

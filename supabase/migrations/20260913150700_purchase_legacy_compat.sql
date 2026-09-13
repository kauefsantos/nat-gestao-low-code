begin;

-- Rolling-client compatibility: before Stage 3, a brand-new supply did not send
-- purchaseMode. Keep that creation path working, while an existing supply without an
-- explicit intent remains metadata-only so an old edit cannot invent another purchase.
create or replace function private.save_supply_v5(
  p_business_id uuid,
  p_id uuid,
  p_name text,
  p_category text,
  p_package_quantity numeric,
  p_package_unit text,
  p_package_price numeric,
  p_purchased_at date,
  p_funding_source text,
  p_equivalent_to_supply_id uuid default null,
  p_purchase_mode text default 'append',
  p_purchase_id uuid default null
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_duplicate_id uuid;
  v_tracking public.inventory_tracking%rowtype;
  v_name_key text:=lower(regexp_replace(btrim(coalesce(p_name,'')),'\s+',' ','g'));
  v_latest_id uuid;
  v_latest_unit text;
  v_purchase public.supply_purchases%rowtype;
  v_purchase_movement public.inventory_movements%rowtype;
  v_old_base numeric;
  v_new_base numeric;
  v_request uuid;
  v_correction_key text;
begin
  if p_id is null or char_length(btrim(coalesce(p_name,''))) not between 1 and 160
     or p_category not in('ingredient','packaging','other')
     or p_package_quantity is null or p_package_quantity<=0
     or p_package_unit not in('g','kg','ml','l','unit')
     or p_package_price is null or p_package_price<0
     or p_purchased_at is null or p_funding_source not in('owner','business')
     or p_purchase_mode not in('append','correct','metadata') then
    raise exception 'Dados da compra inválidos.' using errcode='22023';
  end if;

  select id into v_duplicate_id
  from public.supplies
  where business_id=p_business_id and id<>p_id and active=true
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

  select sp.id,sp.package_unit into v_latest_id,v_latest_unit
  from public.supply_purchases sp
  where sp.business_id=p_business_id and sp.supply_id=p_id
  order by sp.purchased_at desc,sp.created_at desc,sp.id desc
  limit 1;

  if v_latest_unit is not null
     and private.unit_dimension(v_latest_unit)<>private.unit_dimension(p_package_unit) then
    raise exception 'A unidade desta compra é incompatível com o histórico do insumo. Cadastre outro item para mudar de dimensão.' using errcode='22023';
  end if;

  insert into public.supplies(id,business_id,name,category,active)
  values(p_id,p_business_id,btrim(p_name),p_category,true)
  on conflict(id) do update set name=excluded.name,category=excluded.category,active=true
  where public.supplies.business_id=p_business_id;

  if not exists(select 1 from public.supplies where id=p_id and business_id=p_business_id) then
    raise exception 'O identificador do item pertence a outra empresa.' using errcode='42501';
  end if;

  if p_equivalent_to_supply_id is not null then
    select * into v_tracking
    from public.inventory_tracking
    where business_id=p_business_id and supply_id=p_equivalent_to_supply_id;
    if found and not exists(
      select 1 from public.inventory_tracking where business_id=p_business_id and supply_id=p_id
    ) then
      if private.unit_dimension(p_package_unit)<>private.unit_dimension(v_tracking.base_unit) then
        raise exception 'A unidade da nova marca é incompatível com o estoque do ingrediente substituído.' using errcode='22023';
      end if;
      insert into public.inventory_tracking(business_id,supply_id,base_unit,minimum_quantity)
      values(p_business_id,p_id,v_tracking.base_unit,v_tracking.minimum_quantity);
    end if;
  end if;

  select * into v_tracking
  from public.inventory_tracking
  where business_id=p_business_id and supply_id=p_id;
  if found and private.unit_dimension(p_package_unit)<>private.unit_dimension(v_tracking.base_unit) then
    raise exception 'A unidade da compra é incompatível com o estoque configurado.' using errcode='22023';
  end if;

  if p_purchase_mode='append' then
    insert into public.supply_purchases(
      business_id,supply_id,package_quantity,package_unit,package_price,purchased_at,funding_source
    ) values(
      p_business_id,p_id,p_package_quantity,p_package_unit,p_package_price,p_purchased_at,p_funding_source
    );
  elsif p_purchase_mode='correct' then
    if p_purchase_id is null then
      raise exception 'Identifique a compra que será corrigida.' using errcode='22023';
    end if;
    if v_latest_id is distinct from p_purchase_id then
      raise exception 'A compra mudou desde que esta tela foi aberta. Atualize os dados antes de corrigir.' using errcode='40001';
    end if;

    select * into v_purchase
    from public.supply_purchases
    where id=p_purchase_id and business_id=p_business_id and supply_id=p_id
    for update;
    if not found then raise exception 'Compra não encontrada.' using errcode='P0002'; end if;
    if private.unit_dimension(v_purchase.package_unit)<>private.unit_dimension(p_package_unit) then
      raise exception 'A unidade corrigida precisa manter a mesma dimensão da compra original.' using errcode='22023';
    end if;

    select * into v_purchase_movement
    from public.inventory_movements
    where business_id=p_business_id and supply_id=p_id
      and source_key='purchase:'||p_purchase_id::text
    limit 1;

    v_old_base:=private.unit_base_amount(v_purchase.package_quantity,v_purchase.package_unit);
    v_new_base:=private.unit_base_amount(p_package_quantity,p_package_unit);

    update public.supply_purchases
    set package_quantity=p_package_quantity,
        package_unit=p_package_unit,
        package_price=p_package_price,
        purchased_at=p_purchased_at,
        funding_source=p_funding_source
    where id=p_purchase_id and business_id=p_business_id and supply_id=p_id;

    if v_purchase_movement.id is not null and (
      v_old_base is distinct from v_new_base
      or (v_purchase_movement.occurred_at at time zone 'America/Sao_Paulo')::date is distinct from p_purchased_at
    ) then
      begin
        v_request:=nullif(current_setting('app.audit_request_id',true),'')::uuid;
      exception when others then
        v_request:=null;
      end;
      v_correction_key:='purchase-correction:'||p_purchase_id::text||':'||coalesce(v_request,gen_random_uuid())::text;
      insert into public.inventory_movements(
        business_id,supply_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at,created_by
      ) values(
        p_business_id,p_id,-v_purchase_movement.quantity_delta,v_purchase_movement.base_unit,'adjustment',
        v_correction_key||':reversal','Correção de compra · estorno do lançamento anterior',
        v_purchase_movement.occurred_at,auth.uid()
      );
      insert into public.inventory_movements(
        business_id,supply_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at,created_by
      ) values(
        p_business_id,p_id,v_new_base,v_purchase_movement.base_unit,'adjustment',
        v_correction_key||':replacement','Correção de compra · lançamento corrigido',
        private.nat_business_date_start(p_purchased_at),auth.uid()
      );
    end if;
  else
    -- Metadata-only edits never append a purchase for an existing supply. The only
    -- compatibility exception is creation by a pre-Stage-3 client, which necessarily
    -- has no purchase history yet.
    if v_latest_id is null then
      insert into public.supply_purchases(
        business_id,supply_id,package_quantity,package_unit,package_price,purchased_at,funding_source
      ) values(
        p_business_id,p_id,p_package_quantity,p_package_unit,p_package_price,p_purchased_at,p_funding_source
      );
    end if;
  end if;

  if p_equivalent_to_supply_id is not null then
    perform private.activate_supply_equivalence(p_business_id,p_equivalent_to_supply_id,p_id);
  end if;
end;
$$;
revoke all on function private.save_supply_v5(uuid,uuid,text,text,numeric,text,numeric,date,text,uuid,text,uuid) from public,anon,authenticated;

commit;

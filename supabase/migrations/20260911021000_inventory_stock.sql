-- Inventory: opt-in stock tracking for finished products, ingredients, packaging and other supplies.
-- Existing operations remain compatible: an item only starts enforcing stock after its opening balance is configured.
begin;

-- Supplies can also represent operational consumables that are neither an ingredient nor packaging.
alter table public.supplies drop constraint if exists supplies_category_check;
alter table public.supplies
  add constraint supplies_category_check check (category in ('ingredient','packaging','other'));

create table if not exists public.inventory_tracking (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  supply_id uuid,
  product_id uuid,
  base_unit text not null check (base_unit in ('g','ml','unit')),
  minimum_quantity numeric(14,4) not null default 0 check (minimum_quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_tracking_one_item check ((supply_id is not null)::int + (product_id is not null)::int = 1),
  foreign key (business_id,supply_id) references public.supplies(business_id,id) on delete cascade,
  foreign key (business_id,product_id) references public.products(business_id,id) on delete cascade
);
create unique index if not exists inventory_tracking_supply_uidx on public.inventory_tracking(business_id,supply_id) where supply_id is not null;
create unique index if not exists inventory_tracking_product_uidx on public.inventory_tracking(business_id,product_id) where product_id is not null;

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  supply_id uuid,
  product_id uuid,
  quantity_delta numeric(14,4) not null check (quantity_delta <> 0),
  base_unit text not null check (base_unit in ('g','ml','unit')),
  movement_type text not null check (movement_type in ('opening','purchase','production_in','production_out','sale','sale_cancel','adjustment')),
  source_key text,
  note text check (note is null or char_length(btrim(note)) between 1 and 500),
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint inventory_movements_one_item check ((supply_id is not null)::int + (product_id is not null)::int = 1),
  foreign key (business_id,supply_id) references public.supplies(business_id,id) on delete restrict,
  foreign key (business_id,product_id) references public.products(business_id,id) on delete restrict
);
create unique index if not exists inventory_movements_source_uidx on public.inventory_movements(business_id,source_key) where source_key is not null;
create index if not exists inventory_movements_supply_idx on public.inventory_movements(business_id,supply_id,occurred_at desc) where supply_id is not null;
create index if not exists inventory_movements_product_idx on public.inventory_movements(business_id,product_id,occurred_at desc) where product_id is not null;

create table if not exists public.inventory_productions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null,
  batches numeric(14,4) not null check (batches > 0),
  units_produced numeric(14,4) not null check (units_produced > 0),
  produced_at timestamptz not null default now(),
  note text check (note is null or char_length(btrim(note)) between 1 and 500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (business_id,product_id) references public.products(business_id,id) on delete restrict
);
create index if not exists inventory_productions_business_date_idx on public.inventory_productions(business_id,produced_at desc);

alter table public.inventory_tracking enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_productions enable row level security;

drop policy if exists inventory_tracking_select on public.inventory_tracking;
create policy inventory_tracking_select on public.inventory_tracking for select to authenticated using (private.is_business_member(business_id));
drop policy if exists inventory_movements_select on public.inventory_movements;
create policy inventory_movements_select on public.inventory_movements for select to authenticated using (private.is_business_member(business_id));
drop policy if exists inventory_productions_select on public.inventory_productions;
create policy inventory_productions_select on public.inventory_productions for select to authenticated using (private.is_business_member(business_id));

-- New Supabase projects no longer receive broad Data API grants automatically. Keep these explicit and minimal.
revoke all on public.inventory_tracking,public.inventory_movements,public.inventory_productions from public,anon,authenticated;
grant select on public.inventory_tracking,public.inventory_movements,public.inventory_productions to authenticated;
grant all on public.inventory_tracking,public.inventory_movements,public.inventory_productions to service_role;

-- Track configuration changes and production records in the existing immutable business audit trail.
drop trigger if exists inventory_tracking_updated_at on public.inventory_tracking;
create trigger inventory_tracking_updated_at before update on public.inventory_tracking for each row execute function private.set_updated_at();
drop trigger if exists inventory_tracking_audit on public.inventory_tracking;
create trigger inventory_tracking_audit after insert or update or delete on public.inventory_tracking for each row execute function private.audit_row_change();
drop trigger if exists inventory_productions_audit on public.inventory_productions;
create trigger inventory_productions_audit after insert or update or delete on public.inventory_productions for each row execute function private.audit_row_change();

create or replace function private.inventory_balance(
  p_business_id uuid,
  p_item_kind text,
  p_item_id uuid
)
returns numeric
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(sum(m.quantity_delta),0)
  from public.inventory_movements m
  where m.business_id=p_business_id
    and ((p_item_kind='supply' and m.supply_id=p_item_id) or (p_item_kind='product' and m.product_id=p_item_id));
$$;
revoke all on function private.inventory_balance(uuid,text,uuid) from public,anon,authenticated;

create or replace function public.get_inventory_snapshot(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_items jsonb;
  v_movements jsonb;
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(row_data order by sort_order,name),'[]'::jsonb)
  into v_items
  from (
    select
      case s.category when 'ingredient' then 1 when 'packaging' then 2 else 3 end as sort_order,
      s.name,
      jsonb_build_object(
        'kind','supply','itemId',s.id,'name',s.name,'category',s.category,
        'tracked',(t.id is not null),
        'currentQuantity',case when t.id is null then 0 else private.inventory_balance(p_business_id,'supply',s.id) end,
        'minimumQuantity',coalesce(t.minimum_quantity,0),
        'baseUnit',coalesce(t.base_unit,case private.unit_dimension(lp.package_unit) when 'mass' then 'g' when 'volume' then 'ml' else 'unit' end),
        'lowStock',case when t.id is null then false else private.inventory_balance(p_business_id,'supply',s.id)<=t.minimum_quantity end,
        'lastMovementAt',(select max(m.occurred_at) from public.inventory_movements m where m.business_id=p_business_id and m.supply_id=s.id)
      ) as row_data
    from public.supplies s
    left join public.inventory_tracking t on t.business_id=s.business_id and t.supply_id=s.id
    left join lateral (
      select sp.package_unit from public.supply_purchases sp
      where sp.business_id=s.business_id and sp.supply_id=s.id
      order by sp.purchased_at desc,sp.created_at desc limit 1
    ) lp on true
    where s.business_id=p_business_id and s.active=true

    union all

    select
      0 as sort_order,
      p.name,
      jsonb_build_object(
        'kind','product','itemId',p.id,'name',p.name,'category','product',
        'tracked',(t.id is not null),
        'currentQuantity',case when t.id is null then 0 else private.inventory_balance(p_business_id,'product',p.id) end,
        'minimumQuantity',coalesce(t.minimum_quantity,0),
        'baseUnit','unit',
        'lowStock',case when t.id is null then false else private.inventory_balance(p_business_id,'product',p.id)<=t.minimum_quantity end,
        'lastMovementAt',(select max(m.occurred_at) from public.inventory_movements m where m.business_id=p_business_id and m.product_id=p.id)
      ) as row_data
    from public.products p
    left join public.inventory_tracking t on t.business_id=p.business_id and t.product_id=p.id
    where p.business_id=p_business_id and p.active=true
  ) q;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,
    'kind',case when m.product_id is not null then 'product' else 'supply' end,
    'itemId',coalesce(m.product_id,m.supply_id),
    'itemName',coalesce(p.name,s.name,'Item'),
    'quantityDelta',m.quantity_delta,
    'baseUnit',m.base_unit,
    'movementType',m.movement_type,
    'note',m.note,
    'occurredAt',m.occurred_at
  ) order by m.occurred_at desc,m.created_at desc),'[]'::jsonb)
  into v_movements
  from (
    select * from public.inventory_movements
    where business_id=p_business_id
    order by occurred_at desc,created_at desc
    limit 60
  ) m
  left join public.products p on p.business_id=m.business_id and p.id=m.product_id
  left join public.supplies s on s.business_id=m.business_id and s.id=m.supply_id;

  return jsonb_build_object('items',v_items,'movements',v_movements);
end;
$$;

create or replace function public.set_inventory_balance(
  p_business_id uuid,
  p_item_kind text,
  p_item_id uuid,
  p_quantity numeric,
  p_minimum_quantity numeric,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_tracking public.inventory_tracking%rowtype;
  v_base_unit text;
  v_current numeric;
  v_delta numeric;
  v_first boolean:=false;
  v_note text:=nullif(left(btrim(coalesce(p_note,'')),500),'');
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if p_item_id is null or p_quantity is null or p_quantity<0 or p_minimum_quantity is null or p_minimum_quantity<0 then
    raise exception 'Saldo e estoque mínimo precisam ser zero ou maiores.' using errcode='22023';
  end if;
  if p_item_kind='product' then
    if not exists(select 1 from public.products p where p.business_id=p_business_id and p.id=p_item_id and p.active=true) then
      raise exception 'Produto não encontrado ou arquivado.' using errcode='22023';
    end if;
    v_base_unit:='unit';
  elsif p_item_kind='supply' then
    select case private.unit_dimension(sp.package_unit) when 'mass' then 'g' when 'volume' then 'ml' when 'unit' then 'unit' else null end
    into v_base_unit
    from public.supply_purchases sp
    join public.supplies s on s.business_id=sp.business_id and s.id=sp.supply_id and s.active=true
    where sp.business_id=p_business_id and sp.supply_id=p_item_id
    order by sp.purchased_at desc,sp.created_at desc limit 1;
    if v_base_unit is null then
      raise exception 'Insumo sem unidade de compra válida.' using errcode='22023';
    end if;
  else
    raise exception 'Tipo de item de estoque inválido.' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':'||p_item_kind||':'||p_item_id::text,0));

  select * into v_tracking
  from public.inventory_tracking t
  where t.business_id=p_business_id
    and ((p_item_kind='supply' and t.supply_id=p_item_id) or (p_item_kind='product' and t.product_id=p_item_id))
  for update;

  if not found then
    v_first:=true;
    insert into public.inventory_tracking(business_id,supply_id,product_id,base_unit,minimum_quantity)
    values(p_business_id,case when p_item_kind='supply' then p_item_id end,case when p_item_kind='product' then p_item_id end,v_base_unit,p_minimum_quantity);
    v_current:=0;
  else
    if v_tracking.base_unit<>v_base_unit then
      raise exception 'A unidade-base do estoque não pode ser alterada.' using errcode='22023';
    end if;
    update public.inventory_tracking set minimum_quantity=p_minimum_quantity where id=v_tracking.id;
    v_current:=private.inventory_balance(p_business_id,p_item_kind,p_item_id);
  end if;

  v_delta:=p_quantity-v_current;
  if v_delta<>0 then
    insert into public.inventory_movements(
      business_id,supply_id,product_id,quantity_delta,base_unit,movement_type,note,occurred_at,created_by
    ) values(
      p_business_id,case when p_item_kind='supply' then p_item_id end,case when p_item_kind='product' then p_item_id end,
      v_delta,v_base_unit,case when v_first then 'opening' else 'adjustment' end,v_note,now(),auth.uid()
    );
  end if;
end;
$$;

create or replace function public.record_inventory_production(
  p_business_id uuid,
  p_product_id uuid,
  p_batches numeric,
  p_produced_at timestamptz,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_product public.products%rowtype;
  v_product_tracking public.inventory_tracking%rowtype;
  v_item record;
  v_units numeric;
  v_balance numeric;
  v_production_id uuid:=gen_random_uuid();
  v_note text:=nullif(left(btrim(coalesce(p_note,'')),500),'');
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if p_batches is null or p_batches<=0 or p_produced_at is null then
    raise exception 'Informe uma quantidade de produção maior que zero.' using errcode='22023';
  end if;

  select * into v_product from public.products p
  where p.business_id=p_business_id and p.id=p_product_id and p.active=true;
  if not found then raise exception 'Produto não encontrado ou arquivado.' using errcode='22023'; end if;
  if not exists(select 1 from public.recipe_items r where r.business_id=p_business_id and r.product_id=p_product_id) then
    raise exception 'Complete a receita antes de registrar produção.' using errcode='22023';
  end if;

  select * into v_product_tracking from public.inventory_tracking t
  where t.business_id=p_business_id and t.product_id=p_product_id;
  if not found then
    raise exception 'Defina primeiro o saldo inicial deste produto no Estoque.' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':product:'||p_product_id::text,0));
  v_units:=v_product.batch_yield*p_batches;

  if exists(
    select 1
    from public.recipe_items r
    join public.inventory_tracking t on t.business_id=r.business_id and t.supply_id=r.supply_id
    where r.business_id=p_business_id and r.product_id=p_product_id
      and private.unit_dimension(r.unit)<>private.unit_dimension(t.base_unit)
  ) then
    raise exception 'Uma unidade da receita é incompatível com o estoque do insumo.' using errcode='22023';
  end if;

  for v_item in
    select r.supply_id,t.base_unit,sum(private.unit_base_amount(r.quantity,r.unit))*p_batches as required_quantity
    from public.recipe_items r
    join public.inventory_tracking t on t.business_id=r.business_id and t.supply_id=r.supply_id
    where r.business_id=p_business_id and r.product_id=p_product_id
    group by r.supply_id,t.base_unit
    order by r.supply_id
  loop
    if v_item.required_quantity is null or v_item.required_quantity<=0 then
      raise exception 'Quantidade inválida na receita.' using errcode='22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':supply:'||v_item.supply_id::text,0));
    v_balance:=private.inventory_balance(p_business_id,'supply',v_item.supply_id);
    if v_balance<v_item.required_quantity then
      raise exception 'Estoque insuficiente de insumo para esta produção.' using errcode='22023';
    end if;
  end loop;

  insert into public.inventory_productions(id,business_id,product_id,batches,units_produced,produced_at,note,created_by)
  values(v_production_id,p_business_id,p_product_id,p_batches,v_units,p_produced_at,v_note,auth.uid());

  for v_item in
    select r.supply_id,t.base_unit,sum(private.unit_base_amount(r.quantity,r.unit))*p_batches as required_quantity
    from public.recipe_items r
    join public.inventory_tracking t on t.business_id=r.business_id and t.supply_id=r.supply_id
    where r.business_id=p_business_id and r.product_id=p_product_id
    group by r.supply_id,t.base_unit
    order by r.supply_id
  loop
    insert into public.inventory_movements(
      business_id,supply_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at,created_by
    ) values(
      p_business_id,v_item.supply_id,-v_item.required_quantity,v_item.base_unit,'production_out',
      'production:'||v_production_id::text||':supply:'||v_item.supply_id::text,
      'Consumo na produção de '||v_product.name,p_produced_at,auth.uid()
    );
  end loop;

  insert into public.inventory_movements(
    business_id,product_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at,created_by
  ) values(
    p_business_id,p_product_id,v_units,'unit','production_in','production:'||v_production_id::text||':product:'||p_product_id::text,
    coalesce(v_note,'Produção registrada'),p_produced_at,auth.uid()
  );

  return v_production_id;
end;
$$;

-- Once a supply is monitored, every new purchase automatically enters stock in the normalized base unit.
create or replace function private.inventory_after_purchase()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_tracking public.inventory_tracking%rowtype;
  v_quantity numeric;
begin
  select * into v_tracking from public.inventory_tracking t
  where t.business_id=new.business_id and t.supply_id=new.supply_id;
  if not found then return new; end if;
  if private.unit_dimension(new.package_unit)<>private.unit_dimension(v_tracking.base_unit) then
    raise exception 'A unidade da compra é incompatível com o estoque configurado.' using errcode='22023';
  end if;
  v_quantity:=private.unit_base_amount(new.package_quantity,new.package_unit);
  insert into public.inventory_movements(
    business_id,supply_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at,created_by
  ) values(
    new.business_id,new.supply_id,v_quantity,v_tracking.base_unit,'purchase','purchase:'||new.id::text,
    'Compra registrada',new.purchased_at::timestamptz,auth.uid()
  ) on conflict (business_id,source_key) where source_key is not null do nothing;
  return new;
end;
$$;
revoke all on function private.inventory_after_purchase() from public,anon,authenticated;
drop trigger if exists supply_purchases_inventory on public.supply_purchases;
create trigger supply_purchases_inventory after insert on public.supply_purchases for each row execute function private.inventory_after_purchase();

-- Finished-product stock is enforced only after that product is explicitly being monitored.
create or replace function private.inventory_after_sale_item()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_tracking public.inventory_tracking%rowtype;
  v_balance numeric;
begin
  select * into v_tracking from public.inventory_tracking t
  where t.business_id=new.business_id and t.product_id=new.product_id;
  if not found then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.business_id::text||':product:'||new.product_id::text,0));
  v_balance:=private.inventory_balance(new.business_id,'product',new.product_id);
  if v_balance<new.quantity then
    raise exception 'Estoque insuficiente do produto acabado para concluir a venda.' using errcode='22023';
  end if;
  insert into public.inventory_movements(
    business_id,product_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at,created_by
  ) values(
    new.business_id,new.product_id,-new.quantity,'unit','sale','sale:'||new.id::text,'Saída por venda',now(),auth.uid()
  ) on conflict (business_id,source_key) where source_key is not null do nothing;
  return new;
end;
$$;
revoke all on function private.inventory_after_sale_item() from public,anon,authenticated;
drop trigger if exists sale_items_inventory on public.sale_items;
create trigger sale_items_inventory after insert on public.sale_items for each row execute function private.inventory_after_sale_item();

-- A cancellation only restores quantities that were actually removed when the sale was created.
create or replace function private.inventory_after_sale_cancel()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_item record;
begin
  if old.status='completed' and new.status='cancelled' then
    for v_item in
      select si.* from public.sale_items si
      where si.business_id=new.business_id and si.sale_id=new.id
    loop
      if exists(
        select 1 from public.inventory_movements m
        where m.business_id=new.business_id and m.source_key='sale:'||v_item.id::text
      ) then
        perform pg_advisory_xact_lock(hashtextextended(new.business_id::text||':product:'||v_item.product_id::text,0));
        insert into public.inventory_movements(
          business_id,product_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at,created_by
        ) values(
          new.business_id,v_item.product_id,v_item.quantity,'unit','sale_cancel','sale-cancel:'||v_item.id::text,
          'Devolução por cancelamento da venda',now(),auth.uid()
        ) on conflict (business_id,source_key) where source_key is not null do nothing;
      end if;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function private.inventory_after_sale_cancel() from public,anon,authenticated;
drop trigger if exists sales_inventory_cancel on public.sales;
create trigger sales_inventory_cancel after update of status on public.sales for each row execute function private.inventory_after_sale_cancel();

revoke all on function public.get_inventory_snapshot(uuid) from public,anon;
revoke all on function public.set_inventory_balance(uuid,text,uuid,numeric,numeric,text) from public,anon;
revoke all on function public.record_inventory_production(uuid,uuid,numeric,timestamptz,text) from public,anon;
grant execute on function public.get_inventory_snapshot(uuid) to authenticated;
grant execute on function public.set_inventory_balance(uuid,text,uuid,numeric,numeric,text) to authenticated;
grant execute on function public.record_inventory_production(uuid,uuid,numeric,timestamptz,text) to authenticated;

commit;

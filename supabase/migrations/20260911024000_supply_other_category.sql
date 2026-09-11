-- Keep the authoritative purchase RPC aligned with the expanded supply category domain.
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
set search_path=''
as $$
declare
  v_latest record;
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if p_id is null or char_length(btrim(coalesce(p_name,''))) not between 1 and 160
     or p_category not in ('ingredient','packaging','other')
     or p_package_quantity is null or p_package_quantity <= 0
     or p_package_unit not in ('g','kg','ml','l','unit')
     or p_package_price is null or p_package_price < 0
     or p_purchased_at is null then
    raise exception 'Dados da compra inválidos.' using errcode='22023';
  end if;

  insert into public.supplies(id,business_id,name,category,active)
  values(p_id,p_business_id,btrim(p_name),p_category,true)
  on conflict(id) do update set
    name=excluded.name,
    category=excluded.category,
    active=true
  where public.supplies.business_id=p_business_id;

  if not exists(
    select 1 from public.supplies s
    where s.id=p_id and s.business_id=p_business_id
  ) then
    raise exception 'O identificador do item pertence a outra empresa.' using errcode='42501';
  end if;

  select sp.package_quantity,sp.package_unit,sp.package_price,sp.purchased_at
  into v_latest
  from public.supply_purchases sp
  where sp.business_id=p_business_id and sp.supply_id=p_id
  order by sp.purchased_at desc,sp.created_at desc
  limit 1;

  if v_latest is null
     or v_latest.package_quantity is distinct from p_package_quantity
     or v_latest.package_unit is distinct from p_package_unit
     or v_latest.package_price is distinct from p_package_price
     or v_latest.purchased_at is distinct from p_purchased_at then
    insert into public.supply_purchases(
      business_id,supply_id,package_quantity,package_unit,package_price,purchased_at
    ) values(
      p_business_id,p_id,p_package_quantity,p_package_unit,p_package_price,p_purchased_at
    );
  end if;
end;
$$;

revoke all on function public.save_supply(uuid,uuid,text,text,numeric,text,numeric,date) from public,anon;
grant execute on function public.save_supply(uuid,uuid,text,text,numeric,text,numeric,date) to authenticated;

commit;

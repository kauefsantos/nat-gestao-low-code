begin;

-- Analysis UX support: expose purchase history grouped by equivalent supplies.
-- The core schema version is intentionally unchanged: this is an additive,
-- backwards-compatible reporting RPC consumed by the analysis Edge Function.
create or replace function public.get_analysis_supply_groups_v1(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_result jsonb;
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;

  with members as (
    select
      s.id supply_id,
      s.name,
      s.category,
      s.active,
      coalesce(m.group_id,s.id) group_id,
      case when m.group_id is null then s.active else coalesce(m.is_current,false) end is_current
    from public.supplies s
    left join private.supply_equivalence_members m
      on m.business_id=s.business_id and m.supply_id=s.id
    where s.business_id=p_business_id
  ), purchase_rows as (
    select
      m.group_id,m.supply_id,m.name,m.category,m.active,m.is_current,
      sp.id purchase_id,sp.package_quantity,sp.package_unit,sp.package_price,
      sp.purchased_at,sp.created_at,
      case
        when private.unit_base_amount(sp.package_quantity,sp.package_unit)>0
          then sp.package_price/private.unit_base_amount(sp.package_quantity,sp.package_unit)
        else 0
      end unit_cost,
      row_number() over(
        partition by m.group_id
        order by sp.purchased_at desc,sp.created_at desc,sp.id desc
      ) group_rank
    from members m
    join public.supply_purchases sp
      on sp.business_id=p_business_id and sp.supply_id=m.supply_id
  ), brand_summary as (
    select
      group_id,supply_id,max(name) name,max(category) category,
      bool_or(is_current) is_current,count(*) purchases,
      sum(package_price) total_spent,max(purchased_at) last_date,
      (array_agg(package_price order by purchased_at desc,created_at desc,purchase_id desc))[1] last_package_price,
      (array_agg(unit_cost order by purchased_at desc,created_at desc,purchase_id desc))[1] last_unit_cost
    from purchase_rows
    group by group_id,supply_id
  ), groups as (
    select
      m.group_id,
      coalesce(
        max(m.name) filter(where m.is_current),
        max(m.name) filter(where m.active),
        max(m.name)
      ) name,
      coalesce(
        max(m.category) filter(where m.is_current),
        max(m.category) filter(where m.active),
        max(m.category)
      ) category,
      coalesce((select count(*) from purchase_rows pr where pr.group_id=m.group_id),0) purchases,
      coalesce((select sum(pr.package_price) from purchase_rows pr where pr.group_id=m.group_id),0) total_spent,
      (select pr.unit_cost from purchase_rows pr where pr.group_id=m.group_id and pr.group_rank=1 limit 1) current_unit_cost,
      (select pr.unit_cost from purchase_rows pr where pr.group_id=m.group_id and pr.group_rank=2 limit 1) previous_unit_cost,
      coalesce(sum(
        case when t.id is null then 0 else private.inventory_balance(p_business_id,'supply',m.supply_id) end
      ),0) stock_quantity,
      coalesce(
        max(t.base_unit) filter(where m.is_current),
        max(t.base_unit)
      ) base_unit
    from members m
    left join public.inventory_tracking t
      on t.business_id=p_business_id and t.supply_id=m.supply_id
    where exists(select 1 from purchase_rows pr where pr.group_id=m.group_id)
    group by m.group_id
  ), shaped as (
    select
      g.*,
      case
        when g.previous_unit_cost is null or g.previous_unit_cost=0 then null
        else (g.current_unit_cost-g.previous_unit_cost)/g.previous_unit_cost*100
      end variation,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'supplyId',b.supply_id,
          'name',b.name,
          'current',b.is_current,
          'purchases',b.purchases,
          'totalSpent',b.total_spent,
          'lastDate',b.last_date,
          'lastPackagePrice',b.last_package_price,
          'lastUnitCost',b.last_unit_cost,
          'stockQuantity',case
            when exists(
              select 1 from public.inventory_tracking it
              where it.business_id=p_business_id and it.supply_id=b.supply_id
            ) then private.inventory_balance(p_business_id,'supply',b.supply_id)
            else null
          end,
          'baseUnit',(
            select it.base_unit from public.inventory_tracking it
            where it.business_id=p_business_id and it.supply_id=b.supply_id
            limit 1
          )
        ) order by b.is_current desc,b.last_date desc,b.name)
        from brand_summary b where b.group_id=g.group_id
      ),'[]'::jsonb) brands
    from groups g
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'groupId',group_id,
    'name',name,
    'category',category,
    'purchases',purchases,
    'totalSpent',total_spent,
    'currentUnitCost',current_unit_cost,
    'previousUnitCost',previous_unit_cost,
    'variation',variation,
    'stockQuantity',stock_quantity,
    'baseUnit',base_unit,
    'brands',brands
  ) order by abs(coalesce(variation,0)) desc,name),'[]'::jsonb)
  into v_result
  from shaped;

  return coalesce(v_result,'[]'::jsonb);
end;
$$;

revoke all on function public.get_analysis_supply_groups_v1(uuid) from public,anon;
grant execute on function public.get_analysis_supply_groups_v1(uuid) to authenticated;

commit;

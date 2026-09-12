begin;

create or replace function public.get_supply_purchase_snapshot(p_business_id uuid,p_month_start date)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_latest jsonb;v_month_cash numeric;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  with latest as (
    select distinct on (sp.supply_id)
      sp.supply_id,sp.package_quantity,sp.package_unit,sp.package_price,sp.purchased_at,sp.created_at
    from public.supply_purchases sp
    where sp.business_id=p_business_id
    order by sp.supply_id,sp.purchased_at desc,sp.created_at desc,sp.id desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'supplyId',supply_id,'packageQuantity',package_quantity,'packageUnit',package_unit,
    'packagePrice',package_price,'purchasedAt',purchased_at
  )),'[]'::jsonb) into v_latest from latest;

  select coalesce(sum(sp.package_price),0) into v_month_cash
  from public.supply_purchases sp
  where sp.business_id=p_business_id
    and sp.purchased_at>=p_month_start
    and sp.purchased_at<(p_month_start+interval '1 month')::date;

  return jsonb_build_object('latest',v_latest,'monthCashOut',v_month_cash);
end $$;

revoke all on function public.get_supply_purchase_snapshot(uuid,date) from public,anon;
grant execute on function public.get_supply_purchase_snapshot(uuid,date) to authenticated;

commit;

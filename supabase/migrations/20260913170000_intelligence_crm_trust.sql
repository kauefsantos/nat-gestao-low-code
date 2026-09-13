begin;

update private.nat_schema_release
set version='2026-09-13.intelligence-crm-trust.1', applied_at=now()
where singleton=true;

create or replace function public.get_business_intelligence_snapshot_v2(p_business_id uuid)
returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  v_base jsonb;
  v_products jsonb;
  v_origins jsonb;
  v_business_roi jsonb;
  v_promotions jsonb;
  v_month_start date:=(date_trunc('month',timezone('America/Sao_Paulo',now())))::date;
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;

  v_base:=public.get_business_intelligence_snapshot_v1(p_business_id);

  select coalesce(jsonb_agg(
    product || jsonb_build_object(
      'investedCost',invested_cost,
      'netReturn',contribution,
      'roiPercent',case when invested_cost>0 then contribution/invested_cost*100 else null end
    ) order by contribution desc, product->>'name'
  ),'[]'::jsonb)
  into v_products
  from (
    select product,
      coalesce((product->>'productCost')::numeric,0)
      +coalesce((product->>'allocatedFee')::numeric,0)
      +coalesce((product->>'allocatedDelivery')::numeric,0) invested_cost,
      coalesce((product->>'contribution')::numeric,0) contribution
    from jsonb_array_elements(coalesce(v_base->'products','[]'::jsonb)) product
  ) p;

  with valid as (
    select s.*
    from public.sales s
    where s.business_id=p_business_id
      and s.status='completed'
      and coalesce(s.transaction_type,'sale')='sale'
      and s.customer_id is not null
  ), per_customer as (
    select c.id customer_id,c.name,
      coalesce(nullif(btrim(c.source),''),'Não informado') source,
      count(v.id) orders,
      coalesce(sum(v.sale_value_snapshot),0) billed,
      coalesce(sum(v.contribution_snapshot),0) contribution,
      count(v.id)>=2 recurring
    from public.customers c
    join valid v on v.customer_id=c.id
    where c.business_id=p_business_id and c.active=true
    group by c.id,c.name,coalesce(nullif(btrim(c.source),''),'Não informado')
  ), grouped as (
    select source,count(*) customers,sum(orders) orders,sum(billed) billed,sum(contribution) contribution,
      count(*) filter(where recurring) recurring
    from per_customer group by source
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'source',source,'customers',customers,'orders',orders,'billed',billed,'contribution',contribution,
    'recurring',recurring,'repurchaseRate',case when customers>0 then recurring::numeric/customers*100 else 0 end
  ) order by billed desc,source),'[]'::jsonb)
  into v_origins from grouped;

  with commercial as (
    select s.*
    from public.sales s
    where s.business_id=p_business_id
      and s.status='completed'
      and coalesce(s.transaction_type,'sale')='sale'
      and (s.sold_at at time zone 'America/Sao_Paulo')::date>=v_month_start
      and (s.sold_at at time zone 'America/Sao_Paulo')::date<(v_month_start+interval '1 month')::date
  ), item_cost as (
    select coalesce(sum(si.unit_cost_snapshot*si.quantity),0) amount
    from public.sale_items si join commercial s on s.id=si.sale_id and s.business_id=si.business_id
  ), sale_cost as (
    select coalesce(sum(variable_fee_snapshot+delivery_cost_snapshot),0) amount from commercial
  ), extras as (
    select coalesce(sum(amount),0) amount from public.sporadic_expenses
    where business_id=p_business_id and spent_at>=v_month_start and spent_at<(v_month_start+interval '1 month')::date
  ), settings as (
    select coalesce(monthly_fixed_costs,0) fixed from public.business_settings where business_id=p_business_id
  ), totals as (
    select coalesce((select sum(sale_value_snapshot) from commercial),0) revenue,
      coalesce((select amount from item_cost),0)+coalesce((select amount from sale_cost),0)
      +coalesce((select amount from extras),0)+coalesce((select fixed from settings),0) invested_cost
  )
  select jsonb_build_object(
    'monthStart',v_month_start,'revenue',revenue,'investedCost',invested_cost,
    'netReturn',revenue-invested_cost,
    'roiPercent',case when invested_cost>0 then (revenue-invested_cost)/invested_cost*100 else null end
  ) into v_business_roi from totals;

  with valid as (
    select s.*
    from public.sales s
    where s.business_id=p_business_id and s.status='completed' and coalesce(s.transaction_type,'sale')='sale'
  ), per_sale as (
    select s.id,s.sale_value_snapshot,s.contribution_snapshot,s.variable_fee_snapshot,s.delivery_cost_snapshot,
      coalesce(sum(si.list_unit_price_snapshot*si.quantity),0) list_total,
      coalesce(sum(si.unit_cost_snapshot*si.quantity),0) item_cost
    from valid s join public.sale_items si on si.business_id=s.business_id and si.sale_id=s.id
    group by s.id,s.sale_value_snapshot,s.contribution_snapshot,s.variable_fee_snapshot,s.delivery_cost_snapshot
  ), discounted as (
    select *,item_cost+variable_fee_snapshot+delivery_cost_snapshot invested_cost
    from per_sale where sale_value_snapshot+0.005<list_total
  ), totals as (
    select count(*) orders,coalesce(sum(list_total-sale_value_snapshot),0) discount_value,
      coalesce(sum(contribution_snapshot),0) contribution,coalesce(sum(invested_cost),0) invested_cost
    from discounted
  )
  select jsonb_build_object(
    'discountedOrders',orders,'discountValue',discount_value,'contribution',contribution,
    'investedCost',invested_cost,
    'roiPercent',case when invested_cost>0 then contribution/invested_cost*100 else null end
  ) into v_promotions from totals;

  return v_base || jsonb_build_object(
    'products',v_products,
    'origins',v_origins,
    'businessRoi',v_business_roi,
    'promotions',v_promotions,
    'metricContext',jsonb_build_object(
      'timezone','America/Sao_Paulo',
      'history','lifetime',
      'source','Lovable Cloud',
      'minimumSales',10,
      'minimumDays',7,
      'factsAvailableWithSmallBase',true,
      'recommendationsRequireReadiness',true
    )
  );
end $$;
revoke all on function public.get_business_intelligence_snapshot_v2(uuid) from public,anon;
grant execute on function public.get_business_intelligence_snapshot_v2(uuid) to authenticated;

create or replace function public.get_business_intelligence_drilldown_v1(
  p_business_id uuid,
  p_dimension text,
  p_key text default null
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  v_rows jsonb:='[]'::jsonb;
  v_totals jsonb:='{}'::jsonb;
  v_key_uuid uuid;
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;

  if p_dimension in ('product','customer') then
    begin
      v_key_uuid:=p_key::uuid;
    exception when invalid_text_representation then
      raise exception 'Chave inválida.' using errcode='22023';
    end;
  end if;

  if p_dimension='product' then
    with valid as (
      select s.* from public.sales s
      where s.business_id=p_business_id and s.status='completed' and coalesce(s.transaction_type,'sale')='sale'
    ), lines as (
      select s.id sale_id,s.sold_at,s.sale_channel,c.name customer_name,si.product_name_snapshot,
        si.quantity,si.unit_price_snapshot*si.quantity billed,si.unit_cost_snapshot*si.quantity item_cost,
        s.variable_fee_snapshot,s.delivery_cost_snapshot,
        sum(si.unit_price_snapshot*si.quantity) over(partition by s.id) sale_line_total
      from valid s
      join public.sale_items si on si.business_id=s.business_id and si.sale_id=s.id
      left join public.customers c on c.business_id=s.business_id and c.id=s.customer_id
      where si.product_id=v_key_uuid
    ), calc as (
      select *,
        variable_fee_snapshot*case when sale_line_total>0 then billed/sale_line_total else 0 end allocated_fee,
        delivery_cost_snapshot*case when sale_line_total>0 then billed/sale_line_total else 0 end allocated_delivery
      from lines
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'saleId',sale_id,'soldAt',sold_at,'customerName',customer_name,'channel',sale_channel,
      'productName',product_name_snapshot,'quantity',quantity,'billed',billed,
      'investedCost',item_cost+allocated_fee+allocated_delivery,
      'contribution',billed-item_cost-allocated_fee-allocated_delivery
    ) order by sold_at desc),'[]'::jsonb),
    jsonb_build_object(
      'orders',count(distinct sale_id),'units',coalesce(sum(quantity),0),'billed',coalesce(sum(billed),0),
      'investedCost',coalesce(sum(item_cost+allocated_fee+allocated_delivery),0),
      'contribution',coalesce(sum(billed-item_cost-allocated_fee-allocated_delivery),0)
    ) into v_rows,v_totals from calc;

  elsif p_dimension='customer' then
    with rows as (
      select s.id sale_id,s.sold_at,s.sale_channel,s.payment_status,s.sale_value_snapshot billed,
        s.total_received received,s.contribution_snapshot contribution
      from public.sales s
      where s.business_id=p_business_id and s.status='completed' and coalesce(s.transaction_type,'sale')='sale'
        and s.customer_id=v_key_uuid
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'saleId',sale_id,'soldAt',sold_at,'channel',sale_channel,'paymentStatus',payment_status,
      'billed',billed,'received',received,'contribution',contribution
    ) order by sold_at desc),'[]'::jsonb),
    jsonb_build_object(
      'orders',count(*),'billed',coalesce(sum(billed),0),'received',coalesce(sum(received),0),
      'contribution',coalesce(sum(contribution),0),'firstPurchase',min(sold_at),'lastPurchase',max(sold_at)
    ) into v_rows,v_totals from rows;

  elsif p_dimension='channel' then
    with rows as (
      select s.id sale_id,s.sold_at,c.name customer_name,s.sale_value_snapshot billed,
        s.total_received received,s.contribution_snapshot contribution
      from public.sales s left join public.customers c on c.business_id=s.business_id and c.id=s.customer_id
      where s.business_id=p_business_id and s.status='completed' and coalesce(s.transaction_type,'sale')='sale'
        and coalesce(s.sale_channel,'other')=p_key
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'saleId',sale_id,'soldAt',sold_at,'customerName',customer_name,'billed',billed,'received',received,'contribution',contribution
    ) order by sold_at desc),'[]'::jsonb),
    jsonb_build_object('orders',count(*),'billed',coalesce(sum(billed),0),'received',coalesce(sum(received),0),'contribution',coalesce(sum(contribution),0))
    into v_rows,v_totals from rows;

  elsif p_dimension='origin' then
    with valid as (
      select s.* from public.sales s
      where s.business_id=p_business_id and s.status='completed' and coalesce(s.transaction_type,'sale')='sale' and s.customer_id is not null
    ), rows as (
      select c.id customer_id,c.name customer_name,coalesce(nullif(btrim(c.source),''),'Não informado') source,
        count(v.id) orders,sum(v.sale_value_snapshot) billed,sum(v.contribution_snapshot) contribution,count(v.id)>=2 recurring
      from public.customers c join valid v on v.customer_id=c.id
      where c.business_id=p_business_id and c.active=true
      group by c.id,c.name,coalesce(nullif(btrim(c.source),''),'Não informado')
    ), selected as (select * from rows where source=p_key)
    select coalesce(jsonb_agg(jsonb_build_object(
      'customerId',customer_id,'customerName',customer_name,'orders',orders,'billed',billed,
      'contribution',contribution,'recurring',recurring
    ) order by billed desc,customer_name),'[]'::jsonb),
    jsonb_build_object('customers',count(*),'orders',coalesce(sum(orders),0),'billed',coalesce(sum(billed),0),'contribution',coalesce(sum(contribution),0),'recurring',count(*) filter(where recurring))
    into v_rows,v_totals from selected;

  elsif p_dimension='cohort' then
    with valid as (
      select s.* from public.sales s
      where s.business_id=p_business_id and s.status='completed' and coalesce(s.transaction_type,'sale')='sale' and s.customer_id is not null
    ), base as (
      select customer_id,min(sold_at) first_purchase,max(sold_at) last_purchase,count(*) orders,sum(sale_value_snapshot) billed
      from valid group by customer_id
    ), rows as (
      select b.*,c.name customer_name,(b.orders>=2) repurchased
      from base b join public.customers c on c.business_id=p_business_id and c.id=b.customer_id and c.active=true
      where to_char(b.first_purchase at time zone 'America/Sao_Paulo','YYYY-MM')=p_key
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'customerId',customer_id,'customerName',customer_name,'firstPurchase',first_purchase,'lastPurchase',last_purchase,
      'orders',orders,'billed',billed,'repurchased',repurchased
    ) order by first_purchase,customer_name),'[]'::jsonb),
    jsonb_build_object('customers',count(*),'repurchased',count(*) filter(where repurchased),'billed',coalesce(sum(billed),0))
    into v_rows,v_totals from rows;

  elsif p_dimension='promotion' then
    with valid as (
      select s.* from public.sales s
      where s.business_id=p_business_id and s.status='completed' and coalesce(s.transaction_type,'sale')='sale'
    ), per_sale as (
      select s.id sale_id,s.sold_at,c.name customer_name,s.sale_value_snapshot billed,s.contribution_snapshot contribution,
        s.variable_fee_snapshot,s.delivery_cost_snapshot,
        coalesce(sum(si.list_unit_price_snapshot*si.quantity),0) list_value,
        coalesce(sum(si.unit_cost_snapshot*si.quantity),0) item_cost
      from valid s join public.sale_items si on si.business_id=s.business_id and si.sale_id=s.id
      left join public.customers c on c.business_id=s.business_id and c.id=s.customer_id
      group by s.id,s.sold_at,c.name,s.sale_value_snapshot,s.contribution_snapshot,s.variable_fee_snapshot,s.delivery_cost_snapshot
    ), rows as (
      select *,list_value-billed discount,item_cost+variable_fee_snapshot+delivery_cost_snapshot invested_cost
      from per_sale where billed+0.005<list_value
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'saleId',sale_id,'soldAt',sold_at,'customerName',customer_name,'listValue',list_value,'billed',billed,
      'discount',discount,'investedCost',invested_cost,'contribution',contribution
    ) order by sold_at desc),'[]'::jsonb),
    jsonb_build_object(
      'orders',count(*),'listValue',coalesce(sum(list_value),0),'billed',coalesce(sum(billed),0),
      'discount',coalesce(sum(discount),0),'investedCost',coalesce(sum(invested_cost),0),'contribution',coalesce(sum(contribution),0)
    ) into v_rows,v_totals from rows;

  else
    raise exception 'Dimensão de inteligência não suportada.' using errcode='22023';
  end if;

  return jsonb_build_object(
    'dimension',p_dimension,'key',p_key,'timezone','America/Sao_Paulo',
    'rows',coalesce(v_rows,'[]'::jsonb),'totals',coalesce(v_totals,'{}'::jsonb)
  );
end $$;
revoke all on function public.get_business_intelligence_drilldown_v1(uuid,text,text) from public,anon;
grant execute on function public.get_business_intelligence_drilldown_v1(uuid,text,text) to authenticated;

commit;

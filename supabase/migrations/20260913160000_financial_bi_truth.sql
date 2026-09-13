begin;

-- Stage 4 — Financial truth & BI.
update private.nat_schema_release
set version='2026-09-13.financial-bi-truth.1', applied_at=now()
where singleton=true;

-- Freeze the list price used to evaluate historical discounts. Legacy rows are
-- reconstructed once from today's product table (the same baseline the old UI used)
-- and will no longer drift after future price changes.
alter table public.sale_items add column if not exists list_unit_price_snapshot numeric;
update public.sale_items si
set list_unit_price_snapshot=coalesce(p.selling_price,si.unit_price_snapshot)
from public.products p
where p.business_id=si.business_id and p.id=si.product_id and si.list_unit_price_snapshot is null;
update public.sale_items
set list_unit_price_snapshot=unit_price_snapshot
where list_unit_price_snapshot is null;
alter table public.sale_items alter column list_unit_price_snapshot set not null;
alter table public.sale_items add constraint sale_items_list_unit_price_nonnegative check(list_unit_price_snapshot>=0);

create or replace function private.freeze_sale_item_list_price()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_price numeric;
begin
  if new.list_unit_price_snapshot is null then
    select selling_price into v_price
    from public.products
    where business_id=new.business_id and id=new.product_id;
    new.list_unit_price_snapshot:=coalesce(v_price,new.unit_price_snapshot,0);
  end if;
  return new;
end $$;
revoke all on function private.freeze_sale_item_list_price() from public,anon,authenticated;
drop trigger if exists sale_items_freeze_list_price on public.sale_items;
create trigger sale_items_freeze_list_price
before insert on public.sale_items
for each row execute function private.freeze_sale_item_list_price();

-- Authoritative month snapshot. Faturamento is economic sale value; received is cash;
-- receivable is only the outstanding balance. Contributions include non-commercial
-- movements because they still consume inventory/cost and affect the business result.
create or replace function public.get_financial_truth_snapshot_v1(
  p_business_id uuid,
  p_month_start date
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_month_start is null then raise exception 'Mês inválido.' using errcode='22023'; end if;
  with month_movements as (
    select s.*
    from public.sales s
    where s.business_id=p_business_id and s.status='completed'
      and (s.sold_at at time zone 'America/Sao_Paulo')::date>=p_month_start
      and (s.sold_at at time zone 'America/Sao_Paulo')::date<(p_month_start+interval '1 month')::date
  ), commercial as (
    select * from month_movements where coalesce(transaction_type,'sale')='sale'
  ), commercial_items as (
    select si.* from public.sale_items si join commercial s on s.id=si.sale_id and s.business_id=si.business_id
  ), movement_items as (
    select si.* from public.sale_items si join month_movements s on s.id=si.sale_id and s.business_id=si.business_id
  )
  select jsonb_build_object(
    'monthStart',p_month_start,
    'billed',coalesce((select sum(sale_value_snapshot) from commercial),0),
    'received',coalesce((select sum(total_received) from commercial),0),
    'receivable',coalesce((select sum(greatest(sale_value_snapshot-total_received,0)) from commercial),0),
    'orders',coalesce((select count(*) from commercial),0),
    'paidOrders',coalesce((select count(*) from commercial where payment_status='paid'),0),
    'pendingOrders',coalesce((select count(*) from commercial where payment_status='pending'),0),
    'units',coalesce((select sum(quantity) from commercial_items),0),
    'movementContribution',coalesce((select sum(contribution_snapshot) from month_movements),0),
    'ownerRemuneration',coalesce((select sum(labor_cost_snapshot*quantity) from movement_items),0)
  ) into v_result;
  return v_result;
end $$;
revoke all on function public.get_financial_truth_snapshot_v1(uuid,date) from public,anon;
grant execute on function public.get_financial_truth_snapshot_v1(uuid,date) to authenticated;

-- Lifetime intelligence is calculated from the complete PostgreSQL history, never
-- from the 45-day operational window loaded by the browser.
create or replace function public.get_business_intelligence_snapshot_v1(p_business_id uuid)
returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  v_readiness jsonb;v_products jsonb;v_channels jsonb;v_customers jsonb;v_overview jsonb;
  v_cohorts jsonb;v_pairs jsonb;v_second jsonb;v_promos jsonb;
  v_today date:=(timezone('America/Sao_Paulo',now()))::date;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;

  with valid as (
    select * from public.sales where business_id=p_business_id and status='completed' and coalesce(transaction_type,'sale')='sale'
  )
  select jsonb_build_object(
    'ready',count(*)>=10 and count(distinct (sold_at at time zone 'America/Sao_Paulo')::date)>=7,
    'salesCount',count(*),
    'distinctSalesDays',count(distinct (sold_at at time zone 'America/Sao_Paulo')::date),
    'minimumSales',10,'minimumDays',7,
    'missingSales',greatest(0,10-count(*)),
    'missingDays',greatest(0,7-count(distinct (sold_at at time zone 'America/Sao_Paulo')::date))
  ) into v_readiness from valid;

  with valid as (
    select * from public.sales where business_id=p_business_id and status='completed' and coalesce(transaction_type,'sale')='sale'
  ), lines as (
    select s.id sale_id,si.product_id,si.product_name_snapshot,
      si.quantity,si.unit_price_snapshot*si.quantity line_revenue,
      si.unit_cost_snapshot*si.quantity line_cost,si.labor_cost_snapshot*si.quantity line_labor,
      s.variable_fee_snapshot,s.delivery_cost_snapshot,
      sum(si.unit_price_snapshot*si.quantity) over(partition by s.id) sale_line_total
    from valid s join public.sale_items si on si.business_id=s.business_id and si.sale_id=s.id
  ), agg as (
    select product_id,product_name_snapshot,
      sum(quantity) units,count(distinct sale_id) orders,sum(line_revenue) billed,sum(line_cost) product_cost,sum(line_labor) labor,
      sum(variable_fee_snapshot*case when sale_line_total>0 then line_revenue/sale_line_total else 0 end) allocated_fee,
      sum(delivery_cost_snapshot*case when sale_line_total>0 then line_revenue/sale_line_total else 0 end) allocated_delivery
    from lines group by product_id,product_name_snapshot
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'productId',product_id,'name',product_name_snapshot,'units',units,'orders',orders,'billed',billed,
    'productCost',product_cost,'labor',labor,'allocatedFee',allocated_fee,'allocatedDelivery',allocated_delivery,
    'contribution',billed-product_cost-allocated_fee-allocated_delivery,
    'marginPercent',case when billed>0 then (billed-product_cost-allocated_fee-allocated_delivery)/billed*100 else 0 end,
    'averageOrderTicket',case when orders>0 then billed/orders else 0 end
  ) order by (billed-product_cost-allocated_fee-allocated_delivery) desc),'[]'::jsonb)
  into v_products from agg;

  with valid as (
    select * from public.sales where business_id=p_business_id and status='completed' and coalesce(transaction_type,'sale')='sale'
  ), agg as (
    select coalesce(sale_channel,'other') channel,count(*) orders,sum(sale_value_snapshot) billed,
      sum(total_received) received,sum(contribution_snapshot) contribution
    from valid group by coalesce(sale_channel,'other')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'channel',channel,'orders',orders,'billed',billed,'received',received,'contribution',contribution,
    'ticket',case when orders>0 then billed/orders else 0 end
  ) order by billed desc),'[]'::jsonb) into v_channels from agg;

  with valid as (
    select * from public.sales where business_id=p_business_id and status='completed' and coalesce(transaction_type,'sale')='sale' and customer_id is not null
  ), base as (
    select customer_id,count(*) orders,sum(sale_value_snapshot) billed,sum(total_received) received,sum(contribution_snapshot) contribution,
      min(sold_at) first_purchase,max(sold_at) last_purchase
    from valid group by customer_id
  ), units as (
    select s.customer_id,sum(si.quantity) units
    from valid s join public.sale_items si on si.business_id=s.business_id and si.sale_id=s.id group by s.customer_id
  ), favorite_counts as (
    select s.customer_id,si.product_name_snapshot,sum(si.quantity) qty
    from valid s join public.sale_items si on si.business_id=s.business_id and si.sale_id=s.id
    group by s.customer_id,si.product_name_snapshot
  ), favorites as (
    select distinct on(customer_id) customer_id,product_name_snapshot favorite_product
    from favorite_counts order by customer_id,qty desc,product_name_snapshot
  ), noncommercial as (
    select customer_id,count(*) interactions from public.sales
    where business_id=p_business_id and status='completed' and coalesce(transaction_type,'sale')<>'sale' and customer_id is not null
    group by customer_id
  ), scored as (
    select b.*,c.name,c.source,coalesce(u.units,0) units,coalesce(f.favorite_product,null) favorite_product,
      coalesce(n.interactions,0) noncommercial_interactions,
      greatest(0,v_today-(b.last_purchase at time zone 'America/Sao_Paulo')::date) days_since_last,
      case when greatest(0,v_today-(b.last_purchase at time zone 'America/Sao_Paulo')::date)<=7 then 5 when greatest(0,v_today-(b.last_purchase at time zone 'America/Sao_Paulo')::date)<=14 then 4 when greatest(0,v_today-(b.last_purchase at time zone 'America/Sao_Paulo')::date)<=30 then 3 when greatest(0,v_today-(b.last_purchase at time zone 'America/Sao_Paulo')::date)<=60 then 2 else 1 end recency_score,
      case when b.orders>=8 then 5 when b.orders>=5 then 4 when b.orders>=3 then 3 when b.orders>=2 then 2 else 1 end frequency_score,
      case when b.billed>=500 then 5 when b.billed>=250 then 4 when b.billed>=100 then 3 when b.billed>=50 then 2 when b.billed>0 then 1 else 0 end value_score
    from base b join public.customers c on c.business_id=p_business_id and c.id=b.customer_id and c.active=true
    left join units u using(customer_id) left join favorites f using(customer_id) left join noncommercial n using(customer_id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'customerId',customer_id,'name',name,'source',source,'firstPurchase',first_purchase,'lastPurchase',last_purchase,
    'orders',orders,'billed',billed,'received',received,'averageTicket',case when orders>0 then billed/orders else 0 end,
    'units',units,'daysSinceLast',days_since_last,'recurring',orders>=2,'favoriteProduct',favorite_product,
    'nonCommercialInteractions',noncommercial_interactions,'contribution',contribution,
    'marginPercent',case when billed>0 then contribution/billed*100 else 0 end,
    'recencyScore',recency_score,'frequencyScore',frequency_score,'valueScore',value_score,
    'rfmTotal',recency_score+frequency_score+value_score,
    'segment',case when days_since_last>=60 then 'Inativo' when days_since_last>=30 then 'Em risco' when orders>=4 and billed>=100 then 'VIP' when orders>=2 then 'Recorrente' else 'Novo' end
  ) order by recency_score+frequency_score+value_score desc,billed desc,name),'[]'::jsonb)
  into v_customers from scored;

  with customers as (
    select value row from jsonb_array_elements(v_customers)
  ), totals as (
    select count(*) active_with_orders,
      count(*) filter(where (row->>'recurring')::boolean) recurrent,
      count(*) filter(where (row->>'daysSinceLast')::int>=30) inactive,
      coalesce(sum((row->>'orders')::numeric),0) orders,
      coalesce(sum((row->>'billed')::numeric),0) billed,
      count(*) filter(where to_char((row->>'firstPurchase')::timestamptz at time zone 'America/Sao_Paulo','YYYY-MM')=to_char(v_today,'YYYY-MM')) new_this_month
    from customers
  ) select jsonb_build_object(
    'customersWithOrders',active_with_orders,'recurrent',recurrent,'inactive',inactive,'newThisMonth',new_this_month,
    'repurchaseRate',case when active_with_orders>0 then recurrent::numeric/active_with_orders*100 else 0 end,
    'averageTicket',case when orders>0 then billed/orders else 0 end
  ) into v_overview from totals;

  with valid as (
    select customer_id,sold_at from public.sales where business_id=p_business_id and status='completed' and coalesce(transaction_type,'sale')='sale' and customer_id is not null
  ), customer_base as (
    select customer_id,min(sold_at) first_purchase,count(*) orders from valid group by customer_id
  ), agg as (
    select to_char(first_purchase at time zone 'America/Sao_Paulo','YYYY-MM') cohort,count(*) customers,count(*) filter(where orders>=2) repurchased
    from customer_base group by 1
  ) select coalesce(jsonb_agg(jsonb_build_object('cohort',cohort,'customers',customers,'repurchased',repurchased,'repurchaseRate',case when customers>0 then repurchased::numeric/customers*100 else 0 end) order by cohort),'[]'::jsonb)
  into v_cohorts from agg;

  with valid as (
    select id from public.sales where business_id=p_business_id and status='completed' and coalesce(transaction_type,'sale')='sale'
  ), names as (
    select distinct si.sale_id,si.product_name_snapshot name from public.sale_items si join valid s on s.id=si.sale_id where si.business_id=p_business_id
  ), agg as (
    select a.name a,b.name b,count(*) count from names a join names b on b.sale_id=a.sale_id and a.name<b.name group by a.name,b.name having count(*)>=2
  ) select coalesce(jsonb_agg(jsonb_build_object('a',a,'b',b,'count',count) order by count desc,a,b),'[]'::jsonb) into v_pairs from agg;

  with ranked as (
    select customer_id,sold_at,row_number() over(partition by customer_id order by sold_at,id) rn
    from public.sales where business_id=p_business_id and status='completed' and coalesce(transaction_type,'sale')='sale' and customer_id is not null
  ), pairs as (
    select customer_id,min(sold_at) filter(where rn=1) first_at,min(sold_at) filter(where rn=2) second_at from ranked where rn<=2 group by customer_id
  ), gaps as (
    select extract(epoch from(second_at-first_at))/86400.0 days from pairs where second_at is not null
  ) select jsonb_build_object('sample',count(*),'days',case when count(*)>0 then avg(days) else null end,'baseSmall',count(*)<5) into v_second from gaps;

  with valid as (
    select * from public.sales where business_id=p_business_id and status='completed' and coalesce(transaction_type,'sale')='sale'
  ), per_sale as (
    select s.id,s.sale_value_snapshot,s.contribution_snapshot,coalesce(sum(si.list_unit_price_snapshot*si.quantity),0) list_total
    from valid s join public.sale_items si on si.business_id=s.business_id and si.sale_id=s.id group by s.id,s.sale_value_snapshot,s.contribution_snapshot
  ) select jsonb_build_object(
    'discountedOrders',count(*) filter(where sale_value_snapshot+0.005<list_total),
    'discountValue',coalesce(sum(greatest(list_total-sale_value_snapshot,0)),0),
    'contribution',coalesce(sum(contribution_snapshot) filter(where sale_value_snapshot+0.005<list_total),0)
  ) into v_promos from per_sale;

  return jsonb_build_object(
    'readiness',v_readiness,'products',v_products,'channels',v_channels,'customers',v_customers,
    'overview',v_overview,'cohorts',v_cohorts,'pairs',v_pairs,'secondPurchase',v_second,'promotions',v_promos
  );
end $$;
revoke all on function public.get_business_intelligence_snapshot_v1(uuid) from public,anon;
grant execute on function public.get_business_intelligence_snapshot_v1(uuid) to authenticated;

commit;

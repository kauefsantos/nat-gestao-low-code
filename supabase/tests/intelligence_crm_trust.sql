-- Stage 5 truth table: lifetime intelligence, ROI, confidence and conciliable drill-downs.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into public.businesses(id,name) values ('51000000-0000-4000-8000-000000000001','Stage 5 BI truth');
insert into private.allowed_auth_emails(email,business_id,role) values ('stage5@example.invalid','51000000-0000-4000-8000-000000000001','admin');
insert into auth.users(id,email,aud,role,created_at,updated_at) values ('52000000-0000-4000-8000-000000000001','stage5@example.invalid','authenticated','authenticated',now(),now());
insert into public.business_members(business_id,user_id,role) values ('51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001','admin');
insert into public.business_settings(business_id,owner_name,monthly_fixed_costs) values ('51000000-0000-4000-8000-000000000001','Stage 5',10);
insert into public.sporadic_expenses(business_id,name,amount,spent_at,funding_source) values ('51000000-0000-4000-8000-000000000001','Gasto teste',5,'2026-09-03','business');

insert into public.customers(id,business_id,name,phone,source,marketing_consent,active) values
 ('53000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','Cliente WhatsApp','11911111111','WhatsApp',false,true),
 ('53000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000001','Cliente Rua','11922222222','Rua',false,true);

insert into public.products(id,business_id,name,batch_yield,selling_price,production_cost_per_batch,loss_percent,labor_cost_per_batch,minimum_margin_percent,target_margin_percent,active,available) values
 ('54000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','Produto A',10,10,0,0,0,10,20,true,true),
 ('54000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000001','Produto B',10,10,0,0,0,10,20,true,true);

-- 9 September sales on 7 distinct business dates. Customer A buys 6 times, customer B 3.
insert into public.sales(id,business_id,customer_id,total_received,sale_value_snapshot,payment_method,sold_at,variable_fee_snapshot,delivery_cost_snapshot,contribution_snapshot,status,transaction_type,sale_channel,payment_status) values
 ('55000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001',10,10,'pix','2026-09-01 10:00:00-03',0,0,7,'completed','sale','whatsapp','paid'),
 ('55000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001',10,10,'pix','2026-09-02 10:00:00-03',0,0,7,'completed','sale','whatsapp','paid'),
 ('55000000-0000-4000-8000-000000000003','51000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001',8,8,'pix','2026-09-03 10:00:00-03',0,0,5,'completed','sale','whatsapp','paid'),
 ('55000000-0000-4000-8000-000000000004','51000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001',10,10,'cash','2026-09-04 10:00:00-03',0,0,7,'completed','sale','in_person','paid'),
 ('55000000-0000-4000-8000-000000000005','51000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001',10,10,'cash','2026-09-05 10:00:00-03',0,0,7,'completed','sale','in_person','paid'),
 ('55000000-0000-4000-8000-000000000006','51000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001',10,10,'pix','2026-09-06 10:00:00-03',0,0,7,'completed','sale','whatsapp','paid'),
 ('55000000-0000-4000-8000-000000000007','51000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000002',10,10,'cash','2026-09-07 10:00:00-03',0,0,7,'completed','sale','street','paid'),
 ('55000000-0000-4000-8000-000000000008','51000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000002',10,10,'cash','2026-09-07 12:00:00-03',0,0,7,'completed','sale','street','paid'),
 ('55000000-0000-4000-8000-000000000009','51000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000002',10,10,'pix','2026-09-07 14:00:00-03',0,0,7,'completed','sale','street','paid');

-- Sale older than the browser's operational window: it must remain in lifetime BI.
insert into public.sales(id,business_id,customer_id,total_received,sale_value_snapshot,payment_method,sold_at,variable_fee_snapshot,delivery_cost_snapshot,contribution_snapshot,status,transaction_type,sale_channel,payment_status)
values ('55000000-0000-4000-8000-000000000010','51000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000002',10,10,'pix','2026-06-01 10:00:00-03',0,0,7,'completed','sale','street','paid');

-- Cancelled and non-commercial movements must not inflate BI commercial facts.
insert into public.sales(id,business_id,customer_id,total_received,sale_value_snapshot,payment_method,sold_at,variable_fee_snapshot,delivery_cost_snapshot,contribution_snapshot,status,transaction_type,sale_channel,payment_status,cancelled_at,cancel_reason) values
 ('55000000-0000-4000-8000-000000000011','51000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001',100,100,'pix','2026-09-07 16:00:00-03',0,0,97,'cancelled','sale','whatsapp','paid','2026-09-07 16:05:00-03','Truth-table cancellation'),
 ('55000000-0000-4000-8000-000000000012','51000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001',0,0,'cash','2026-09-07 17:00:00-03',0,0,-3,'completed','courtesy','in_person','paid',null,null);

-- Product A: first 7 commercial sales (one promotion). Product B: last 3 lifetime sales.
insert into public.sale_items(business_id,sale_id,product_id,product_name_snapshot,quantity,unit_cost_snapshot,labor_cost_snapshot,unit_price_snapshot)
select '51000000-0000-4000-8000-000000000001',id,'54000000-0000-4000-8000-000000000001','Produto A',1,3,0,sale_value_snapshot
from public.sales where id between '55000000-0000-4000-8000-000000000001'::uuid and '55000000-0000-4000-8000-000000000007'::uuid;
insert into public.sale_items(business_id,sale_id,product_id,product_name_snapshot,quantity,unit_cost_snapshot,labor_cost_snapshot,unit_price_snapshot)
select '51000000-0000-4000-8000-000000000001',id,'54000000-0000-4000-8000-000000000002','Produto B',1,3,0,sale_value_snapshot
from public.sales where id in ('55000000-0000-4000-8000-000000000008','55000000-0000-4000-8000-000000000009','55000000-0000-4000-8000-000000000010');

set local role authenticated;
select set_config('request.jwt.claim.sub','52000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"52000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);

select is(public.get_nat_schema_version(),'2026-09-13.intelligence-crm-trust.1','Stage 5 schema version is authoritative');
select is((public.get_business_intelligence_snapshot_v2('51000000-0000-4000-8000-000000000001')->'readiness'->>'salesCount')::int,10,'lifetime snapshot includes the old sale but excludes cancelled/non-commercial rows');
select ok((public.get_business_intelligence_snapshot_v2('51000000-0000-4000-8000-000000000001')->'readiness'->>'ready')::boolean,'10 sales across at least 7 business dates unlock confidence');
select is((public.get_business_intelligence_snapshot_v2('51000000-0000-4000-8000-000000000001')->'metricContext'->>'timezone')::text,'America/Sao_Paulo','metric context exposes business timezone');
select is((public.get_business_intelligence_snapshot_v2('51000000-0000-4000-8000-000000000001')->'metricContext'->>'history')::text,'lifetime','metric context declares lifetime history');

select is((select (p->>'units')::numeric from jsonb_array_elements(public.get_business_intelligence_snapshot_v2('51000000-0000-4000-8000-000000000001')->'products') p where p->>'productId'='54000000-0000-4000-8000-000000000001'),7::numeric,'product A lifetime units are authoritative');
select is((select (p->>'investedCost')::numeric from jsonb_array_elements(public.get_business_intelligence_snapshot_v2('51000000-0000-4000-8000-000000000001')->'products') p where p->>'productId'='54000000-0000-4000-8000-000000000001'),21::numeric,'product A ROI investment reconciles item snapshots');
select is(round((select (p->>'roiPercent')::numeric from jsonb_array_elements(public.get_business_intelligence_snapshot_v2('51000000-0000-4000-8000-000000000001')->'products') p where p->>'productId'='54000000-0000-4000-8000-000000000001'),2),223.81::numeric,'product A ROI is lifetime and deterministic');

select is((public.get_business_intelligence_snapshot_v2('51000000-0000-4000-8000-000000000001')->'businessRoi'->>'revenue')::numeric,88::numeric,'business ROI uses September economic revenue');
select is((public.get_business_intelligence_snapshot_v2('51000000-0000-4000-8000-000000000001')->'businessRoi'->>'investedCost')::numeric,42::numeric,'business ROI investment includes item cost, fixed cost and sporadic expense');
select is((public.get_business_intelligence_snapshot_v2('51000000-0000-4000-8000-000000000001')->'businessRoi'->>'netReturn')::numeric,46::numeric,'business ROI net return is revenue minus authoritative investment');
select is(round((public.get_business_intelligence_snapshot_v2('51000000-0000-4000-8000-000000000001')->'businessRoi'->>'roiPercent')::numeric,2),109.52::numeric,'business ROI is computed in Lovable Cloud');

select is((public.get_business_intelligence_snapshot_v2('51000000-0000-4000-8000-000000000001')->'promotions'->>'discountedOrders')::int,1,'one promotion is detected from frozen list price');
select is((public.get_business_intelligence_snapshot_v2('51000000-0000-4000-8000-000000000001')->'promotions'->>'discountValue')::numeric,2::numeric,'promotion discount reconciles frozen list versus billed');
select is((public.get_business_intelligence_snapshot_v2('51000000-0000-4000-8000-000000000001')->'promotions'->>'investedCost')::numeric,3::numeric,'promotion ROI investment uses frozen item cost');
select is(round((public.get_business_intelligence_snapshot_v2('51000000-0000-4000-8000-000000000001')->'promotions'->>'roiPercent')::numeric,2),166.67::numeric,'promotion ROI is deterministic');

select is((select (o->>'customers')::int from jsonb_array_elements(public.get_business_intelligence_snapshot_v2('51000000-0000-4000-8000-000000000001')->'origins') o where o->>'source'='WhatsApp'),1,'origin grouping is computed server-side');
select is((select (o->>'orders')::int from jsonb_array_elements(public.get_business_intelligence_snapshot_v2('51000000-0000-4000-8000-000000000001')->'origins') o where o->>'source'='Rua'),4,'origin order count includes lifetime history');

select is(jsonb_array_length(public.get_business_intelligence_drilldown_v1('51000000-0000-4000-8000-000000000001','product','54000000-0000-4000-8000-000000000001')->'rows'),7,'product drill-down has every contributing sale line');
select is((public.get_business_intelligence_drilldown_v1('51000000-0000-4000-8000-000000000001','customer','53000000-0000-4000-8000-000000000002')->'totals'->>'orders')::int,4,'customer drill-down reconciles lifetime orders');
select is((public.get_business_intelligence_drilldown_v1('51000000-0000-4000-8000-000000000001','channel','street')->'totals'->>'orders')::int,4,'channel drill-down includes the old lifetime sale for the selected channel');
select is((public.get_business_intelligence_drilldown_v1('51000000-0000-4000-8000-000000000001','promotion','all')->'totals'->>'discount')::numeric,2::numeric,'promotion drill-down reconciles total discount');

select * from finish();
rollback;

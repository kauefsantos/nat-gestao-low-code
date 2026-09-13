-- Stage 4 regression: billing/cash/receivables, lifetime BI and immutable list prices.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into public.businesses(id,name) values ('f1000000-0000-4000-8000-000000000001','Financial BI truth');
insert into private.allowed_auth_emails(email,business_id,role) values ('finance-bi@example.invalid','f1000000-0000-4000-8000-000000000001','admin');
insert into auth.users(id,email,aud,role,created_at,updated_at) values ('f2000000-0000-4000-8000-000000000001','finance-bi@example.invalid','authenticated','authenticated',now(),now());
insert into public.business_members(business_id,user_id,role) values ('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','admin');
insert into public.business_settings(business_id,owner_name) values ('f1000000-0000-4000-8000-000000000001','Finance BI');
insert into public.customers(id,business_id,name,phone,source,marketing_consent,active)
values ('f3000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','Cliente histórico','11999999999','WhatsApp',false,true);
insert into public.products(id,business_id,name,batch_yield,selling_price,production_cost_per_batch,loss_percent,labor_cost_per_batch,minimum_margin_percent,target_margin_percent,active,available)
values ('f4000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','Produto BI',10,10,0,0,0,10,20,true,true);

insert into public.sales(id,business_id,customer_id,total_received,sale_value_snapshot,payment_method,sold_at,variable_fee_snapshot,contribution_snapshot,status,transaction_type,sale_channel,payment_status)
values ('f5000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000001',100,100,'pix','2026-09-01 12:00:00-03',0,80,'completed','sale','whatsapp','paid');
insert into public.sale_items(business_id,sale_id,product_id,product_name_snapshot,quantity,unit_cost_snapshot,labor_cost_snapshot,unit_price_snapshot)
values ('f1000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000001','Produto BI',10,2,0,10);

insert into public.sales(id,business_id,customer_id,total_received,sale_value_snapshot,payment_method,sold_at,variable_fee_snapshot,contribution_snapshot,status,transaction_type,sale_channel,payment_status,payment_promised_date,payment_due_at)
values ('f5000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000001',0,50,'pix','2026-09-02 12:00:00-03',0,40,'completed','sale','whatsapp','pending','2026-09-20','2026-09-20 09:00:00-03');
insert into public.sale_items(business_id,sale_id,product_id,product_name_snapshot,quantity,unit_cost_snapshot,labor_cost_snapshot,unit_price_snapshot)
values ('f1000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000002','f4000000-0000-4000-8000-000000000001','Produto BI',5,2,0,10);

-- Older than 45 days relative to Stage 4 release; it must still count in lifetime BI.
insert into public.sales(id,business_id,customer_id,total_received,sale_value_snapshot,payment_method,sold_at,variable_fee_snapshot,contribution_snapshot,status,transaction_type,sale_channel,payment_status)
values ('f5000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000001',16,16,'cash','2026-06-01 12:00:00-03',0,10,'completed','sale','in_person','paid');
insert into public.sale_items(business_id,sale_id,product_id,product_name_snapshot,quantity,unit_cost_snapshot,labor_cost_snapshot,unit_price_snapshot)
values ('f1000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000003','f4000000-0000-4000-8000-000000000001','Produto BI',2,2,0,8);

select is((select list_unit_price_snapshot from public.sale_items where sale_id='f5000000-0000-4000-8000-000000000003'),10::numeric,'sale line freezes the list price at creation');
update public.products set selling_price=20 where id='f4000000-0000-4000-8000-000000000001';
select is((select list_unit_price_snapshot from public.sale_items where sale_id='f5000000-0000-4000-8000-000000000003'),10::numeric,'later product price changes do not rewrite the historical list snapshot');

set local role authenticated;
select set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"f2000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);

select is(public.get_nat_schema_version(),'2026-09-13.financial-bi-truth.1','Stage 4 schema version is authoritative');
select is((public.get_financial_truth_snapshot_v1('f1000000-0000-4000-8000-000000000001','2026-09-01')->>'billed')::numeric,150::numeric,'month billing is economic sale value');
select is((public.get_financial_truth_snapshot_v1('f1000000-0000-4000-8000-000000000001','2026-09-01')->>'received')::numeric,100::numeric,'month received is actual cash from customers');
select is((public.get_financial_truth_snapshot_v1('f1000000-0000-4000-8000-000000000001','2026-09-01')->>'receivable')::numeric,50::numeric,'month receivable is only outstanding balance');
select is((public.get_financial_truth_snapshot_v1('f1000000-0000-4000-8000-000000000001','2026-09-01')->>'orders')::integer,2,'paid and pending sales both count as completed orders');
select is((public.get_financial_truth_snapshot_v1('f1000000-0000-4000-8000-000000000001','2026-09-01')->>'paidOrders')::integer,1,'paid order count is separate');
select is((public.get_financial_truth_snapshot_v1('f1000000-0000-4000-8000-000000000001','2026-09-01')->>'pendingOrders')::integer,1,'pending order count is separate');
select is((public.get_business_intelligence_snapshot_v1('f1000000-0000-4000-8000-000000000001')->'readiness'->>'salesCount')::integer,3,'lifetime BI includes sales older than the operational 45-day window');
select is((public.get_business_intelligence_snapshot_v1('f1000000-0000-4000-8000-000000000001')->'promotions'->>'discountedOrders')::integer,1,'promotion history uses frozen list-price snapshots');
select is((public.get_business_intelligence_snapshot_v1('f1000000-0000-4000-8000-000000000001')->'promotions'->>'discountValue')::numeric,4::numeric,'historical discount remains the frozen list minus economic sale value');

select * from finish();
rollback;

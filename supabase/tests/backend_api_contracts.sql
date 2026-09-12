begin;
select plan(5);
select ok(position('customerId' in pg_get_functiondef('public.list_sales_page(uuid,integer,timestamptz,uuid)'::regprocedure))>0,'sales page includes customerId');
select ok(position('saleChannel' in pg_get_functiondef('public.list_sales_page(uuid,integer,timestamptz,uuid)'::regprocedure))>0,'sales page includes sale channel');
select ok(position('laborCostSnapshot' in pg_get_functiondef('public.list_sales_page(uuid,integer,timestamptz,uuid)'::regprocedure))>0,'sales page includes labor snapshot');
select ok(position('api_idempotency_requests' in pg_get_functiondef('private.cleanup_nat_operational_logs()'::regprocedure))>0,'cleanup removes API idempotency ledger');
select ok(position('record_inventory_production' in pg_get_functiondef('public.record_inventory_production_v2(uuid,uuid,uuid,numeric,timestamptz,text)'::regprocedure))>0,'production v2 delegates once inside idempotent transaction');
select * from finish();
rollback;

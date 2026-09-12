begin;

select plan(12);

select ok(to_regprocedure('public.record_inventory_production_v2(uuid,uuid,uuid,numeric,timestamptz,text)') is not null,'record_inventory_production_v2 exists');
select ok(to_regclass('public.api_idempotency_requests') is not null,'api idempotency ledger exists');
select ok(has_function_privilege('authenticated','public.apply_nat_transition_v2(uuid,uuid,jsonb)','EXECUTE'),'authenticated can execute transition API');
select ok(has_function_privilege('authenticated','public.record_inventory_production_v2(uuid,uuid,uuid,numeric,timestamptz,text)','EXECUTE'),'authenticated can execute idempotent production API');
select ok(has_function_privilege('authenticated','public.list_sales_page(uuid,integer,timestamptz,uuid)','EXECUTE'),'authenticated can execute paginated sales API');
select ok(has_function_privilege('authenticated','public.save_sale_items_v3(uuid,uuid,jsonb,numeric,text,timestamptz,uuid,text)','EXECUTE'),'legacy sale v3 remains as compatibility facade');
select ok(position('save_sale_items_v4' in pg_get_functiondef('public.save_sale_items_v3(uuid,uuid,jsonb,numeric,text,timestamptz,uuid,text)'::regprocedure))>0,'legacy sale v3 delegates to current sale rules');
select ok(not has_function_privilege('authenticated','public.save_sale_items_v3_impl(uuid,uuid,jsonb,numeric,text,timestamptz,uuid,text)','EXECUTE'),'unsafe sale v3 implementation is internal only');
select ok(not has_function_privilege('authenticated','public.save_sale_items_v4_impl(uuid,uuid,jsonb,numeric,text,timestamptz,uuid,text,text,numeric,text,boolean)','EXECUTE'),'sale v4 implementation is internal only');
select ok(position('create_sale' in pg_get_functiondef('public.apply_nat_transition(uuid,jsonb)'::regprocedure))>0,'transition supports atomic create_sale');
select ok(position('pg_advisory_xact_lock' in pg_get_functiondef('public.save_supply(uuid,uuid,text,text,numeric,text,numeric,date)'::regprocedure))>0,'save_supply serializes concurrent writes');
select ok((select relforcerowsecurity from pg_class where oid='public.api_idempotency_requests'::regclass),'idempotency ledger has forced RLS');

select * from finish();
rollback;

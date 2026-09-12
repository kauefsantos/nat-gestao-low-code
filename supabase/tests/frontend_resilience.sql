begin;
select plan(14);

select has_function('public','claim_push_delivery',array['uuid','uuid','uuid','date','smallint','integer','integer'],'push has atomic claim function');
select has_function('public','fail_push_delivery',array['uuid','boolean','integer','text','text','integer','integer'],'push has retry/DLQ function');
select has_function('public','list_due_push_retries',array['integer'],'push has persistent retry queue reader');
select has_function('public','save_calendar_event_v3',array['uuid','uuid','uuid','text','date','time without time zone','text','text','text','text','text','text','boolean'],'calendar has idempotent save v3');
select has_function('private','dispatch_nat_push_local_tick',array[]::text[],'scheduler has timezone-aware local tick');
select has_function('private','reconcile_nat_push_dispatches',array[]::text[],'scheduler has HTTP reconciliation');
select has_function('private','cleanup_frontend_resilience_logs',array[]::text[],'resilience ledgers have retention cleanup');
select has_function('public','claim_content_ai_provider_budget',array['uuid','uuid'],'AI has provider budget claim');
select has_function('public','content_ai_circuit_allows',array['uuid'],'AI has circuit breaker read');
select has_function('public','record_content_ai_provider_result',array['uuid','boolean','boolean'],'AI has circuit breaker feedback');

select ok(position("status='processing'" in pg_get_functiondef('public.claim_push_delivery(uuid,uuid,uuid,date,smallint,integer,integer)'::regprocedure))>0,'push claim reserves processing state before provider effect');
select ok(position("dead_letter" in pg_get_functiondef('public.fail_push_delivery(uuid,boolean,integer,text,text,integer,integer)'::regprocedure))>0,'push failures can end in dead-letter');
select ok(position("America/Sao_Paulo" in pg_get_functiondef('private.dispatch_nat_push_local_tick()'::regprocedure))>0,'scheduler computes business hour with IANA timezone');
select ok(exists(select 1 from cron.job where jobname='nat-push-local-tick' and schedule='0 * * * *'),'timezone-aware hourly scheduler is installed');

select * from finish();
rollback;

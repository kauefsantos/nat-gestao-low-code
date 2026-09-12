-- Integrations/automations regression coverage.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

select has_column('public','business_settings','timezone','business timezone is explicit');
select has_column('public','notification_delivery_log','status','push ledger has status');
select has_column('public','notification_delivery_log','attempt_count','push ledger tracks attempts');
select has_column('public','notification_delivery_log','next_retry_at','push ledger tracks retries');
select has_column('public','ai_generation_log','provider_attempt_count','AI tracks provider attempts');
select has_column('public','ai_generation_log','cost_quota_consumed','AI separates provider cost quota');
select ok(not has_function_privilege('authenticated','public.claim_push_delivery(uuid,uuid,uuid,date,smallint,integer,integer)','execute'),'authenticated cannot claim push delivery');
select ok(not has_function_privilege('authenticated','public.get_push_cron_secret()','execute'),'authenticated cannot read cron secret');
select ok(not has_function_privilege('authenticated','public.claim_content_ai_provider_quota(uuid,integer)','execute'),'authenticated cannot consume AI provider quota');
select ok(not has_function_privilege('authenticated','private.reconcile_nat_push_dispatches()','execute'),'authenticated cannot reconcile scheduler');

insert into public.businesses(id,name) values ('aaaa0000-0000-4000-8000-000000000001','Automation Test');
insert into private.allowed_auth_emails(email,business_id,role) values ('automation-test@example.invalid','aaaa0000-0000-4000-8000-000000000001','admin');
insert into auth.users(id,email,aud,role,created_at,updated_at) values ('bbbb0000-0000-4000-8000-000000000001','automation-test@example.invalid','authenticated','authenticated',now(),now());
insert into public.business_members(business_id,user_id,role) values ('aaaa0000-0000-4000-8000-000000000001','bbbb0000-0000-4000-8000-000000000001','admin');
insert into public.business_settings(business_id,owner_name,payment_fee_percent) values ('aaaa0000-0000-4000-8000-000000000001','Automation Test',0);
insert into public.push_subscriptions(id,business_id,user_id,endpoint,p256dh,auth) values ('cccc0000-0000-4000-8000-000000000001','aaaa0000-0000-4000-8000-000000000001','bbbb0000-0000-4000-8000-000000000001','https://push.example.invalid/test','abcdefghijklmnopqrstuvwxyz0123456789','abcdefghijklmno');

set local role service_role;
select ok((public.claim_push_delivery('aaaa0000-0000-4000-8000-000000000001'::uuid,'cccc0000-0000-4000-8000-000000000001'::uuid,'bbbb0000-0000-4000-8000-000000000001'::uuid,'2099-12-31'::date,9::smallint,1,120)->>'claimed')::boolean,'first delivery claim wins');
select is((
  select count(*)::bigint
  from generate_series(1,4)
  where (public.claim_push_delivery('aaaa0000-0000-4000-8000-000000000001'::uuid,'cccc0000-0000-4000-8000-000000000001'::uuid,'bbbb0000-0000-4000-8000-000000000001'::uuid,'2099-12-31'::date,9::smallint,1,120)->>'claimed')::boolean
),0::bigint,'four competing replays lose; one of five claims wins');
select is((select count(*)::bigint from public.notification_delivery_log where subscription_id='cccc0000-0000-4000-8000-000000000001' and local_date='2099-12-31'),1::bigint,'duplicate claims still create one ledger row');

update public.notification_delivery_log set locked_at=now()-interval '5 minutes' where subscription_id='cccc0000-0000-4000-8000-000000000001' and local_date='2099-12-31';
select ok((public.claim_push_delivery('aaaa0000-0000-4000-8000-000000000001'::uuid,'cccc0000-0000-4000-8000-000000000001'::uuid,'bbbb0000-0000-4000-8000-000000000001'::uuid,'2099-12-31'::date,9::smallint,1,120)->>'claimed')::boolean,'expired processing lease can be reclaimed');
select is((select attempt_count from public.notification_delivery_log where subscription_id='cccc0000-0000-4000-8000-000000000001' and local_date='2099-12-31'),2,'lease reclaim increments attempt count');

select is((public.fail_push_delivery((select id from public.notification_delivery_log where subscription_id='cccc0000-0000-4000-8000-000000000001' and local_date='2099-12-31'),false,503,'TRANSIENT','temporary',1,5)->>'status'),'retry','503 schedules retry');
select ok((select next_retry_at>now() from public.notification_delivery_log where subscription_id='cccc0000-0000-4000-8000-000000000001' and local_date='2099-12-31'),'retry has future next_retry_at');
update public.notification_delivery_log set next_retry_at=now()-interval '1 second' where subscription_id='cccc0000-0000-4000-8000-000000000001' and local_date='2099-12-31';
select ok((public.claim_push_delivery('aaaa0000-0000-4000-8000-000000000001'::uuid,'cccc0000-0000-4000-8000-000000000001'::uuid,'bbbb0000-0000-4000-8000-000000000001'::uuid,'2099-12-31'::date,9::smallint,1,120)->>'claimed')::boolean,'due retry can be claimed');
select is((public.fail_push_delivery((select id from public.notification_delivery_log where subscription_id='cccc0000-0000-4000-8000-000000000001' and local_date='2099-12-31'),false,503,'TRANSIENT','temporary',1,3)->>'status'),'dead_letter','max attempts moves delivery to dead letter');

select ok((public.claim_push_delivery('aaaa0000-0000-4000-8000-000000000001'::uuid,'cccc0000-0000-4000-8000-000000000001'::uuid,'bbbb0000-0000-4000-8000-000000000001'::uuid,'2099-12-30'::date,12::smallint,1,120)->>'claimed')::boolean,'second test delivery claim succeeds');
select is((public.fail_push_delivery((select id from public.notification_delivery_log where subscription_id='cccc0000-0000-4000-8000-000000000001' and local_date='2099-12-30'),true,410,'SUBSCRIPTION_EXPIRED','gone',null,5)->>'status'),'expired','410/permanent failure is expired');

select is((select timezone from public.business_settings where business_id='aaaa0000-0000-4000-8000-000000000001'),'America/Sao_Paulo'::text,'Sao Paulo is the default business timezone');
select throws_ok(
  $$update public.business_settings set timezone='Mars/Olympus' where business_id='aaaa0000-0000-4000-8000-000000000001'$$,
  '23514',null,'invalid IANA timezone is rejected by the constraint'
);

select public.claim_content_ai_quota('aaaa0000-0000-4000-8000-000000000001','bbbb0000-0000-4000-8000-000000000001','feed',100) as ai_log_id \gset
select ok(public.claim_content_ai_provider_quota(:'ai_log_id',100),'provider quota can be claimed once');
select ok(public.claim_content_ai_provider_quota(:'ai_log_id',100),'same generation does not consume provider quota twice');
select is(public.increment_content_ai_provider_attempt(:'ai_log_id'),1,'first provider attempt increments same generation');
select is(public.increment_content_ai_provider_attempt(:'ai_log_id'),2,'retry increments attempt count without new cost unit');
select is((select count(*)::bigint from public.ai_generation_log where id=:'ai_log_id' and cost_quota_consumed=true),1::bigint,'one logical generation consumes one cost quota unit');
reset role;

select is((select count(*)::bigint from cron.job where jobname='nat-push-reconcile'),1::bigint,'exactly one push reconciler job exists');
select lives_ok($$select private.reconcile_nat_push_jobs()$$,'job reconciliation is idempotent');
select is((select count(*)::bigint from cron.job where jobname='nat-push-reconcile'),1::bigint,'reconciliation does not duplicate reconciler job');

select * from finish();
rollback;

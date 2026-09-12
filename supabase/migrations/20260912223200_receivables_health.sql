begin;

create or replace function public.get_integration_health(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_push jsonb;v_jobs jsonb;v_ai jsonb;
begin
  if not private.is_business_admin(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  with deliveries as(
    select status,created_at,next_retry_at from public.notification_delivery_log where business_id=p_business_id
    union all
    select status,created_at,next_retry_at from public.business_alert_delivery_log where business_id=p_business_id
  )
  select jsonb_build_object(
    'sent24h',count(*) filter(where status='sent' and created_at>=now()-interval '24 hours'),
    'retrying',count(*) filter(where status='retry'),
    'deadLetter',count(*) filter(where status='dead_letter'),
    'expired24h',count(*) filter(where status='expired' and created_at>=now()-interval '24 hours'),
    'oldestRetryAt',min(next_retry_at) filter(where status='retry')
  ) into v_push from deliveries;
  select coalesce(jsonb_agg(jsonb_build_object(
    'name',job_name,'lastStartedAt',last_started_at,'lastSucceededAt',last_succeeded_at,
    'lastFailedAt',last_failed_at,'status',last_status,
    'stale',case
      when job_name in('nat-push-local-tick','nat-executive-summary-recovery') then coalesce(last_started_at,'epoch'::timestamptz)<now()-interval '2 hours'
      when job_name in('nat-receivables-tick','nat-receivables-status') then coalesce(last_started_at,'epoch'::timestamptz)<now()-interval '30 minutes'
      else coalesce(last_started_at,'epoch'::timestamptz)<now()-interval '15 minutes'
    end
  ) order by job_name),'[]'::jsonb) into v_jobs from private.nat_job_heartbeats;
  select jsonb_build_object(
    'enabled',false,
    'calls24h',count(*) filter(where provider_called_at>=now()-interval '24 hours'),
    'failed24h',count(*) filter(where provider_called_at>=now()-interval '24 hours' and status<>'succeeded'),
    'circuitOpenUntil',(select opened_until from private.nat_external_circuit where service='content-ai' and business_id=p_business_id)
  ) into v_ai from public.ai_generation_log where business_id=p_business_id;
  return jsonb_build_object('push',coalesce(v_push,'{}'::jsonb),'jobs',v_jobs,'ai',coalesce(v_ai,'{}'::jsonb),'generatedAt',now());
end $$;

revoke all on function public.get_integration_health(uuid) from public,anon;
grant execute on function public.get_integration_health(uuid) to authenticated;

commit;

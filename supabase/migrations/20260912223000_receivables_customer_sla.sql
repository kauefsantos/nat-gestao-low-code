begin;

-- Receivables: preserve economic revenue separately from cash actually received.
alter table public.sales add column if not exists sale_value_snapshot numeric;
update public.sales set sale_value_snapshot=total_received where sale_value_snapshot is null;
alter table public.sales alter column sale_value_snapshot set default 0;
alter table public.sales alter column sale_value_snapshot set not null;
alter table public.sales add column if not exists payment_status text not null default 'paid';
alter table public.sales add column if not exists payment_promised_date date;
alter table public.sales add column if not exists payment_promised_time time;
alter table public.sales add column if not exists payment_due_at timestamptz;
alter table public.sales add column if not exists paid_at timestamptz;
alter table public.sales add column if not exists payment_critical_at timestamptz;
update public.sales set paid_at=coalesce(paid_at,sold_at) where payment_status='paid' and transaction_type='sale';

alter table public.customers add column if not exists credit_status text not null default 'normal';

do $$ begin
  if not exists(select 1 from pg_constraint where conname='sales_sale_value_nonnegative') then
    alter table public.sales add constraint sales_sale_value_nonnegative check(sale_value_snapshot>=0);
  end if;
  if not exists(select 1 from pg_constraint where conname='sales_payment_status_check') then
    alter table public.sales add constraint sales_payment_status_check check(payment_status in('paid','pending'));
  end if;
  if not exists(select 1 from pg_constraint where conname='sales_pending_receivable_shape') then
    alter table public.sales add constraint sales_pending_receivable_shape check(
      payment_status<>'pending' or (
        transaction_type='sale' and customer_id is not null and payment_promised_date is not null
        and payment_due_at is not null and total_received=0
      )
    );
  end if;
  if not exists(select 1 from pg_constraint where conname='customers_credit_status_check') then
    alter table public.customers add constraint customers_credit_status_check check(credit_status in('normal','critical'));
  end if;
end $$;

create index if not exists sales_receivables_due_idx
  on public.sales(payment_due_at,business_id)
  where status='completed' and payment_status='pending';
create index if not exists sales_customer_receivables_idx
  on public.sales(business_id,customer_id,payment_status,payment_critical_at)
  where customer_id is not null;

create or replace function private.sale_receivable_defaults()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.transaction_type='sale' then
    if new.sale_value_snapshot is null or new.sale_value_snapshot=0 then new.sale_value_snapshot:=coalesce(new.total_received,0); end if;
    if new.payment_status is null then new.payment_status:='paid'; end if;
    if new.payment_status='paid' and new.paid_at is null then new.paid_at:=new.sold_at; end if;
  else
    new.sale_value_snapshot:=0;
    new.payment_status:='paid';
    new.payment_promised_date:=null;
    new.payment_promised_time:=null;
    new.payment_due_at:=null;
    new.paid_at:=null;
    new.payment_critical_at:=null;
  end if;
  return new;
end $$;

drop trigger if exists sales_receivable_defaults on public.sales;
create trigger sales_receivable_defaults before insert on public.sales
for each row execute function private.sale_receivable_defaults();

create or replace function private.receivable_due_at(p_date date,p_time time default null)
returns timestamptz language sql immutable set search_path='' as $$
  select make_timestamptz(
    extract(year from p_date)::int,extract(month from p_date)::int,extract(day from p_date)::int,
    extract(hour from coalesce(p_time,time '09:00'))::int,extract(minute from coalesce(p_time,time '09:00'))::int,0,
    'America/Sao_Paulo'
  )
$$;

create or replace function private.refresh_customer_credit_status()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_customer uuid;
begin
  for v_customer in
    select distinct value from unnest(array[old.customer_id,new.customer_id]) value where value is not null
  loop
    update public.customers c set
      credit_status=case when exists(
        select 1 from public.sales s
        where s.business_id=c.business_id and s.customer_id=c.id and s.status='completed'
          and s.payment_status='pending' and s.payment_critical_at is not null
      ) then 'critical' else 'normal' end,
      updated_at=now()
    where c.id=v_customer and c.business_id=coalesce(new.business_id,old.business_id);
  end loop;
  return new;
end $$;

drop trigger if exists sales_refresh_customer_credit on public.sales;
create trigger sales_refresh_customer_credit
after update of status,payment_status,payment_critical_at,customer_id on public.sales
for each row execute function private.refresh_customer_credit_status();

-- Customer records: contact is required except for street customers.
create or replace function private.is_street_customer_source(p_source text)
returns boolean language sql immutable set search_path='' as $$
  select lower(btrim(coalesce(p_source,''))) in('rua','street')
$$;

create or replace function public.save_customer(
  p_business_id uuid,p_id uuid,p_name text,p_phone text default null,p_instagram text default null,
  p_source text default null,p_marketing_consent boolean default false,p_notes text default null,p_active boolean default true
) returns void language plpgsql security definer set search_path='' as $$
declare
  v_previous_consent boolean;v_exists boolean;v_notes text:=nullif(btrim(coalesce(p_notes,'')),'');v_phone text:=nullif(btrim(coalesce(p_phone,'')),'');
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_id is null or char_length(btrim(coalesce(p_name,''))) not between 1 and 160 then raise exception 'Dados do cliente inválidos.' using errcode='22023'; end if;
  if not private.is_street_customer_source(p_source) and v_phone is null then raise exception 'Informe o telefone do cliente. Apenas clientes de rua podem ficar sem contato.' using errcode='22023'; end if;
  if v_notes is not null and char_length(v_notes)>500 then raise exception 'Observações devem ter no máximo 500 caracteres.' using errcode='22023'; end if;
  if v_notes is not null and (v_notes ~ '([0-9]{3}[.][0-9]{3}[.][0-9]{3}-[0-9]{2})|([0-9]{2}[.][0-9]{3}[.][0-9]{3}/[0-9]{4}-[0-9]{2})|(^|[^0-9])[0-9]{11}([^0-9]|$)|(^|[^0-9])[0-9]{14}([^0-9]|$)') then raise exception 'Não registre CPF/CNPJ nas observações.' using errcode='22023'; end if;
  select true,marketing_consent into v_exists,v_previous_consent from public.customers where id=p_id and business_id=p_business_id;
  insert into public.customers(id,business_id,name,phone,instagram,source,marketing_consent,notes,active)
  values(p_id,p_business_id,btrim(p_name),v_phone,nullif(btrim(coalesce(p_instagram,'')),''),nullif(btrim(coalesce(p_source,'')),''),coalesce(p_marketing_consent,false),v_notes,coalesce(p_active,true))
  on conflict(id) do update set name=excluded.name,phone=excluded.phone,instagram=excluded.instagram,source=excluded.source,
    marketing_consent=excluded.marketing_consent,notes=excluded.notes,active=excluded.active,updated_at=now()
  where public.customers.business_id=p_business_id;
  if not exists(select 1 from public.customers c where c.id=p_id and c.business_id=p_business_id) then raise exception 'O identificador do cliente pertence a outra empresa.' using errcode='42501'; end if;
  if not coalesce(v_exists,false) or coalesce(v_previous_consent,false) is distinct from coalesce(p_marketing_consent,false) then
    insert into public.customer_marketing_consents(business_id,customer_id,status,source,notice_version,actor_user_id,occurred_at,expires_at)
    values(p_business_id,p_id,case when coalesce(p_marketing_consent,false) then 'granted' else 'revoked' end,'customer_editor','privacy-2026-09',auth.uid(),now(),case when coalesce(p_marketing_consent,false) then now()+interval '24 months' else null end);
  end if;
end $$;

create or replace function public.get_customers_snapshot(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',c.id,'name',c.name,'phone',c.phone,'instagram',c.instagram,'source',c.source,
    'marketingConsent',c.marketing_consent,'notes',c.notes,'active',c.active,'creditStatus',c.credit_status,
    'createdAt',c.created_at,'updatedAt',c.updated_at,
    'consentStatus',cm.status,'consentGrantedAt',case when cm.status='granted' then cm.occurred_at else null end,
    'consentExpiresAt',case when cm.status='granted' then cm.expires_at else null end,'consentNoticeVersion',cm.notice_version
  ) order by c.name)
  from public.customers c
  left join lateral(
    select m.status,m.occurred_at,m.expires_at,m.notice_version from public.customer_marketing_consents m
    where m.business_id=c.business_id and m.customer_id=c.id order by m.occurred_at desc,m.id desc limit 1
  ) cm on true where c.business_id=p_business_id),'[]'::jsonb);
end $$;

create or replace function public.erase_customer_privacy_v1(p_business_id uuid,p_customer_id uuid,p_reason text default 'Solicitação de privacidade')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_exists boolean;v_sales bigint;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  select exists(select 1 from public.customers where id=p_customer_id and business_id=p_business_id) into v_exists;
  if not v_exists then raise exception 'Cliente não encontrado.' using errcode='P0002'; end if;
  if exists(select 1 from public.sales where business_id=p_business_id and customer_id=p_customer_id and status='completed' and payment_status='pending') then
    raise exception 'Quite ou cancele os pagamentos pendentes antes de excluir os dados pessoais deste cliente.' using errcode='22023';
  end if;
  perform set_config('app.audit_reason','privacy_erasure',true);
  select count(*) into v_sales from public.sales where business_id=p_business_id and customer_id=p_customer_id;
  update public.sales set customer_id=null,updated_at=now() where business_id=p_business_id and customer_id=p_customer_id;
  delete from public.customers where business_id=p_business_id and id=p_customer_id;
  insert into public.privacy_request_log(business_id,customer_id,request_type,result,reason,actor_user_id)
  values(p_business_id,p_customer_id,'erasure','completed',left(coalesce(nullif(btrim(p_reason),''),'Solicitação de privacidade'),200),auth.uid());
  return jsonb_build_object('customerId',p_customer_id,'detachedSales',v_sales,'result','completed');
end $$;

-- Transition v4 enriches a normal sale write with receivable semantics while preserving v3 compatibility.
create or replace function public.apply_nat_transition_v4(p_business_id uuid,p_request_id uuid,p_operations jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_result jsonb;v_op jsonb;v_type text;v_payload jsonb;v_id uuid;v_status text;v_customer uuid;
  v_promised_date date;v_promised_time time;v_sale_date date;v_due timestamptz;v_updated text;v_sale_value numeric;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  v_result:=public.apply_nat_transition_v3(p_business_id,p_request_id,p_operations);
  for v_op in select value from jsonb_array_elements(p_operations) loop
    v_type:=v_op->>'type';
    if v_type<>'create_sale' then continue; end if;
    v_payload:=coalesce(v_op->'payload','{}'::jsonb);
    v_id:=nullif(v_payload->>'id','')::uuid;
    if coalesce(v_payload->>'transactionType','sale')<>'sale' then continue; end if;
    v_status:=coalesce(nullif(v_payload->>'paymentStatus',''),'paid');
    if v_status not in('paid','pending') then raise exception 'Situação de pagamento inválida.' using errcode='22023'; end if;
    v_sale_value:=coalesce(nullif(v_payload->>'saleValue','')::numeric,nullif(v_payload->>'totalReceived','')::numeric,0);
    if v_sale_value<0 then raise exception 'Valor da venda inválido.' using errcode='22023'; end if;
    if v_status='pending' then
      begin v_customer:=nullif(v_payload->>'customerId','')::uuid;exception when others then v_customer:=null;end;
      if v_customer is null then raise exception 'Venda fiada exige cliente cadastrado.' using errcode='22023'; end if;
      v_promised_date:=nullif(v_payload->>'paymentPromisedDate','')::date;
      if v_promised_date is null then raise exception 'Informe a data prometida para pagamento.' using errcode='22023'; end if;
      v_sale_date:=((v_payload->>'soldAt')::timestamptz at time zone 'America/Sao_Paulo')::date;
      if v_promised_date<v_sale_date then raise exception 'A data prometida não pode ser anterior à venda.' using errcode='22023'; end if;
      v_promised_time:=nullif(v_payload->>'paymentPromisedTime','')::time;
      if v_promised_date=v_sale_date and v_promised_time is null then raise exception 'Quando o pagamento é prometido para o mesmo dia, informe o horário.' using errcode='22023'; end if;
      v_due:=private.receivable_due_at(v_promised_date,v_promised_time);
      update public.sales set sale_value_snapshot=v_sale_value,total_received=0,payment_status='pending',
        payment_promised_date=v_promised_date,payment_promised_time=v_promised_time,payment_due_at=v_due,paid_at=null,payment_critical_at=null,updated_at=now()
      where business_id=p_business_id and id=v_id;
    else
      update public.sales set sale_value_snapshot=v_sale_value,total_received=v_sale_value,payment_status='paid',
        payment_promised_date=null,payment_promised_time=null,payment_due_at=null,paid_at=coalesce(paid_at,sold_at),payment_critical_at=null,updated_at=now()
      where business_id=p_business_id and id=v_id;
    end if;
    select updated_at::text into v_updated from public.sales where business_id=p_business_id and id=v_id;
    if v_updated is not null then v_result:=jsonb_set(v_result,array['sales',v_id::text],to_jsonb(v_updated),true);end if;
  end loop;
  return v_result;
end $$;

create or replace function public.mark_sale_paid_v1(p_business_id uuid,p_sale_id uuid,p_payment_method text,p_expected_updated_at text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_sale public.sales%rowtype;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_payment_method not in('pix','cash','card','other') then raise exception 'Forma de pagamento inválida.' using errcode='22023'; end if;
  perform private.assert_nat_version('sale',p_business_id,p_sale_id,p_expected_updated_at);
  select * into v_sale from public.sales where business_id=p_business_id and id=p_sale_id for update;
  if not found then raise exception 'Venda não encontrada.' using errcode='P0002'; end if;
  if v_sale.status<>'completed' or v_sale.transaction_type<>'sale' then raise exception 'Somente venda concluída pode ser quitada.' using errcode='22023'; end if;
  if v_sale.payment_status='paid' then return jsonb_build_object('updatedAt',v_sale.updated_at,'amount',v_sale.total_received,'alreadyPaid',true); end if;
  update public.sales set payment_status='paid',total_received=sale_value_snapshot,payment_method=p_payment_method,paid_at=now(),updated_at=now()
    where business_id=p_business_id and id=p_sale_id returning * into v_sale;
  return jsonb_build_object('updatedAt',v_sale.updated_at,'amount',v_sale.total_received,'alreadyPaid',false);
end $$;

create or replace function public.mark_receivable_critical_v1(p_sale_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.sales set payment_critical_at=coalesce(payment_critical_at,now()),updated_at=now()
  where id=p_sale_id and status='completed' and payment_status='pending';
end $$;

-- Generic reliable delivery ledger for receivable alerts and executive summaries.
create table if not exists public.business_alert_delivery_log(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  alert_key text not null,
  alert_type text not null check(alert_type in('receivable_5h','receivable_24h','receivable_critical','daily_summary')),
  entity_id uuid,
  title text not null,
  body text not null,
  target_url text not null default '/dashboard',
  status text not null default 'processing' check(status in('processing','retry','sent','expired','dead_letter')),
  attempt_count integer not null default 1,
  provider_status integer,
  last_error_code text,
  last_error_message text,
  next_retry_at timestamptz,
  locked_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(subscription_id,alert_key)
);
create index if not exists business_alert_due_retry_idx on public.business_alert_delivery_log(next_retry_at) where status='retry';
alter table public.business_alert_delivery_log enable row level security;

create or replace function public.claim_business_alert_delivery(
  p_business_id uuid,p_subscription_id uuid,p_alert_key text,p_alert_type text,p_entity_id uuid,p_title text,p_body text,p_target_url text,p_lease_seconds integer default 120
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_status text;v_attempt integer;v_claimed boolean:=false;v_now timestamptz:=now();
begin
  if p_alert_type not in('receivable_5h','receivable_24h','receivable_critical','daily_summary') or nullif(btrim(p_alert_key),'') is null then raise exception 'Alerta inválido.' using errcode='22023';end if;
  insert into public.business_alert_delivery_log(business_id,subscription_id,alert_key,alert_type,entity_id,title,body,target_url,status,attempt_count,locked_at,updated_at)
  values(p_business_id,p_subscription_id,p_alert_key,p_alert_type,p_entity_id,left(p_title,120),left(p_body,500),coalesce(nullif(p_target_url,''),'/dashboard'),'processing',1,v_now,v_now)
  on conflict(subscription_id,alert_key) do update set
    status='processing',attempt_count=public.business_alert_delivery_log.attempt_count+1,locked_at=v_now,next_retry_at=null,updated_at=v_now,
    provider_status=null,last_error_code=null,last_error_message=null,title=excluded.title,body=excluded.body,target_url=excluded.target_url
  where (public.business_alert_delivery_log.status='retry' and coalesce(public.business_alert_delivery_log.next_retry_at,'epoch'::timestamptz)<=v_now)
     or (public.business_alert_delivery_log.status='processing' and coalesce(public.business_alert_delivery_log.locked_at,'epoch'::timestamptz)<=v_now-make_interval(secs=>p_lease_seconds))
  returning id,status,attempt_count into v_id,v_status,v_attempt;
  if found then v_claimed:=true;else select id,status,attempt_count into v_id,v_status,v_attempt from public.business_alert_delivery_log where subscription_id=p_subscription_id and alert_key=p_alert_key;end if;
  return jsonb_build_object('claimed',v_claimed,'id',v_id,'status',v_status,'attemptCount',v_attempt);
end $$;

create or replace function public.complete_business_alert_delivery(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.business_alert_delivery_log set status='sent',sent_at=now(),locked_at=null,next_retry_at=null,updated_at=now(),provider_status=null,last_error_code=null,last_error_message=null
  where id=p_id and status='processing';
  if not found then raise exception 'Entrega de alerta não está em processamento.' using errcode='40001';end if;
end $$;

create or replace function public.fail_business_alert_delivery(
  p_id uuid,p_permanent boolean,p_provider_status integer default null,p_error_code text default null,p_error_message text default null,p_retry_after_seconds integer default null,p_max_attempts integer default 5
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_attempt integer;v_status text;v_delay integer;v_next timestamptz;
begin
  select attempt_count into v_attempt from public.business_alert_delivery_log where id=p_id for update;
  if not found then raise exception 'Entrega de alerta não encontrada.' using errcode='22023';end if;
  if p_permanent then v_status:='expired';v_next:=null;
  elsif v_attempt>=greatest(1,p_max_attempts) then v_status:='dead_letter';v_next:=null;
  else v_status:='retry';v_delay:=coalesce(nullif(p_retry_after_seconds,0),case v_attempt when 1 then 60 when 2 then 300 when 3 then 900 else 3600 end);
    v_next:=now()+make_interval(secs=>v_delay);end if;
  update public.business_alert_delivery_log set status=v_status,provider_status=p_provider_status,last_error_code=left(p_error_code,80),last_error_message=left(p_error_message,240),next_retry_at=v_next,locked_at=null,updated_at=now() where id=p_id;
  return jsonb_build_object('status',v_status,'nextRetryAt',v_next,'attemptCount',v_attempt);
end $$;

create or replace function public.list_due_business_alert_retries(p_limit integer default 100)
returns table(delivery_id uuid,business_id uuid,subscription_id uuid,alert_key text,alert_type text,entity_id uuid,title text,body text,target_url text)
language sql security definer set search_path='' as $$
  select l.id,l.business_id,l.subscription_id,l.alert_key,l.alert_type,l.entity_id,l.title,l.body,l.target_url
  from public.business_alert_delivery_log l join public.push_subscriptions s on s.id=l.subscription_id and s.enabled=true
  where l.status='retry' and l.next_retry_at<=now() order by l.next_retry_at,l.created_at
  limit least(greatest(coalesce(p_limit,100),1),500)
$$;

create or replace function public.get_daily_executive_summary(p_business_id uuid,p_local_date date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_start timestamptz;v_end timestamptz;v_revenue numeric:=0;v_contribution numeric:=0;v_expenses numeric:=0;v_units numeric:=0;v_critical jsonb:='[]'::jsonb;
begin
  v_start:=private.receivable_due_at(p_local_date,time '00:00');v_end:=private.receivable_due_at(p_local_date+1,time '00:00');
  with day_sales as(
    select id,sale_value_snapshot,contribution_snapshot from public.sales
    where business_id=p_business_id and status='completed' and transaction_type='sale' and sold_at>=v_start and sold_at<v_end
  )
  select coalesce(sum(sale_value_snapshot),0),coalesce(sum(contribution_snapshot),0) into v_revenue,v_contribution from day_sales;
  select coalesce(sum(si.quantity),0) into v_units from public.sale_items si join public.sales s on s.id=si.sale_id and s.business_id=si.business_id
  where s.business_id=p_business_id and s.status='completed' and s.transaction_type='sale' and s.sold_at>=v_start and s.sold_at<v_end;
  select coalesce(sum(amount),0) into v_expenses from public.sporadic_expenses where business_id=p_business_id and spent_at=p_local_date;
  select coalesce(jsonb_agg(name order by name),'[]'::jsonb) into v_critical from public.customers where business_id=p_business_id and active=true and credit_status='critical';
  return jsonb_build_object('revenue',v_revenue,'profit',v_contribution-v_expenses,'units',v_units,'criticalCustomers',v_critical,'date',p_local_date);
end $$;

-- Reuse the configured push endpoint for receivable polling every 15 minutes.
create or replace function private.dispatch_nat_receivables_tick()
returns bigint language plpgsql security definer set search_path='' as $$
declare v_url text;v_secret text;v_request bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name='nat_push_function_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='nat_push_cron_secret' limit 1;
  if nullif(v_url,'') is null or nullif(v_secret,'') is null then raise exception 'Push backend não configurado.' using errcode='55000';end if;
  select net.http_post(url:=v_url,headers:=jsonb_build_object('Content-Type','application/json','x-nat-cron-secret',v_secret),body:=jsonb_build_object('receivablesOnly',true,'correlationId',gen_random_uuid()),timeout_milliseconds:=10000) into v_request;
  perform private.record_nat_job_heartbeat('nat-receivables-tick','success',jsonb_build_object('requestId',v_request));
  return v_request;
exception when others then
  perform private.record_nat_job_heartbeat('nat-receivables-tick','failed',jsonb_build_object('error',left(sqlerrm,180)));
  raise;
end $$;

create or replace function private.cleanup_frontend_resilience_logs()
returns void language plpgsql security definer set search_path='' as $$
begin
  delete from private.calendar_mutation_requests where created_at<now()-interval '30 days';
  delete from private.nat_scheduler_dispatches where created_at<now()-interval '30 days' and status<>'queued';
  delete from public.notification_delivery_log where created_at<now()-interval '90 days' and status in('sent','expired','dead_letter');
  delete from public.business_alert_delivery_log where created_at<now()-interval '90 days' and status in('sent','expired','dead_letter');
end $$;

-- Permissions.
revoke all on table public.business_alert_delivery_log from public,anon,authenticated;
grant select,insert,update,delete on table public.business_alert_delivery_log to service_role;
revoke all on function public.apply_nat_transition_v4(uuid,uuid,jsonb) from public,anon;
grant execute on function public.apply_nat_transition_v4(uuid,uuid,jsonb) to authenticated;
revoke all on function public.mark_sale_paid_v1(uuid,uuid,text,text) from public,anon;
grant execute on function public.mark_sale_paid_v1(uuid,uuid,text,text) to authenticated;
revoke all on function public.mark_receivable_critical_v1(uuid) from public,anon,authenticated;
grant execute on function public.mark_receivable_critical_v1(uuid) to service_role;
revoke all on function public.claim_business_alert_delivery(uuid,uuid,text,text,uuid,text,text,text,integer) from public,anon,authenticated;
revoke all on function public.complete_business_alert_delivery(uuid) from public,anon,authenticated;
revoke all on function public.fail_business_alert_delivery(uuid,boolean,integer,text,text,integer,integer) from public,anon,authenticated;
revoke all on function public.list_due_business_alert_retries(integer) from public,anon,authenticated;
revoke all on function public.get_daily_executive_summary(uuid,date) from public,anon,authenticated;
grant execute on function public.claim_business_alert_delivery(uuid,uuid,text,text,uuid,text,text,text,integer) to service_role;
grant execute on function public.complete_business_alert_delivery(uuid) to service_role;
grant execute on function public.fail_business_alert_delivery(uuid,boolean,integer,text,text,integer,integer) to service_role;
grant execute on function public.list_due_business_alert_retries(integer) to service_role;
grant execute on function public.get_daily_executive_summary(uuid,date) to service_role;
revoke all on function private.dispatch_nat_receivables_tick() from public,anon,authenticated;

-- Replace/ensure cron without touching the existing calendar scheduler.
do $$ declare r record;begin
  for r in select jobid from cron.job where jobname='nat-receivables-tick' loop perform cron.unschedule(r.jobid);end loop;
  perform cron.schedule('nat-receivables-tick','*/15 * * * *','select private.dispatch_nat_receivables_tick();');
end $$;

commit;

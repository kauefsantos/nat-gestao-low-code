-- Fix retention eligibility for customers without a consent row and avoid repeated expiry events.
create or replace function private.cleanup_privacy_retention_v1()
returns void
language plpgsql
security definer
set search_path=''
as $$
declare r record;
begin
  update public.customers c
  set marketing_consent=false,updated_at=now()
  where c.marketing_consent=true
    and exists (
      select 1 from lateral (
        select m.status,m.expires_at from public.customer_marketing_consents m
        where m.business_id=c.business_id and m.customer_id=c.id
        order by m.occurred_at desc,m.id desc limit 1
      ) latest where latest.status='granted' and latest.expires_at is not null and latest.expires_at <= now()
    );

  insert into public.customer_marketing_consents(business_id,customer_id,status,source,notice_version,actor_user_id,occurred_at,expires_at)
  select c.business_id,c.id,'expired','retention_job','privacy-2026-09',null,now(),null
  from public.customers c
  join lateral (
    select m.status,m.expires_at from public.customer_marketing_consents m
    where m.business_id=c.business_id and m.customer_id=c.id
    order by m.occurred_at desc,m.id desc limit 1
  ) latest on true
  where latest.status='granted' and latest.expires_at is not null and latest.expires_at <= now();

  for r in
    select c.business_id,c.id
    from public.customers c
    left join lateral (select max(s.sold_at) last_sale from public.sales s where s.business_id=c.business_id and s.customer_id=c.id and s.status<>'cancelled') ls on true
    left join lateral (
      select m.status,m.expires_at from public.customer_marketing_consents m
      where m.business_id=c.business_id and m.customer_id=c.id order by m.occurred_at desc,m.id desc limit 1
    ) cm on true
    where greatest(c.created_at,coalesce(ls.last_sale,c.created_at)) < now()-interval '24 months'
      and not coalesce(cm.status='granted' and cm.expires_at>now(),false)
  loop
    perform set_config('app.audit_reason','privacy_retention',true);
    update public.sales set customer_id=null,updated_at=now() where business_id=r.business_id and customer_id=r.id;
    delete from public.customers where business_id=r.business_id and id=r.id;
    insert into public.privacy_request_log(business_id,customer_id,request_type,result,reason,actor_user_id)
    values(r.business_id,r.id,'retention_erasure','completed','24 meses sem relacionamento comercial ativo e sem consentimento de marketing válido',null);
  end loop;

  delete from public.privacy_request_log where created_at < now()-interval '5 years';
end;
$$;
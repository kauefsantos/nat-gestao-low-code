-- NAT Gestão: secure Web Push subscriptions + encrypted OpenAI configuration.
begin;

create extension if not exists supabase_vault;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null check (char_length(endpoint) between 20 and 4096),
  p256dh text not null check (char_length(p256dh) between 20 and 512),
  auth text not null check (char_length(auth) between 8 and 512),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_business_enabled_idx
  on public.push_subscriptions(business_id, enabled);

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from public, anon, authenticated;

create table if not exists public.notification_delivery_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  slot smallint not null check (slot in (9,12,16,21)),
  event_count integer not null default 0 check (event_count >= 0),
  created_at timestamptz not null default now(),
  unique(subscription_id, local_date, slot)
);

create index if not exists notification_delivery_log_business_date_idx
  on public.notification_delivery_log(business_id, local_date, slot);

alter table public.notification_delivery_log enable row level security;
revoke all on table public.notification_delivery_log from public, anon, authenticated;

create or replace function public.get_push_public_key(p_business_id uuid)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  v_key text;
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;

  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name='nat_vapid_public'
  limit 1;

  if nullif(v_key,'') is null then
    raise exception 'Notificações ainda não configuradas.' using errcode='55000';
  end if;
  return v_key;
end;
$$;

create or replace function public.save_push_subscription(
  p_business_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if auth.uid() is null
     or p_endpoint !~ '^https://'
     or char_length(p_endpoint) not between 20 and 4096
     or char_length(p_p256dh) not between 20 and 512
     or char_length(p_auth) not between 8 and 512 then
    raise exception 'Assinatura de notificação inválida.' using errcode='22023';
  end if;

  insert into public.push_subscriptions(
    business_id,user_id,endpoint,p256dh,auth,enabled,updated_at
  ) values (
    p_business_id,auth.uid(),p_endpoint,p_p256dh,p_auth,true,now()
  )
  on conflict (user_id,endpoint) do update set
    business_id=excluded.business_id,
    p256dh=excluded.p256dh,
    auth=excluded.auth,
    enabled=true,
    updated_at=now();
end;
$$;

create or replace function public.delete_push_subscription(
  p_business_id uuid,
  p_endpoint text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;

  delete from public.push_subscriptions
  where business_id=p_business_id
    and user_id=auth.uid()
    and endpoint=p_endpoint;
end;
$$;

create or replace function public.content_ai_status(p_business_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path=''
as $$
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  return exists(
    select 1 from vault.secrets
    where name='nat_openai_key_' || p_business_id::text
  );
end;
$$;

create or replace function public.configure_content_ai(
  p_business_id uuid,
  p_api_key text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_name text := 'nat_openai_key_' || p_business_id::text;
  v_id uuid;
  v_key text := btrim(coalesce(p_api_key,''));
begin
  if not private.is_business_admin(p_business_id) then
    raise exception 'Apenas administradores podem configurar a IA.' using errcode='42501';
  end if;
  if char_length(v_key) not between 20 and 512 or v_key ~ '\s' then
    raise exception 'Chave de API inválida.' using errcode='22023';
  end if;

  select id into v_id from vault.secrets where name=v_name limit 1;
  if v_id is null then
    perform vault.create_secret(v_key,v_name,'OpenAI API key for NAT content assistant');
  else
    perform vault.update_secret(v_id,v_key,v_name,'OpenAI API key for NAT content assistant');
  end if;
end;
$$;

create or replace function public.disconnect_content_ai(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.is_business_admin(p_business_id) then
    raise exception 'Apenas administradores podem desconectar a IA.' using errcode='42501';
  end if;
  delete from vault.secrets
  where name='nat_openai_key_' || p_business_id::text;
end;
$$;

create or replace function public.get_content_ai_key(p_business_id uuid)
returns text
language plpgsql
security definer
stable
set search_path=''
as $$
declare
  v_key text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;

  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name='nat_openai_key_' || p_business_id::text
  limit 1;

  return v_key;
end;
$$;

create or replace function public.get_push_backend_config()
returns jsonb
language plpgsql
security definer
stable
set search_path=''
as $$
declare
  v_public text;
  v_private text;
  v_cron text;
  v_subject text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;

  select decrypted_secret into v_public from vault.decrypted_secrets where name='nat_vapid_public' limit 1;
  select decrypted_secret into v_private from vault.decrypted_secrets where name='nat_vapid_private' limit 1;
  select decrypted_secret into v_cron from vault.decrypted_secrets where name='nat_push_cron_secret' limit 1;
  select decrypted_secret into v_subject from vault.decrypted_secrets where name='nat_vapid_subject' limit 1;

  return jsonb_build_object(
    'vapidPublic',v_public,
    'vapidPrivate',v_private,
    'cronSecret',v_cron,
    'subject',coalesce(nullif(v_subject,''),'mailto:admin@nat-gestao.local')
  );
end;
$$;

revoke all on function public.get_push_public_key(uuid) from public, anon;
revoke all on function public.save_push_subscription(uuid,text,text,text) from public, anon;
revoke all on function public.delete_push_subscription(uuid,text) from public, anon;
revoke all on function public.content_ai_status(uuid) from public, anon;
revoke all on function public.configure_content_ai(uuid,text) from public, anon;
revoke all on function public.disconnect_content_ai(uuid) from public, anon;
revoke all on function public.get_content_ai_key(uuid) from public, anon, authenticated;
revoke all on function public.get_push_backend_config() from public, anon, authenticated;

grant execute on function public.get_push_public_key(uuid) to authenticated;
grant execute on function public.save_push_subscription(uuid,text,text,text) to authenticated;
grant execute on function public.delete_push_subscription(uuid,text) to authenticated;
grant execute on function public.content_ai_status(uuid) to authenticated;
grant execute on function public.configure_content_ai(uuid,text) to authenticated;
grant execute on function public.disconnect_content_ai(uuid) to authenticated;
grant execute on function public.get_content_ai_key(uuid) to service_role;
grant execute on function public.get_push_backend_config() to service_role;

commit;

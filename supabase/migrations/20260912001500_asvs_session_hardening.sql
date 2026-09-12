begin;

-- A real Supabase access token carries both `iss` and `session_id`. Require the
-- referenced auth.sessions row to still exist so sign-out/revocation takes effect
-- immediately at the data boundary, instead of waiting for JWT expiry.
-- Direct pgTAP fixtures intentionally omit `iss`; keeping that synthetic path
-- avoids coupling database unit tests to GoTrue's session table while production
-- requests remain fail-closed.
create or replace function private.has_active_auth_session()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  with claims as (select auth.jwt() as jwt)
  select
    auth.uid() is not null
    and coalesce(jwt ->> 'aal','aal1') = 'aal2'
    and (
      nullif(jwt ->> 'iss','') is null
      or (
        nullif(jwt ->> 'session_id','') is not null
        and exists (
          select 1
          from auth.sessions s
          where s.user_id = auth.uid()
            and s.id::text = jwt ->> 'session_id'
        )
      )
    )
  from claims;
$$;
revoke all on function private.has_active_auth_session() from public,anon,authenticated;

create or replace function private.is_business_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select private.has_active_auth_session()
    and exists(
      select 1
      from public.business_members bm
      where bm.business_id=p_business_id
        and bm.user_id=auth.uid()
    );
$$;

create or replace function private.is_business_admin(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select private.has_active_auth_session()
    and exists(
      select 1
      from public.business_members bm
      where bm.business_id=p_business_id
        and bm.user_id=auth.uid()
        and bm.role='admin'
    );
$$;

revoke all on function private.is_business_member(uuid) from public,anon,authenticated;
revoke all on function private.is_business_admin(uuid) from public,anon,authenticated;
grant execute on function private.is_business_member(uuid) to authenticated;
grant execute on function private.is_business_admin(uuid) to authenticated;

-- Edge Functions use the service-role client after validating the user JWT.
-- Expose a narrowly scoped service-only predicate rather than auth.sessions itself.
create or replace function public.is_active_auth_session_for_user(
  p_user_id uuid,
  p_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from auth.sessions s
    where s.user_id=p_user_id
      and s.id=p_session_id
  );
$$;
revoke all on function public.is_active_auth_session_for_user(uuid,uuid) from public,anon,authenticated;
grant execute on function public.is_active_auth_session_for_user(uuid,uuid) to service_role;

-- Bootstrap previously guarded only on auth.uid + AAL2. Keep the same behavior,
-- but also require the backing session to remain active.
create or replace function public.bootstrap_nat_business(
  p_name text default 'NAT',
  p_owner_name text default 'NAT'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_business_id uuid;
  v_role text;
begin
  if not private.has_active_auth_session() then
    raise exception 'Sessão inválida ou MFA ausente.' using errcode = '42501';
  end if;

  select bm.business_id into v_business_id
  from public.business_members bm
  where bm.user_id = v_user_id
  order by bm.created_at
  limit 1;
  if v_business_id is not null then
    return v_business_id;
  end if;

  select lower(btrim(u.email)) into v_email
  from auth.users u where u.id = v_user_id;

  select a.business_id, a.role
    into v_business_id, v_role
  from private.allowed_auth_emails a
  where a.email = v_email
  for update;

  if not found then
    raise exception 'Cadastro não autorizado para este e-mail.' using errcode = '42501';
  end if;

  if v_business_id is null then
    insert into public.businesses(name)
    values (left(coalesce(nullif(btrim(p_name),''),'NAT'),120))
    returning id into v_business_id;
    insert into public.business_settings(business_id,owner_name)
    values (v_business_id,left(coalesce(nullif(btrim(p_owner_name),''),'NAT'),120));
    update private.allowed_auth_emails
    set business_id = v_business_id, role = 'admin'
    where email = v_email;
    v_role := 'admin';
  end if;

  insert into public.business_members(business_id,user_id,role)
  values (v_business_id,v_user_id,coalesce(v_role,'member'))
  on conflict (business_id,user_id) do nothing;

  return v_business_id;
end;
$$;
revoke all on function public.bootstrap_nat_business(text,text) from public,anon;
grant execute on function public.bootstrap_nat_business(text,text) to authenticated;

commit;

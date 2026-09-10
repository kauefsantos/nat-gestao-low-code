-- Preserve a business deletion audit entry without violating the audit_log FK.
begin;

create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_source jsonb;
  v_business_id uuid;
  v_entity_id uuid;
begin
  if tg_op = 'INSERT' then
    v_after := to_jsonb(new);
    v_source := v_after;
  elsif tg_op = 'UPDATE' then
    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
    v_source := v_after;
  else
    v_before := to_jsonb(old);
    v_source := v_before;
  end if;

  v_entity_id := nullif(coalesce(v_source ->> 'id', v_source ->> 'user_id', v_source ->> 'business_id'), '')::uuid;

  if tg_table_name = 'businesses' then
    -- After DELETE the parent no longer exists, so preserve entity_id and detach business_id.
    v_business_id := case when tg_op = 'DELETE' then null else nullif(v_source ->> 'id', '')::uuid end;
  else
    v_business_id := nullif(v_source ->> 'business_id', '')::uuid;
  end if;

  insert into public.audit_log(
    business_id, actor_user_id, action, entity_table, entity_id, before_data, after_data
  ) values (
    v_business_id, auth.uid(), tg_op, tg_table_name, v_entity_id, v_before, v_after
  );
  return coalesce(new, old);
end;
$$;

revoke all on function private.audit_row_change() from public, anon, authenticated;

commit;

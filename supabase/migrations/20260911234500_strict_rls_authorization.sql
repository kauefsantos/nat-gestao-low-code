begin;

-- Defense in depth: make RLS mandatory even for table owners. The project
-- migration/runtime owner currently has BYPASSRLS, so reviewed SECURITY DEFINER
-- RPCs continue to work while accidental owner-context access is constrained.
do $$
declare
  r record;
begin
  for r in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
  loop
    execute format('alter table %I.%I enable row level security', r.schema_name, r.table_name);
    execute format('alter table %I.%I force row level security', r.schema_name, r.table_name);
  end loop;
end
$$;

-- The private schema is implementation detail, not a client API. Remove all
-- direct client execution, then explicitly expose only the two helpers required
-- by RLS policies.
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_business_member(uuid) to authenticated;
grant execute on function private.is_business_admin(uuid) to authenticated;

commit;

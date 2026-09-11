-- Strict RLS/authorization regression guards.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select is(
  (
    select count(*)::bigint
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relkind='r'
      and (not c.relrowsecurity or not c.relforcerowsecurity)
  ),
  0::bigint,
  'all public application tables have RLS enabled and forced'
);

select is(
  (
    select count(*)::bigint
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private'
      and has_function_privilege('authenticated',p.oid,'execute')
      and p.proname not in ('is_business_member','is_business_admin')
  ),
  0::bigint,
  'authenticated clients cannot execute private implementation helpers'
);

select is(
  (
    select count(*)::bigint
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private'
      and has_function_privilege('anon',p.oid,'execute')
  ),
  0::bigint,
  'anonymous clients cannot execute private functions'
);

select is(
  (
    select count(*)::bigint
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prosecdef
      and has_function_privilege('authenticated',p.oid,'execute')
      and pg_get_functiondef(p.oid) !~* '(is_business_(member|admin)|auth\.uid\(\)|auth\.jwt\(\))'
  ),
  0::bigint,
  'every client-executable SECURITY DEFINER RPC contains an explicit authorization guard'
);

select * from finish();
rollback;

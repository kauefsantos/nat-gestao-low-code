-- Regression guard: keep active hardened RPCs and prevent obsolete client entry points from being re-exposed.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select ok(
  to_regprocedure('public.save_supply(uuid,uuid,text,text,numeric,text,numeric,date)') is not null,
  'active save_supply RPC remains available'
);

select ok(
  (select p.prosecdef
   from pg_proc p
   where p.oid = to_regprocedure('public.save_supply(uuid,uuid,text,text,numeric,text,numeric,date)')),
  'active save_supply remains SECURITY DEFINER'
);

select ok(
  to_regprocedure('public.save_product(uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,jsonb)') is null,
  'legacy save_product overload without portfolio_key is removed'
);

select ok(
  not has_function_privilege('authenticated',to_regprocedure('public.apply_nat_transition(uuid,jsonb)'),'execute'),
  'legacy transition v1 is not exposed to authenticated clients'
);

select ok(
  not has_function_privilege('authenticated',to_regprocedure('public.save_sale(uuid,uuid,uuid,numeric,numeric,text,timestamptz)'),'execute'),
  'legacy single-product save_sale is not exposed to authenticated clients'
);

select ok(
  not has_function_privilege('authenticated',to_regprocedure('public.delete_sale(uuid,uuid)'),'execute'),
  'legacy delete_sale wrapper is not exposed to authenticated clients'
);

select ok(
  not has_function_privilege('authenticated',to_regprocedure('public.save_calendar_event(uuid,uuid,date,time,text,text,text,text,text,text)'),'execute'),
  'legacy calendar save v1 is not exposed to authenticated clients'
);

select ok(
  not has_function_privilege('authenticated',to_regprocedure('public.delete_calendar_event(uuid,uuid)'),'execute'),
  'legacy calendar delete wrapper is not exposed to authenticated clients'
);

select * from finish();
rollback;

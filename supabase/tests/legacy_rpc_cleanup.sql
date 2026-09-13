-- Regression guard: only hardened client entry points may remain executable by authenticated.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select ok(
  has_function_privilege('authenticated','public.apply_nat_transition_v4(uuid,uuid,jsonb)','execute'),
  'current transition v4 remains available'
);
select ok(
  not has_function_privilege('authenticated','public.apply_nat_transition_v2(uuid,uuid,jsonb)','execute'),
  'transition v2 cannot bypass current business rules'
);
select ok(
  not has_function_privilege('authenticated','public.apply_nat_transition_v3(uuid,uuid,jsonb)','execute'),
  'transition v3 cannot bypass current business rules'
);

select ok(
  has_function_privilege('authenticated','public.record_inventory_production_v2(uuid,uuid,uuid,numeric,timestamptz,text)','execute'),
  'idempotent inventory production v2 remains available to the Edge Function'
);
select ok(
  not has_function_privilege('authenticated','public.record_inventory_production(uuid,uuid,numeric,timestamptz,text)','execute'),
  'non-idempotent inventory production v1 is not client-executable'
);

select ok(
  not has_function_privilege('authenticated','public.save_supply(uuid,uuid,text,text,numeric,text,numeric,date)','execute'),
  'legacy direct supply write is not client-executable'
);
select ok(
  not has_function_privilege('authenticated','public.save_supply_v2(uuid,uuid,text,text,numeric,text,numeric,date,text)','execute'),
  'legacy direct supply v2 write is not client-executable'
);
select ok(
  not has_function_privilege('authenticated','public.save_sale_items(uuid,uuid,jsonb,numeric,text,timestamptz)','execute'),
  'legacy direct sale write is not client-executable'
);
select ok(
  not has_function_privilege('authenticated','public.save_sale_items_v4(uuid,uuid,jsonb,numeric,text,timestamptz,uuid,text,text,numeric,text,boolean)','execute'),
  'sale implementation v4 is internal to the hardened transition'
);

select ok(
  not has_function_privilege('authenticated','public.save_business_settings_v2(uuid,text,numeric,numeric,numeric,numeric,numeric,numeric)','execute'),
  'legacy settings v2 cannot bypass admin authorization'
);
select ok(
  not has_function_privilege('authenticated','public.save_business_settings_v4(uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text)','execute'),
  'settings implementation v4 is internal to the hardened transition'
);
select ok(
  not has_function_privilege('authenticated','public.save_customer(uuid,uuid,text,text,text,text,boolean,text,boolean)','execute'),
  'customer implementation is internal to the hardened transition'
);
select ok(
  not has_function_privilege('authenticated','public.save_product(uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,jsonb,text)','execute'),
  'product implementation is internal to the hardened transition'
);

select ok(
  not has_function_privilege('authenticated','public.save_calendar_event_v2(uuid,uuid,text,date,time,text,text,text,text,text,text,boolean)','execute'),
  'calendar v2 cannot bypass request-id idempotency'
);
select ok(
  has_function_privilege('authenticated','public.save_calendar_event_v3(uuid,uuid,uuid,text,date,time,text,text,text,text,text,text,boolean)','execute'),
  'calendar v3 remains available'
);

select is(
  public.get_nat_schema_version(),
  '2026-09-13.security-release-gate.1'::text,
  'schema release version is explicit and queryable'
);

select * from finish();
rollback;

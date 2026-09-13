-- Hotfix do mapeamento físico real da NAT.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select is(
  (select coalesce(sum(quantity_delta),0)::numeric from public.inventory_movements
   where business_id='4b8f4ef8-a9a4-41c1-b4e2-18443ae4c638'::uuid
     and supply_id='94de9b45-4540-48c0-96ee-4dd57c0b0cd0'::uuid),
  0::numeric,
  'physical opening has no traditional mass in stock'
);

select is(
  (select coalesce(sum(quantity_delta),0)::numeric from public.inventory_movements
   where business_id='4b8f4ef8-a9a4-41c1-b4e2-18443ae4c638'::uuid
     and supply_id='548f9d63-54e7-4564-bc1e-cc6058742169'::uuid),
  0::numeric,
  'physical opening has no milk-powder mass in stock'
);

select is(
  (select count(*)::bigint from private.brigadeiro_mass_cost_layers
   where business_id='4b8f4ef8-a9a4-41c1-b4e2-18443ae4c638'::uuid
     and mass_supply_id in (
       '94de9b45-4540-48c0-96ee-4dd57c0b0cd0'::uuid,
       '548f9d63-54e7-4564-bc1e-cc6058742169'::uuid,
       'ca8a9c16-cd7e-4898-8d54-97020ec30656'::uuid,
       '967d496d-53cf-43bf-b3d0-2245fef55066'::uuid
     )
     and grams_remaining>0),
  0::bigint,
  'no stale mass cost layer remains after physical recount correction'
);

select is(
  (select quantity_per_package::numeric
   from private.brigadeiro_packaging_profile
   where business_id='4b8f4ef8-a9a4-41c1-b4e2-18443ae4c638'::uuid
     and packaging_format='quartet'
     and supply_id='c24d0e18-a3ab-4d6e-b301-6988b623d880'::uuid),
  1::numeric,
  'quartet consumes one bag'
);

select is(
  (select package_capacity::integer
   from private.brigadeiro_packaging_profile
   where business_id='4b8f4ef8-a9a4-41c1-b4e2-18443ae4c638'::uuid
     and packaging_format='quartet'
     and supply_id='c24d0e18-a3ab-4d6e-b301-6988b623d880'::uuid),
  4,
  'quartet bag belongs to four-unit package profile'
);

select is(
  (select coalesce(sum(quantity_delta),0)::numeric from public.inventory_movements
   where business_id='4b8f4ef8-a9a4-41c1-b4e2-18443ae4c638'::uuid
     and supply_id='c24d0e18-a3ab-4d6e-b301-6988b623d880'::uuid),
  45::numeric,
  'hotfix preserves the informed physical stock of 45 bags'
);

select * from finish();
rollback;

begin;

update private.nat_schema_release
set version='2026-09-13.brigadeiro-production-flow.2', applied_at=now()
where singleton=true;

-- Correção do mapeamento físico informado em 13/09/2026:
-- 1) o quarteto também utiliza uma sacola;
-- 2) não existe saldo de massa pronta no momento da recontagem.
do $$
declare
  b uuid:='4b8f4ef8-a9a4-41c1-b4e2-18443ae4c638';
  bag uuid:='c24d0e18-a3ab-4d6e-b301-6988b623d880';
  mt uuid:='94de9b45-4540-48c0-96ee-4dd57c0b0cd0';
  ml uuid:='548f9d63-54e7-4564-bc1e-cc6058742169';
  mb uuid:='ca8a9c16-cd7e-4898-8d54-97020ec30656';
  mp uuid:='967d496d-53cf-43bf-b3d0-2245fef55066';
  r record;
  bal numeric;
begin
  if not exists(select 1 from public.businesses where id=b) then
    return;
  end if;

  insert into private.brigadeiro_packaging_profile(
    business_id,packaging_format,supply_id,quantity_per_package,package_capacity
  ) values (b,'quartet',bag,1,4)
  on conflict(business_id,packaging_format,supply_id)
  do update set quantity_per_package=excluded.quantity_per_package,
                package_capacity=excluded.package_capacity;

  for r in select x.id from (values(mt),(ml),(mb),(mp)) x(id) loop
    select coalesce(sum(quantity_delta),0)
      into bal
    from public.inventory_movements
    where business_id=b and supply_id=r.id;

    if abs(bal)>0.0001 then
      insert into public.inventory_movements(
        business_id,supply_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at
      ) values (
        b,r.id,-bal,'g','adjustment',
        'process-map-hotfix:2026-09-13:zero-mass:'||r.id::text,
        'Correção da recontagem: não havia massa pronta em estoque',
        timestamptz '2026-09-13 17:30:00-03'
      )
      on conflict(business_id,source_key) where source_key is not null do nothing;
    end if;
  end loop;

  update private.brigadeiro_mass_cost_layers
  set grams_remaining=0
  where business_id=b
    and mass_supply_id in (mt,ml,mb,mp)
    and grams_remaining>0;
end $$;

commit;

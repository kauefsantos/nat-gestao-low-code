begin;

-- Serialize optimistic-version checks for existing mutable rows. Under READ COMMITTED,
-- SELECT ... FOR UPDATE waits for a concurrent writer and then sees the committed row,
-- so a second request cannot pass the same stale expectedUpdatedAt and overwrite it.
create or replace function private.assert_nat_version(
  p_entity text,
  p_business_id uuid,
  p_id uuid,
  p_expected_updated_at text
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actual timestamptz;
  v_expected timestamptz;
  v_exists boolean:=false;
begin
  if p_expected_updated_at is not null then
    begin
      v_expected:=p_expected_updated_at::timestamptz;
    exception when others then
      raise exception 'CONFLICT: versão inválida para %.',p_entity using errcode='40001';
    end;
  end if;

  case p_entity
    when 'settings' then
      select updated_at into v_actual
      from public.business_settings
      where business_id=p_business_id
      for update;
      v_exists:=found;
    when 'supply' then
      select updated_at into v_actual
      from public.supplies
      where business_id=p_business_id and id=p_id
      for update;
      v_exists:=found;
    when 'product' then
      select updated_at into v_actual
      from public.products
      where business_id=p_business_id and id=p_id
      for update;
      v_exists:=found;
    when 'sale' then
      select updated_at into v_actual
      from public.sales
      where business_id=p_business_id and id=p_id
      for update;
      v_exists:=found;
    when 'expense' then
      select updated_at into v_actual
      from public.sporadic_expenses
      where business_id=p_business_id and id=p_id
      for update;
      v_exists:=found;
    else
      raise exception 'Entidade de versão inválida.' using errcode='22023';
  end case;

  if p_expected_updated_at is null then
    if v_exists then
      raise exception 'CONFLICT: % já existe.',p_entity using errcode='40001';
    end if;
  elsif not v_exists or v_actual is distinct from v_expected then
    raise exception 'CONFLICT: % foi alterado em outro aparelho.',p_entity using errcode='40001';
  end if;
end;
$$;
revoke all on function private.assert_nat_version(text,uuid,uuid,text) from public,anon,authenticated;

commit;

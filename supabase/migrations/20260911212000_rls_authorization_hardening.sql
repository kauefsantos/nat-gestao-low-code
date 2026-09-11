begin;

-- Align the public settings RPC with the table-level authorization model:
-- ordinary members can read business settings, but only admins may change them.
create or replace function public.save_business_settings_v3(
  p_business_id uuid,
  p_owner_name text,
  p_monthly_fixed_costs numeric,
  p_payment_fee_percent numeric,
  p_pix_fee_percent numeric,
  p_cash_fee_percent numeric,
  p_card_fee_percent numeric,
  p_default_minimum_margin_percent numeric,
  p_default_target_margin_percent numeric,
  p_owner_hourly_rate numeric,
  p_owner_daily_hours numeric
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_max_fee numeric;
begin
  if not private.is_business_admin(p_business_id) then
    raise exception 'Apenas administradores podem alterar as configurações do negócio.' using errcode='42501';
  end if;
  if p_pix_fee_percent not between 0 and 100
     or p_cash_fee_percent not between 0 and 100
     or p_card_fee_percent not between 0 and 100 then
    raise exception 'Taxas por pagamento inválidas.' using errcode='22023';
  end if;
  if p_default_target_margin_percent < p_default_minimum_margin_percent then
    raise exception 'A margem recomendada não pode ser menor que a margem mínima.' using errcode='22023';
  end if;
  v_max_fee := greatest(
    p_pix_fee_percent,
    p_cash_fee_percent,
    p_card_fee_percent,
    coalesce(p_payment_fee_percent,0)
  );
  if p_default_minimum_margin_percent + v_max_fee >= 100
     or p_default_target_margin_percent + v_max_fee >= 100 then
    raise exception 'Margem e taxa somadas precisam ser menores que 100%%.' using errcode='22023';
  end if;
  if p_owner_hourly_rate < 0 or p_owner_daily_hours < 0 or p_owner_daily_hours > 24 then
    raise exception 'Referência de trabalho inválida.' using errcode='22023';
  end if;

  perform public.save_business_settings(
    p_business_id,
    p_owner_name,
    p_monthly_fixed_costs,
    v_max_fee,
    p_default_minimum_margin_percent,
    p_default_target_margin_percent
  );

  update public.business_settings
  set pix_fee_percent=p_pix_fee_percent,
      cash_fee_percent=p_cash_fee_percent,
      card_fee_percent=p_card_fee_percent,
      owner_hourly_rate=p_owner_hourly_rate,
      owner_daily_hours=p_owner_daily_hours,
      updated_at=now()
  where business_id=p_business_id;
end;
$$;

revoke all on function public.save_business_settings_v3(uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) from public,anon;
grant execute on function public.save_business_settings_v3(uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) to authenticated,service_role;

-- Trigger/helper functions are not part of the application API. Revoke default
-- PUBLIC execution grants to keep the private schema on a least-privilege basis.
revoke all on function private.prevent_history_mutation() from public,anon,authenticated;
revoke all on function private.validate_business_margin() from public,anon,authenticated;
revoke all on function private.validate_product_margin() from public,anon,authenticated;
revoke all on function private.validate_settings_margin() from public,anon,authenticated;

commit;

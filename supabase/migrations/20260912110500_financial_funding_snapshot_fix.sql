begin;

create or replace function public.get_financial_funding_snapshot(p_business_id uuid,p_month_start date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_owner_contributions numeric:=0;v_owner_withdrawals numeric:=0;
  v_owner_purchases numeric:=0;v_business_purchases numeric:=0;
  v_owner_expenses numeric:=0;v_business_expenses numeric:=0;
  v_month_owner_purchases numeric:=0;v_month_business_purchases numeric:=0;
  v_month_owner_expenses numeric:=0;v_month_business_expenses numeric:=0;
  v_month_owner numeric:=0;v_month_business numeric:=0;
  v_fixed numeric:=0;v_fixed_source text:='owner';
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;

  select coalesce(sum(amount) filter(where movement_type='contribution'),0),
         coalesce(sum(amount) filter(where movement_type='withdrawal'),0)
    into v_owner_contributions,v_owner_withdrawals
  from public.owner_cash_movements where business_id=p_business_id;

  select coalesce(sum(package_price) filter(where funding_source='owner'),0),
         coalesce(sum(package_price) filter(where funding_source='business'),0),
         coalesce(sum(package_price) filter(where funding_source='owner' and purchased_at>=p_month_start and purchased_at<(p_month_start+interval '1 month')::date),0),
         coalesce(sum(package_price) filter(where funding_source='business' and purchased_at>=p_month_start and purchased_at<(p_month_start+interval '1 month')::date),0)
    into v_owner_purchases,v_business_purchases,v_month_owner_purchases,v_month_business_purchases
  from public.supply_purchases where business_id=p_business_id;

  select coalesce(sum(amount) filter(where funding_source='owner'),0),
         coalesce(sum(amount) filter(where funding_source='business'),0),
         coalesce(sum(amount) filter(where funding_source='owner' and spent_at>=p_month_start and spent_at<(p_month_start+interval '1 month')::date),0),
         coalesce(sum(amount) filter(where funding_source='business' and spent_at>=p_month_start and spent_at<(p_month_start+interval '1 month')::date),0)
    into v_owner_expenses,v_business_expenses,v_month_owner_expenses,v_month_business_expenses
  from public.sporadic_expenses where business_id=p_business_id;

  select coalesce(monthly_fixed_costs,0),coalesce(fixed_cost_funding_source,'owner')
    into v_fixed,v_fixed_source from public.business_settings where business_id=p_business_id;

  v_month_owner:=v_month_owner_purchases+v_month_owner_expenses;
  v_month_business:=v_month_business_purchases+v_month_business_expenses;
  if v_fixed_source='owner' then v_month_owner:=v_month_owner+v_fixed; else v_month_business:=v_month_business+v_fixed; end if;

  return jsonb_build_object(
    'ownerContributions',v_owner_contributions,
    'ownerWithdrawals',v_owner_withdrawals,
    'ownerFundedOutflows',v_owner_purchases+v_owner_expenses,
    'businessReinvestment',v_business_purchases+v_business_expenses,
    'businessReinvestmentPurchases',v_business_purchases,
    'businessReinvestmentExpenses',v_business_expenses,
    'monthOwnerFundedOutflows',v_month_owner,
    'monthBusinessReinvestment',v_month_business,
    'fixedCostFundingSource',v_fixed_source
  );
end $$;

commit;

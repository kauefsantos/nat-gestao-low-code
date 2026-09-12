import { supabase } from "@/integrations/supabase/client";
import { businessDate } from "@/lib/business-time";
import { emptyFundingSummary, type FundingSource, type FundingSummary } from "@/domain/funding";

const numeric=(value:unknown)=>Number.isFinite(Number(value))?Number(value):0;

export async function loadFundingSummary(businessId:string):Promise<FundingSummary>{
  const monthStart=`${businessDate().slice(0,7)}-01`;
  const result=await supabase.rpc("get_financial_funding_snapshot" as never,{p_business_id:businessId,p_month_start:monthStart} as never);
  if(result.error)throw new Error(`Não foi possível carregar a origem do dinheiro: ${result.error.message}`);
  const row=(result.data&&typeof result.data==="object"&&!Array.isArray(result.data)?result.data:{}) as Record<string,unknown>;
  const fallback=emptyFundingSummary();
  return {
    ownerContributions:numeric(row.ownerContributions),
    ownerWithdrawals:numeric(row.ownerWithdrawals),
    ownerFundedOutflows:numeric(row.ownerFundedOutflows),
    businessReinvestment:numeric(row.businessReinvestment),
    businessReinvestmentPurchases:numeric(row.businessReinvestmentPurchases),
    businessReinvestmentExpenses:numeric(row.businessReinvestmentExpenses),
    monthOwnerFundedOutflows:numeric(row.monthOwnerFundedOutflows),
    monthBusinessReinvestment:numeric(row.monthBusinessReinvestment),
    fixedCostFundingSource:(row.fixedCostFundingSource==="business"?"business":"owner") as FundingSource ?? fallback.fixedCostFundingSource,
  };
}

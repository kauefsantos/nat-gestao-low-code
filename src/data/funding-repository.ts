import { supabase } from "@/integrations/supabase/client";
import { businessDate } from "@/lib/business-time";
import { type FundingSource, type FundingSummary } from "@/domain/funding";

type RpcResult={data:unknown;error:{message:string}|null};
const numeric=(value:unknown)=>Number.isFinite(Number(value))?Number(value):0;
function fundingMap(value:unknown):Record<string,FundingSource>{if(!value||typeof value!=="object"||Array.isArray(value))return{};return Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([key,source])=>[key,source==="business"?"business":"owner"]));}

export async function loadFundingSummary(businessId:string):Promise<FundingSummary>{
  const monthStart=`${businessDate().slice(0,7)}-01`;
  const result=await supabase.rpc("get_financial_funding_snapshot" as never,{p_business_id:businessId,p_month_start:monthStart} as never) as unknown as RpcResult;
  if(result.error)throw new Error(`Não foi possível carregar a origem do dinheiro: ${result.error.message}`);
  const row=(result.data&&typeof result.data==="object"&&!Array.isArray(result.data)?result.data:{}) as Record<string,unknown>;
  const fixedCostFundingSource:FundingSource=row.fixedCostFundingSource==="business"?"business":"owner";
  return {
    ownerContributions:numeric(row.ownerContributions),
    ownerWithdrawals:numeric(row.ownerWithdrawals),
    ownerFundedOutflows:numeric(row.ownerFundedOutflows),
    businessReinvestment:numeric(row.businessReinvestment),
    businessReinvestmentPurchases:numeric(row.businessReinvestmentPurchases),
    businessReinvestmentExpenses:numeric(row.businessReinvestmentExpenses),
    monthOwnerFundedOutflows:numeric(row.monthOwnerFundedOutflows),
    monthBusinessReinvestment:numeric(row.monthBusinessReinvestment),
    fixedCostFundingSource,
    supplyFunding:fundingMap(row.supplyFunding),
    expenseFunding:fundingMap(row.expenseFunding),
  };
}

import { supabase } from "@/integrations/supabase/client";
import { loadFundingSummary } from "@/data/funding-repository";
import { loadNatHistoryPage, loadNatOperationalStateV2, type HistoryCursor, type HistoryPage } from "@/data/nat-operational-v2";
import type { FundingSource } from "@/domain/funding";

export async function loadNatOperationalStateV3(){
  const loaded=await loadNatOperationalStateV2();
  const funding=await loadFundingSummary(loaded.businessId);
  return {...loaded,state:{...loaded.state,
    supplies:loaded.state.supplies.map((item)=>({...item,fundingSource:funding.supplyFunding[item.id]??"owner" as FundingSource})),
    expenses:loaded.state.expenses.map((item)=>({...item,fundingSource:funding.expenseFunding[item.id]??"owner" as FundingSource})),
    settings:{...loaded.state.settings,fixedCostFundingSource:funding.fixedCostFundingSource},
  }};
}

export async function loadNatHistoryPageV3(businessId:string,cursor:HistoryCursor,limit=100):Promise<HistoryPage>{
  const page=await loadNatHistoryPage(businessId,cursor,limit);
  if(!page.expenses.length)return page;
  const ids=page.expenses.map((item)=>item.id);
  const result=await supabase.from("sporadic_expenses").select("id,funding_source").eq("business_id",businessId).in("id",ids);
  if(result.error)throw new Error(`Não foi possível carregar a origem dos gastos: ${result.error.message}`);
  const sources=new Map((result.data??[]).map((row)=>([row.id,(row as typeof row&{funding_source?:string}).funding_source==="business"?"business":"owner"] as const)));
  return {...page,expenses:page.expenses.map((item)=>({...item,fundingSource:(sources.get(item.id)??"owner") as FundingSource}))};
}

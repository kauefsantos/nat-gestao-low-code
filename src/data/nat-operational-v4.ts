import { supabase } from "@/integrations/supabase/client";
import type { CustomerCreditStatus, PaymentStatus, Sale } from "@/domain/nat";
import type { FundingSource } from "@/domain/funding";
import { loadFundingSummary } from "@/data/funding-repository";
import { loadNatHistoryPage, loadNatOperationalStateV2, type HistoryCursor, type HistoryPage } from "@/data/nat-operational-v2";

const EXPECTED_SCHEMA_VERSION="2026-09-13.security-release-gate.1";

type ReceivableRow={id:string;sale_value_snapshot:number|string;payment_status:string;payment_promised_date:string|null;payment_promised_time:string|null;payment_due_at:string|null;paid_at:string|null;payment_critical_at:string|null;margin_override:boolean};
function numberValue(value:number|string|null|undefined){const parsed=Number(value);return Number.isFinite(parsed)?parsed:0;}
function mergeReceivable(sale:Sale,row:ReceivableRow|undefined):Sale{
  if(!row)return{...sale,saleValueSnapshot:sale.saleValueSnapshot??sale.totalReceived,paymentStatus:sale.paymentStatus??"paid"};
  return{...sale,saleValueSnapshot:numberValue(row.sale_value_snapshot),paymentStatus:(row.payment_status==="pending"?"pending":"paid") as PaymentStatus,paymentPromisedDate:row.payment_promised_date,paymentPromisedTime:row.payment_promised_time,paymentDueAt:row.payment_due_at,paidAt:row.paid_at,paymentCriticalAt:row.payment_critical_at,marginOverride:Boolean(row.margin_override)};
}
async function assertSchemaVersion(){
  const result=await supabase.rpc("get_nat_schema_version" as never);
  if(result.error)throw new Error("O Lovable Cloud ainda não está na versão de banco exigida por esta publicação. A aplicação foi bloqueada para evitar gravações incompatíveis.");
  const actual=String(result.data??"");
  if(actual!==EXPECTED_SCHEMA_VERSION)throw new Error(`Versão incompatível do Lovable Cloud. Esperada ${EXPECTED_SCHEMA_VERSION}; encontrada ${actual||"desconhecida"}.`);
}
async function receivables(businessId:string,ids:string[]){
  if(!ids.length)return new Map<string,ReceivableRow>();
  const result=await supabase.from("sales").select("id,sale_value_snapshot,payment_status,payment_promised_date,payment_promised_time,payment_due_at,paid_at,payment_critical_at,margin_override").eq("business_id",businessId).in("id",ids);
  if(result.error)throw new Error(`Não foi possível carregar os pagamentos pendentes: ${result.error.message}`);
  return new Map((result.data??[]).map((row)=>[row.id,row as ReceivableRow]));
}

async function initialCapitalIds(businessId:string){
  const result=await supabase.rpc("get_owner_cash_movements_snapshot",{p_business_id:businessId});
  if(result.error)throw new Error(`Não foi possível carregar o capital inicial: ${result.error.message}`);
  const rows=Array.isArray(result.data)?result.data:[];
  return new Set(rows.flatMap((value)=>{
    if(!value||typeof value!=="object"||Array.isArray(value))return[];
    const row=value as Record<string,unknown>;
    return row.movementType==="initial_capital"&&row.id?[String(row.id)]:[];
  }));
}

export async function loadNatOperationalStateV4(){
  await assertSchemaVersion();
  const loaded=await loadNatOperationalStateV2();
  const [funding,capitalIds]=await Promise.all([loadFundingSummary(loaded.businessId),initialCapitalIds(loaded.businessId)]);
  const map=await receivables(loaded.businessId,loaded.state.sales.map((sale)=>sale.id));
  const customerIds=(loaded.state.customers??[]).map((customer)=>customer.id);let credit=new Map<string,CustomerCreditStatus>();
  if(customerIds.length){const result=await supabase.from("customers").select("id,credit_status").eq("business_id",loaded.businessId).in("id",customerIds);if(result.error)throw new Error(`Não foi possível carregar a situação dos clientes: ${result.error.message}`);credit=new Map((result.data??[]).map((row)=>[row.id,(row.credit_status==="critical"?"critical":"normal") as CustomerCreditStatus]));}
  return{...loaded,state:{...loaded.state,
    supplies:loaded.state.supplies.map((item)=>({...item,fundingSource:funding.supplyFunding[item.id]??"owner" as FundingSource})),
    expenses:loaded.state.expenses.map((item)=>({...item,fundingSource:funding.expenseFunding[item.id]??item.fundingSource??"owner" as FundingSource})),
    settings:{...loaded.state.settings,fixedCostFundingSource:funding.fixedCostFundingSource},
    sales:loaded.state.sales.map((sale)=>mergeReceivable(sale,map.get(sale.id))),
    customers:(loaded.state.customers??[]).map((customer)=>({...customer,creditStatus:credit.get(customer.id)??"normal"})),
    ownerCashMovements:(loaded.state.ownerCashMovements??[]).map((movement)=>capitalIds.has(movement.id)?{...movement,movementType:"initial_capital" as const}:movement),
  }};
}

export async function loadNatHistoryPageV4(businessId:string,cursor:HistoryCursor,limit=100):Promise<HistoryPage>{
  const page=await loadNatHistoryPage(businessId,cursor,limit);
  let enriched=page;
  if(page.expenses.length){const ids=page.expenses.map((item)=>item.id);const result=await supabase.from("sporadic_expenses").select("id,funding_source").eq("business_id",businessId).in("id",ids);if(result.error)throw new Error(`Não foi possível carregar a origem dos gastos: ${result.error.message}`);const sources=new Map((result.data??[]).map((row)=>([row.id,row.funding_source==="business"?"business":"owner"] as const)));enriched={...page,expenses:page.expenses.map((item)=>({...item,fundingSource:(sources.get(item.id)??item.fundingSource??"owner") as FundingSource}))};}
  const map=await receivables(businessId,enriched.sales.map((sale)=>sale.id));
  return{...enriched,sales:enriched.sales.map((sale)=>mergeReceivable(sale,map.get(sale.id)))};
}

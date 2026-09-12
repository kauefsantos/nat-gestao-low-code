import { supabase } from "@/integrations/supabase/client";
import type { CustomerCreditStatus, PaymentStatus, Sale } from "@/domain/nat";
import { loadNatHistoryPageV3, loadNatOperationalStateV3 } from "@/data/nat-operational-v3";
import type { HistoryCursor, HistoryPage } from "@/data/nat-operational-v2";

type ReceivableRow={
  id:string;
  sale_value_snapshot:number|string;
  payment_status:string;
  payment_promised_date:string|null;
  payment_promised_time:string|null;
  payment_due_at:string|null;
  paid_at:string|null;
  payment_critical_at:string|null;
};

function numberValue(value:number|string|null|undefined){const parsed=Number(value);return Number.isFinite(parsed)?parsed:0;}
function mergeReceivable(sale:Sale,row:ReceivableRow|undefined):Sale{
  if(!row)return{...sale,saleValueSnapshot:sale.saleValueSnapshot??sale.totalReceived,paymentStatus:sale.paymentStatus??"paid"};
  return{...sale,
    saleValueSnapshot:numberValue(row.sale_value_snapshot),
    paymentStatus:(row.payment_status==="pending"?"pending":"paid") as PaymentStatus,
    paymentPromisedDate:row.payment_promised_date,
    paymentPromisedTime:row.payment_promised_time,
    paymentDueAt:row.payment_due_at,
    paidAt:row.paid_at,
    paymentCriticalAt:row.payment_critical_at,
  };
}

async function receivables(businessId:string,ids:string[]){
  if(!ids.length)return new Map<string,ReceivableRow>();
  const result=await supabase.from("sales").select("id,sale_value_snapshot,payment_status,payment_promised_date,payment_promised_time,payment_due_at,paid_at,payment_critical_at").eq("business_id",businessId).in("id",ids);
  if(result.error)throw new Error(`Não foi possível carregar os pagamentos pendentes: ${result.error.message}`);
  return new Map((result.data??[]).map((row)=>[row.id,row as ReceivableRow]));
}

export async function loadNatOperationalStateV4(){
  const loaded=await loadNatOperationalStateV3();
  const map=await receivables(loaded.businessId,loaded.state.sales.map((sale)=>sale.id));
  const customerIds=(loaded.state.customers??[]).map((customer)=>customer.id);
  let credit=new Map<string,CustomerCreditStatus>();
  if(customerIds.length){
    const result=await supabase.from("customers").select("id,credit_status").eq("business_id",loaded.businessId).in("id",customerIds);
    if(result.error)throw new Error(`Não foi possível carregar a situação dos clientes: ${result.error.message}`);
    credit=new Map((result.data??[]).map((row)=>[row.id,(row.credit_status==="critical"?"critical":"normal") as CustomerCreditStatus]));
  }
  return{...loaded,state:{...loaded.state,
    sales:loaded.state.sales.map((sale)=>mergeReceivable(sale,map.get(sale.id))),
    customers:(loaded.state.customers??[]).map((customer)=>({...customer,creditStatus:credit.get(customer.id)??"normal"})),
  }};
}

export async function loadNatHistoryPageV4(businessId:string,cursor:HistoryCursor,limit=100):Promise<HistoryPage>{
  const page=await loadNatHistoryPageV3(businessId,cursor,limit);
  const map=await receivables(businessId,page.sales.map((sale)=>sale.id));
  return{...page,sales:page.sales.map((sale)=>mergeReceivable(sale,map.get(sale.id)))};
}

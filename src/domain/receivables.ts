import type { Customer, NatState, Sale } from "./types.js";

export type ReceivableStage="none"|"pending"|"overdue"|"critical";
export type PayerProfileStatus="no_credit_history"|"good"|"pending"|"overdue"|"critical"|"warning_history";
export type PurchasePaymentState="paid"|"pending"|"overdue";
export type ReceivableSale=Pick<Sale,"status"|"transactionType"|"paymentStatus"|"paymentDueAt"|"paymentCriticalAt">;

export function saleValue(sale:Sale){
  return sale.saleValueSnapshot??sale.totalReceived;
}

export function receivableStage(sale:ReceivableSale,now=new Date()):ReceivableStage{
  if(sale.status==="cancelled"||(sale.transactionType??"sale")!=="sale"||sale.paymentStatus!=="pending"||!sale.paymentDueAt)return"none";
  if(sale.paymentCriticalAt)return"critical";
  const elapsed=now.getTime()-new Date(sale.paymentDueAt).getTime();
  if(elapsed>=48*60*60*1000)return"critical";
  if(elapsed>=5*60*60*1000)return"overdue";
  return"pending";
}

export function purchasePaymentState(sale:ReceivableSale,now=new Date()):PurchasePaymentState{
  if(sale.paymentStatus!=="pending")return"paid";
  const stage=receivableStage(sale,now);
  return stage==="overdue"||stage==="critical"?"overdue":"pending";
}

export function paymentPromiseLabel(sale:Sale){
  if(!sale.paymentPromisedDate)return null;
  const [year,month,day]=sale.paymentPromisedDate.slice(0,10).split("-").map(Number);
  const date=new Intl.DateTimeFormat("pt-BR").format(new Date(year,month-1,day,12));
  return sale.paymentPromisedTime?`${date} às ${sale.paymentPromisedTime.slice(0,5)}`:`${date} · referência 09:00`;
}

export function isStreetCustomer(customer:Customer){
  return ["rua","street"].includes((customer.source??"").trim().toLocaleLowerCase("pt-BR"));
}

export function customerPaymentProfile(state:NatState,customerId:string,now=new Date()){
  const creditSales=state.sales.filter((sale)=>sale.customerId===customerId&&sale.status!=="cancelled"&&(sale.transactionType??"sale")==="sale"&&Boolean(sale.paymentPromisedDate));
  const pending=creditSales.filter((sale)=>sale.paymentStatus==="pending");
  const stages=pending.map((sale)=>receivableStage(sale,now));
  const warningHistory=creditSales.filter((sale)=>Boolean(sale.paymentCriticalAt)).length;
  const pendingAmount=pending.reduce((sum,sale)=>sum+saleValue(sale),0);
  let status:PayerProfileStatus="no_credit_history";
  if(stages.includes("critical"))status="critical";
  else if(stages.includes("overdue"))status="overdue";
  else if(stages.includes("pending"))status="pending";
  else if(warningHistory>0)status="warning_history";
  else if(creditSales.length>0)status="good";
  const label:Record<PayerProfileStatus,string>={
    no_credit_history:"Sem histórico de fiado",
    good:"Bom pagador",
    pending:"Pagamento combinado",
    overdue:"Pagamento em atraso",
    critical:"Atrasado crítico",
    warning_history:"Histórico de atraso",
  };
  return{status,label:label[status],creditSales:creditSales.length,pendingSales:pending.length,pendingAmount,warningHistory};
}

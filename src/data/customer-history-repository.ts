import { purchasePaymentState, type PurchasePaymentState } from "@/domain/nat";
import { supabase } from "@/integrations/supabase/client";

type SaleRow={
  id:string;
  sold_at:string;
  sale_value_snapshot:number|string|null;
  total_received:number|string|null;
  payment_status:string|null;
  payment_due_at:string|null;
  payment_critical_at:string|null;
};

type SaleItemRow={sale_id:string;quantity:number|string;product_name_snapshot:string};

export type CustomerPurchaseHistoryRow={
  id:string;
  soldAt:string;
  orderSummary:string;
  value:number;
  paymentState:PurchasePaymentState;
};

const numberValue=(value:number|string|null|undefined)=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:0;};
const quantityLabel=(value:number|string)=>new Intl.NumberFormat("pt-BR",{maximumFractionDigits:2}).format(numberValue(value));

export async function loadCustomerPurchaseHistory(businessId:string,customerId:string):Promise<CustomerPurchaseHistoryRow[]>{
  const salesResult=await supabase.from("sales").select("id,sold_at,sale_value_snapshot,total_received,payment_status,payment_due_at,payment_critical_at").eq("business_id",businessId).eq("customer_id",customerId).eq("status","completed").or("transaction_type.eq.sale,transaction_type.is.null").order("sold_at",{ascending:false});
  if(salesResult.error)throw new Error(`Não foi possível carregar as compras do cliente: ${salesResult.error.message}`);
  const sales=(salesResult.data??[]) as unknown as SaleRow[];
  if(!sales.length)return[];

  const items:SaleItemRow[]=[];
  const ids=sales.map((sale)=>sale.id);
  for(let index=0;index<ids.length;index+=200){
    const itemResult=await supabase.from("sale_items").select("sale_id,quantity,product_name_snapshot").eq("business_id",businessId).in("sale_id",ids.slice(index,index+200));
    if(itemResult.error)throw new Error(`Não foi possível carregar os itens dos pedidos: ${itemResult.error.message}`);
    items.push(...((itemResult.data??[]) as unknown as SaleItemRow[]));
  }

  const bySale=new Map<string,SaleItemRow[]>();
  for(const item of items){const current=bySale.get(item.sale_id)??[];current.push(item);bySale.set(item.sale_id,current);}

  return sales.map((sale)=>{
    const lines=bySale.get(sale.id)??[];
    const orderSummary=lines.length?lines.map((line)=>`${quantityLabel(line.quantity)}× ${line.product_name_snapshot}`).join(" · "):`Pedido ${sale.id.slice(0,8)}`;
    return{
      id:sale.id,
      soldAt:sale.sold_at,
      orderSummary,
      value:numberValue(sale.sale_value_snapshot??sale.total_received),
      paymentState:purchasePaymentState({status:"completed",transactionType:"sale",paymentStatus:sale.payment_status==="pending"?"pending":"paid",paymentDueAt:sale.payment_due_at,paymentCriticalAt:sale.payment_critical_at}),
    };
  });
}

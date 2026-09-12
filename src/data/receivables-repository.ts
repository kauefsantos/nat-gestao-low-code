import { supabase } from "@/integrations/supabase/client";
import type { PaymentMethod } from "@/domain/nat";

export async function markSalePaid(args:{businessId:string;saleId:string;paymentMethod:PaymentMethod;expectedUpdatedAt?:string|null}){
  let expected=args.expectedUpdatedAt??null;
  if(!expected){
    const version=await supabase.from("sales").select("updated_at").eq("business_id",args.businessId).eq("id",args.saleId).maybeSingle();
    if(version.error)throw new Error(`Não foi possível conferir a venda: ${version.error.message}`);
    if(!version.data?.updated_at)throw new Error("Venda não encontrada.");
    expected=version.data.updated_at;
  }
  const result=await supabase.rpc("mark_sale_paid_v1",{
    p_business_id:args.businessId,
    p_sale_id:args.saleId,
    p_payment_method:args.paymentMethod,
    p_expected_updated_at:expected,
  });
  if(result.error)throw new Error(`Não foi possível quitar o pagamento: ${result.error.message}`);
  const row=(result.data&&typeof result.data==="object"&&!Array.isArray(result.data)?result.data:{}) as Record<string,unknown>;
  return{updatedAt:row.updatedAt==null?null:String(row.updatedAt),amount:Number(row.amount??0),alreadyPaid:row.alreadyPaid===true};
}

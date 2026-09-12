import { supabase } from "@/integrations/supabase/client";
import type { PaymentMethod } from "@/domain/nat";

export async function markSalePaid(args:{businessId:string;saleId:string;paymentMethod:PaymentMethod;expectedUpdatedAt?:string|null}){
  const result=await supabase.rpc("mark_sale_paid_v1",{
    p_business_id:args.businessId,
    p_sale_id:args.saleId,
    p_payment_method:args.paymentMethod,
    p_expected_updated_at:args.expectedUpdatedAt??null,
  });
  if(result.error)throw new Error(`Não foi possível quitar o pagamento: ${result.error.message}`);
  const row=(result.data&&typeof result.data==="object"&&!Array.isArray(result.data)?result.data:{}) as Record<string,unknown>;
  return{updatedAt:row.updatedAt==null?null:String(row.updatedAt),amount:Number(row.amount??0),alreadyPaid:row.alreadyPaid===true};
}

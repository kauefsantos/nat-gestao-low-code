import { supabase } from "@/integrations/supabase/client";
import type { PaymentMethod } from "@/domain/nat";

function failure(context:string,error:{message:string}|null){if(error)throw new Error(`${context}: ${error.message}`);}

export async function markSalePaidCloud(businessId:string,saleId:string,paymentMethod:PaymentMethod){
  const version=await supabase.from("sales").select("updated_at").eq("business_id",businessId).eq("id",saleId).maybeSingle();
  failure("Não foi possível conferir a venda",version.error);
  if(!version.data?.updated_at)throw new Error("Venda não encontrada.");
  const result=await supabase.rpc("mark_sale_paid_v1",{p_business_id:businessId,p_sale_id:saleId,p_payment_method:paymentMethod,p_expected_updated_at:version.data.updated_at});
  failure("Não foi possível registrar o pagamento",result.error);
  return result.data;
}

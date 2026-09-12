import { supabase } from "@/integrations/supabase/client";
import { loadCurrentBusinessId } from "@/data/business-context-repository";

export type ConsentInfo = {
  status: string;
  occurred_at: string;
  expires_at: string | null;
  notice_version: string;
};

export async function loadLatestCustomerConsent(customerId: string): Promise<ConsentInfo | null> {
  const businessId = await loadCurrentBusinessId();
  if (!businessId) return null;

  const result = await supabase
    .from("customer_marketing_consents")
    .select("status,occurred_at,expires_at,notice_version")
    .eq("business_id", businessId)
    .eq("customer_id", customerId)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) throw new Error(`Não foi possível consultar a autorização do cliente: ${result.error.message}`);
  return result.data;
}

export async function eraseCustomerPrivacy(customerId: string, reason: string) {
  const businessId = await loadCurrentBusinessId();
  if (!businessId) throw new Error("Não encontramos os dados da NAT. Tente novamente.");

  const result = await supabase.rpc("erase_customer_privacy_v1", {
    p_business_id: businessId,
    p_customer_id: customerId,
    p_reason: reason,
  });
  if (result.error) throw new Error(`Não foi possível excluir os dados pessoais: ${result.error.message}`);
  return result.data;
}

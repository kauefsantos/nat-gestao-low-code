import { supabase } from "@/integrations/supabase/client";
import { loadCurrentBusinessId } from "@/data/business-context-repository";

export type ContentFormat = "feed" | "story" | "square";
export type AiCopy = {
  headline: string;
  subheadline: string;
  caption: string;
  cta: string;
  visual_direction: string;
};

export async function loadContentAiStatus(): Promise<{ businessId: string | null; connected: boolean }> {
  const businessId = await loadCurrentBusinessId();
  if (!businessId) return { businessId: null, connected: false };
  const result = await supabase.rpc("content_ai_status", { p_business_id: businessId });
  if (result.error) throw new Error(`Não foi possível consultar a conexão de IA: ${result.error.message}`);
  return { businessId, connected: Boolean(result.data) };
}

export async function configureContentAi(businessId: string, apiKey: string) {
  const result = await supabase.rpc("configure_content_ai", { p_business_id: businessId, p_api_key: apiKey });
  if (result.error) throw new Error(`Não foi possível conectar a IA: ${result.error.message}`);
}

export async function disconnectContentAi(businessId: string) {
  const result = await supabase.rpc("disconnect_content_ai", { p_business_id: businessId });
  if (result.error) throw new Error(`Não foi possível desconectar a IA: ${result.error.message}`);
}

export async function generateContentWithAi(args: { businessId: string; prompt: string; format: ContentFormat }): Promise<AiCopy> {
  const result = await supabase.functions.invoke<AiCopy>("nat-content-ai", {
    body: { businessId: args.businessId, prompt: args.prompt, format: args.format },
  });
  if (result.error) throw new Error(`Não foi possível gerar o conteúdo: ${result.error.message}`);
  if (!result.data?.headline || !result.data.caption) throw new Error("A IA não retornou um conteúdo válido.");
  return result.data;
}

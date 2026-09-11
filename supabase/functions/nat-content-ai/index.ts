import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.99.2";

const allowedOrigins = [
  "https://nat-gestao.lovable.app",
  "https://id-preview--e8925812-e861-40fe-89fd-38bc287dafd9.lovable.app",
];
const AI_TIMEOUT_MS = 30_000;

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowed = allowedOrigins.includes(origin) || origin.startsWith("http://localhost:");
  return {
    "Access-Control-Allow-Origin": allowed ? origin : allowedOrigins[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function getServiceKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!raw) throw new Error("Supabase secret key is unavailable.");
  const parsed = JSON.parse(raw) as Record<string, string>;
  const key = parsed.default ?? Object.values(parsed)[0];
  if (!key) throw new Error("Supabase secret key is unavailable.");
  return key;
}

function jwtPayload(token: string) {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    return JSON.parse(atob(padded)) as { aal?: string };
  } catch {
    return null;
  }
}

function extractOutputText(payload: any) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const chunks: string[] = [];
  for (const item of payload?.output ?? []) for (const content of item?.content ?? []) if (content?.type === "output_text" && typeof content.text === "string") chunks.push(content.text);
  return chunks.join("\n");
}
function parseJsonText(value: string) { return JSON.parse(value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")); }
function clampText(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function elapsed(startedAt: number) { return Math.max(0, Date.now() - startedAt); }
function usageOf(payload: any) {
  const usage = payload?.usage ?? {};
  return {
    input: Number.isFinite(Number(usage.input_tokens)) ? Number(usage.input_tokens) : null,
    output: Number.isFinite(Number(usage.output_tokens)) ? Number(usage.output_tokens) : null,
    total: Number.isFinite(Number(usage.total_tokens)) ? Number(usage.total_tokens) : null,
  };
}
async function finishLog(admin: SupabaseClient | null, id: string | null, startedAt: number, status: string, options: { providerStatus?:number|null; usage?:ReturnType<typeof usageOf>; errorCode?:string|null } = {}) {
  if (!admin || !id) return;
  const result = await admin.rpc("finish_content_ai_generation",{
    p_id:id,
    p_status:status,
    p_latency_ms:elapsed(startedAt),
    p_provider_status:options.providerStatus ?? null,
    p_input_tokens:options.usage?.input ?? null,
    p_output_tokens:options.usage?.output ?? null,
    p_total_tokens:options.usage?.total ?? null,
    p_error_code:options.errorCode ?? null,
  });
  if (result.error) console.error("AI usage log finalization failed",result.error.message);
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });

  const startedAt = Date.now();
  let admin: SupabaseClient | null = null;
  let logId: string | null = null;
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    if (jwtPayload(token)?.aal !== "aal2") return new Response(JSON.stringify({ error: "MFA_REQUIRED" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });

    const url = Deno.env.get("SUPABASE_URL");
    if (!url) throw new Error("Supabase URL is unavailable.");
    admin = createClient(url, getServiceKey(), { auth: { persistSession: false, autoRefreshToken: false } });

    const userResult = await admin.auth.getUser(token);
    if (userResult.error || !userResult.data.user) return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    const body = await req.json();
    const businessId = typeof body?.businessId === "string" ? body.businessId : "";
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    const format = ["feed", "story", "square"].includes(body?.format) ? body.format : "feed";
    if (!businessId || prompt.length < 3 || prompt.length > 1500) return new Response(JSON.stringify({ error: "INVALID_INPUT" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

    const membership = await admin.from("business_members").select("role").eq("business_id", businessId).eq("user_id", userResult.data.user.id).maybeSingle();
    if (membership.error || !membership.data) return new Response(JSON.stringify({ error: "FORBIDDEN" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });

    const quota = await admin.rpc("claim_content_ai_quota",{ p_business_id:businessId,p_user_id:userResult.data.user.id,p_format:format,p_prompt_chars:prompt.length });
    if (quota.error) throw quota.error;
    logId = quota.data as string | null;
    if (!logId) {
      console.warn("nat-content-ai rate limited",userResult.data.user.id);
      return new Response(JSON.stringify({ error: "RATE_LIMITED" }), { status: 429, headers: { ...cors, "Content-Type": "application/json", "Retry-After":"600" } });
    }

    const keyResult = await admin.rpc("get_content_ai_key", { p_business_id: businessId });
    if (keyResult.error) throw keyResult.error;
    const apiKey = keyResult.data as string | null;
    if (!apiKey) {
      await finishLog(admin,logId,startedAt,"failed",{errorCode:"AI_NOT_CONFIGURED"});
      return new Response(JSON.stringify({ error: "AI_NOT_CONFIGURED" }), { status: 503, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const instructions = [
      "Você é a redatora e diretora criativa da NAT, marca brasileira de brownies e brigadeiros gourmet.",
      "Tom: afetivo, elegante, artesanal e próximo. Evite linguagem infantil, excesso de diminutivos, clichês de gourmet e muitas exclamações.",
      "Identidade: chocolate #35150A, cacau #55281B, rosé #EAAC93, creme #F8EEE9; títulos elegantes e corpo simples.",
      "Crie uma peça social objetiva para o formato solicitado.",
      "Retorne SOMENTE JSON válido, sem markdown, com as chaves: headline, subheadline, caption, cta, visual_direction.",
      "headline: até 52 caracteres; subheadline: até 90; caption: até 550; cta: até 45; visual_direction: até 220.",
      "Não invente preço, prazo, estoque, ingredientes ou disponibilidade que não estejam no pedido do usuário."
    ].join("\n");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(),AI_TIMEOUT_MS);
    let openai: Response;
    try {
      openai = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-5.6-luna",instructions,input:`Formato: ${format}\nPedido da usuária: ${prompt}`,max_output_tokens:700 }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        await finishLog(admin,logId,startedAt,"timeout",{errorCode:"AI_TIMEOUT"});
        return new Response(JSON.stringify({ error: "AI_TIMEOUT" }), { status: 504, headers: { ...cors, "Content-Type": "application/json" } });
      }
      throw error;
    } finally { clearTimeout(timeout); }

    const responseJson = await openai.json();
    const usage = usageOf(responseJson);
    if (!openai.ok) {
      console.error("OpenAI error", openai.status, responseJson?.error?.type ?? "unknown");
      await finishLog(admin,logId,startedAt,"provider_error",{providerStatus:openai.status,usage,errorCode:"AI_PROVIDER_ERROR"});
      return new Response(JSON.stringify({ error: "AI_PROVIDER_ERROR" }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    }

    try {
      const outputText = extractOutputText(responseJson);
      if (!outputText) throw new Error("AI returned no text.");
      const parsed = parseJsonText(outputText);
      const result = { headline:clampText(parsed.headline,52),subheadline:clampText(parsed.subheadline,90),caption:clampText(parsed.caption,550),cta:clampText(parsed.cta,45),visual_direction:clampText(parsed.visual_direction,220) };
      if (!result.headline || !result.caption) throw new Error("AI response was incomplete.");
      await finishLog(admin,logId,startedAt,"succeeded",{providerStatus:openai.status,usage});
      return new Response(JSON.stringify(result), { headers: { ...cors, "Content-Type": "application/json" } });
    } catch (error) {
      console.error("AI output validation",error instanceof Error ? error.message : "unknown");
      await finishLog(admin,logId,startedAt,"invalid_output",{providerStatus:openai.status,usage,errorCode:"AI_INVALID_OUTPUT"});
      return new Response(JSON.stringify({ error: "AI_INVALID_OUTPUT" }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    }
  } catch (error) {
    console.error("nat-content-ai", error instanceof Error ? error.message : "unknown");
    await finishLog(admin,logId,startedAt,"failed",{errorCode:"INTERNAL_ERROR"});
    return new Response(JSON.stringify({ error: "INTERNAL_ERROR" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});

import { supabase } from "@/integrations/supabase/client";
import { resilientRequest } from "@/lib/resilient-request";

export type IntegrationHealth = {
  generatedAt: string;
  push: {
    sent24h: number;
    retrying: number;
    deadLetter: number;
    expired24h: number;
    oldestRetryAt: string | null;
  };
  jobsObserved: false;
  ai: {
    enabled: boolean;
    calls24h: number;
    failed24h: number;
    circuitOpenUntil: string | null;
  };
};

function oldest(values: Array<string | null>) {
  return values.filter((value): value is string => Boolean(value)).sort()[0] ?? null;
}

export async function loadIntegrationHealth(businessId: string): Promise<IntegrationHealth> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  return resilientRequest(async () => {
    const [pushResult, aiLogResult, aiStatusResult] = await Promise.all([
      supabase
        .from("notification_delivery_log")
        .select("status,next_retry_at,sent_at,created_at")
        .eq("business_id", businessId)
        .gte("created_at", since),
      supabase
        .from("ai_generation_log")
        .select("status,created_at")
        .eq("business_id", businessId)
        .gte("created_at", since),
      supabase.rpc("content_ai_status", { p_business_id: businessId }),
    ]);

    if (pushResult.error) throw pushResult.error;
    if (aiLogResult.error) throw aiLogResult.error;
    if (aiStatusResult.error) throw aiStatusResult.error;

    const pushRows = pushResult.data ?? [];
    const aiRows = aiLogResult.data ?? [];
    const retryRows = pushRows.filter((row) => row.status === "retrying" || Boolean(row.next_retry_at));

    return {
      generatedAt: new Date().toISOString(),
      push: {
        sent24h: pushRows.filter((row) => row.status === "sent" || Boolean(row.sent_at)).length,
        retrying: retryRows.length,
        deadLetter: pushRows.filter((row) => row.status === "dead_letter").length,
        expired24h: pushRows.filter((row) => row.status === "expired").length,
        oldestRetryAt: oldest(retryRows.map((row) => row.next_retry_at)),
      },
      jobsObserved: false as const,
      ai: {
        enabled: Boolean(aiStatusResult.data),
        calls24h: aiRows.length,
        failed24h: aiRows.filter((row) => row.status === "failed").length,
        circuitOpenUntil: null,
      },
    };
  }, { attempts: 2, timeoutMs: 8_000 });
}

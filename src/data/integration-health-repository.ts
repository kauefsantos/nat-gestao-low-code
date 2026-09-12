import { supabase } from "@/integrations/supabase/client";
import { resilientRequest } from "@/lib/resilient-request";

export type JobHealth = {
  name: string;
  lastStartedAt: string | null;
  lastSucceededAt: string | null;
  lastFailedAt: string | null;
  status: string;
  stale: boolean;
};

export type IntegrationHealth = {
  generatedAt: string;
  push: {
    sent24h: number;
    retrying: number;
    deadLetter: number;
    expired24h: number;
    oldestRetryAt: string | null;
  };
  jobs: JobHealth[];
  ai: {
    enabled: boolean;
    calls24h: number;
    failed24h: number;
    circuitOpenUntil: string | null;
  };
};

function healthFrom(value: unknown): IntegrationHealth {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const push = row.push && typeof row.push === "object" && !Array.isArray(row.push) ? row.push as Record<string, unknown> : {};
  const ai = row.ai && typeof row.ai === "object" && !Array.isArray(row.ai) ? row.ai as Record<string, unknown> : {};
  const jobs = Array.isArray(row.jobs) ? row.jobs : [];
  return {
    generatedAt: String(row.generatedAt ?? new Date().toISOString()),
    push: {
      sent24h: Number(push.sent24h ?? 0),
      retrying: Number(push.retrying ?? 0),
      deadLetter: Number(push.deadLetter ?? 0),
      expired24h: Number(push.expired24h ?? 0),
      oldestRetryAt: push.oldestRetryAt == null ? null : String(push.oldestRetryAt),
    },
    jobs: jobs.map((item) => {
      const job = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {};
      return {
        name: String(job.name ?? "job"),
        lastStartedAt: job.lastStartedAt == null ? null : String(job.lastStartedAt),
        lastSucceededAt: job.lastSucceededAt == null ? null : String(job.lastSucceededAt),
        lastFailedAt: job.lastFailedAt == null ? null : String(job.lastFailedAt),
        status: String(job.status ?? "unknown"),
        stale: job.stale === true,
      };
    }),
    ai: {
      enabled: ai.enabled === true,
      calls24h: Number(ai.calls24h ?? 0),
      failed24h: Number(ai.failed24h ?? 0),
      circuitOpenUntil: ai.circuitOpenUntil == null ? null : String(ai.circuitOpenUntil),
    },
  };
}

export async function loadIntegrationHealth(businessId: string): Promise<IntegrationHealth> {
  return resilientRequest(async () => {
    const result = await supabase.rpc("get_integration_health", { p_business_id: businessId });
    if (result.error) throw result.error;
    return healthFrom(result.data);
  }, { attempts: 2, timeoutMs: 8_000 });
}

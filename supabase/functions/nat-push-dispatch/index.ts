import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.99.2";
import webpush from "npm:web-push@3.6.7";

function getServiceKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const single = Deno.env.get("SUPABASE_SECRET_KEY");
  if (single) return single;
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    const parsed = JSON.parse(raw) as Record<string, string>;
    const key = parsed.default ?? Object.values(parsed)[0];
    if (key) return key;
  }
  throw new Error("Lovable Cloud backend key is unavailable.");
}

async function secureEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

function localDate(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function plusOneDay(date: string) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + 1); return value.toISOString().slice(0, 10); }
function reminderCopy(slot: number, count: number) {
  const plural = count === 1 ? "compromisso" : "compromissos";
  if (slot === 21) return { title: "Amanhã na NAT", body: `Você tem ${count} ${plural} na agenda de amanhã.` };
  const prefix = slot === 9 ? "Bom dia" : slot === 12 ? "Agenda do meio-dia" : "Agenda da tarde";
  return { title: `${prefix} · NAT`, body: `Você tem ${count} ${plural} na agenda.` };
}
function belongsToSlot(slot: number, eventTime: string | null) {
  if (slot === 21) return true;
  const hour = eventTime ? Number(eventTime.slice(0, 2)) : null;
  if (slot === 9) return hour === null || hour < 12;
  if (slot === 12) return hour !== null && hour >= 12 && hour < 16;
  return hour !== null && hour >= 16;
}
function statusCodeOf(error: unknown) {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return null;
  const value = (error as { statusCode?: unknown }).statusCode;
  return typeof value === "number" ? value : null;
}
function retryAfterOf(error: unknown) {
  if (typeof error !== "object" || error === null || !("headers" in error)) return null;
  const headers = (error as { headers?: Record<string, string | string[]> }).headers;
  const raw = headers?.["retry-after"] ?? headers?.["Retry-After"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(Math.round(seconds), 86400);
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(1, Math.min(Math.ceil((date - Date.now()) / 1000), 86400));
  return null;
}
function transientStatus(status: number | null) { return status === null || [408, 425, 429, 500, 502, 503, 504].includes(status); }

type Subscription = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };
type Counters = { sent: number; skipped: number; retry_scheduled: number; expired: number; dead_letter: number };

async function deliver(admin: SupabaseClient, subscription: Subscription, businessId: string, localDateValue: string, slot: number, eventCount: number, counters: Counters) {
  const claim = await admin.rpc("claim_push_delivery", {
    p_business_id: businessId, p_subscription_id: subscription.id, p_user_id: subscription.user_id,
    p_local_date: localDateValue, p_slot: slot, p_event_count: eventCount, p_lease_seconds: 120,
  });
  if (claim.error) throw claim.error;
  const claimed = claim.data as { claimed?: boolean; id?: string; status?: string; attemptCount?: number } | null;
  if (!claimed?.claimed || !claimed.id) { counters.skipped += 1; return; }

  const copy = reminderCopy(slot, eventCount);
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify({ ...copy, tag: `nat-${localDateValue}-${slot}`, url: "/dashboard?view=calendar" }),
      { TTL: 60 * 60 * 6 },
    );
    const completed = await admin.rpc("complete_push_delivery", { p_id: claimed.id });
    if (completed.error) throw completed.error;
    counters.sent += 1;
  } catch (error) {
    const status = statusCodeOf(error);
    const permanent = status === 404 || status === 410;
    if (permanent) {
      await admin.from("push_subscriptions").update({ enabled: false, updated_at: new Date().toISOString() }).eq("id", subscription.id);
    }
    const failed = await admin.rpc("fail_push_delivery", {
      p_id: claimed.id,
      p_permanent: permanent,
      p_provider_status: status,
      p_error_code: permanent ? "SUBSCRIPTION_EXPIRED" : transientStatus(status) ? "TRANSIENT_PUSH_ERROR" : "PUSH_ERROR",
      p_error_message: error instanceof Error ? error.message : "Push provider error",
      p_retry_after_seconds: retryAfterOf(error),
      p_max_attempts: 5,
    });
    if (failed.error) throw failed.error;
    const outcome = failed.data as { status?: string } | null;
    if (outcome?.status === "expired") counters.expired += 1;
    else if (outcome?.status === "retry") counters.retry_scheduled += 1;
    else counters.dead_letter += 1;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), { status: 405, headers: { "Content-Type": "application/json" } });
  try {
    const url = Deno.env.get("SUPABASE_URL");
    if (!url) throw new Error("Lovable Cloud backend URL is unavailable.");
    const admin = createClient(url, getServiceKey(), { auth: { persistSession: false, autoRefreshToken: false } });

    const secretResult = await admin.rpc("get_push_cron_secret");
    if (secretResult.error) throw secretResult.error;
    const expectedSecret = typeof secretResult.data === "string" ? secretResult.data : "";
    if (!expectedSecret) return new Response(JSON.stringify({ error: "CRON_SECRET_NOT_CONFIGURED" }), { status: 503, headers: { "Content-Type": "application/json" } });
    const suppliedSecret = req.headers.get("x-nat-cron-secret") ?? "";
    if (!suppliedSecret || !(await secureEqual(suppliedSecret, expectedSecret))) {
      return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }

    const configResult = await admin.rpc("get_push_backend_config");
    if (configResult.error) throw configResult.error;
    const config = configResult.data as { vapidPublic?: string; vapidPrivate?: string; subject?: string } | null;
    if (!config?.vapidPublic || !config.vapidPrivate) return new Response(JSON.stringify({ error: "PUSH_NOT_CONFIGURED" }), { status: 503, headers: { "Content-Type": "application/json" } });
    webpush.setVapidDetails(config.subject || "mailto:admin@nat-gestao.local", config.vapidPublic, config.vapidPrivate);

    const body = await req.json().catch(() => ({}));
    const slot = Number(body?.slot);
    if (![9, 12, 16, 21].includes(slot)) return new Response(JSON.stringify({ error: "INVALID_SLOT" }), { status: 400, headers: { "Content-Type": "application/json" } });

    const counters: Counters = { sent: 0, skipped: 0, retry_scheduled: 0, expired: 0, dead_letter: 0 };

    // Fresh deliveries are calculated per business timezone. Sao Paulo remains the default.
    const settings = await admin.from("business_settings").select("business_id,timezone");
    if (settings.error) throw settings.error;
    for (const setting of settings.data ?? []) {
      const timeZone = typeof setting.timezone === "string" && setting.timezone ? setting.timezone : "America/Sao_Paulo";
      const today = localDate(timeZone);
      const targetDate = slot === 21 ? plusOneDay(today) : today;
      const eventsResult = await admin.from("calendar_events")
        .select("event_time").eq("business_id", setting.business_id).eq("event_date", targetDate).eq("status", "planned").eq("reminder_enabled", true);
      if (eventsResult.error) throw eventsResult.error;
      const events = (eventsResult.data ?? []).filter((event) => belongsToSlot(slot, event.event_time));
      if (!events.length) continue;
      const subsResult = await admin.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth").eq("business_id", setting.business_id).eq("enabled", true);
      if (subsResult.error) throw subsResult.error;
      for (const subscription of (subsResult.data ?? []) as Subscription[]) await deliver(admin, subscription, setting.business_id, targetDate, slot, events.length, counters);
    }

    // Due retries are independent from today's current slot and reuse the same idempotency ledger.
    const retries = await admin.rpc("list_due_push_retries", { p_limit: 200 });
    if (retries.error) throw retries.error;
    for (const retry of (retries.data ?? []) as Array<{ business_id: string; subscription_id: string; user_id: string; local_date: string; slot: number; event_count: number }>) {
      const subResult = await admin.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth").eq("id", retry.subscription_id).eq("enabled", true).maybeSingle();
      if (subResult.error) throw subResult.error;
      if (!subResult.data) { counters.skipped += 1; continue; }
      await deliver(admin, subResult.data as Subscription, retry.business_id, retry.local_date, retry.slot, retry.event_count, counters);
    }

    return new Response(JSON.stringify({ ok: true, slot, ...counters }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    console.error("nat-push-dispatch", error instanceof Error ? error.message : "unknown");
    return new Response(JSON.stringify({ error: "INTERNAL_ERROR" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});

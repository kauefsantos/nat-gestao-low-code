import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.99.2";
import webpush from "npm:web-push@3.6.7";

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

function localDate(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function plusOneDay(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function reminderCopy(slot: number, count: number, firstTitle: string) {
  if (slot === 21) return {
    title: "Amanhã na NAT",
    body: `${count} ${count === 1 ? "compromisso" : "compromissos"} na agenda. ${firstTitle}`,
  };
  const prefix = slot === 9 ? "Bom dia" : slot === 12 ? "Agenda do meio-dia" : "Agenda da tarde";
  return {
    title: `${prefix} · NAT`,
    body: `${count} ${count === 1 ? "pendência" : "pendências"} para hoje. ${firstTitle}`,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), { status: 405, headers: { "Content-Type": "application/json" } });

  try {
    const url = Deno.env.get("SUPABASE_URL");
    if (!url) throw new Error("Supabase URL is unavailable.");
    const admin = createClient(url, getServiceKey(), { auth: { persistSession: false, autoRefreshToken: false } });

    const configResult = await admin.rpc("get_push_backend_config");
    if (configResult.error) throw configResult.error;
    const config = configResult.data as { vapidPublic?: string; vapidPrivate?: string; cronSecret?: string; subject?: string } | null;
    if (!config?.vapidPublic || !config.vapidPrivate || !config.cronSecret) {
      return new Response(JSON.stringify({ error: "PUSH_NOT_CONFIGURED" }), { status: 503, headers: { "Content-Type": "application/json" } });
    }

    const suppliedSecret = req.headers.get("x-nat-cron-secret") ?? "";
    if (!suppliedSecret || suppliedSecret !== config.cronSecret) {
      return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const slot = Number(body?.slot);
    if (![9, 12, 16, 21].includes(slot)) {
      return new Response(JSON.stringify({ error: "INVALID_SLOT" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    webpush.setVapidDetails(config.subject || "mailto:admin@nat-gestao.local", config.vapidPublic, config.vapidPrivate);

    const today = localDate("America/Sao_Paulo");
    const targetDate = slot === 21 ? plusOneDay(today) : today;
    const eventsResult = await admin.from("calendar_events")
      .select("business_id,event_time,title,status")
      .eq("event_date", targetDate)
      .eq("status", "planned");

    if (eventsResult.error) throw eventsResult.error;
    const allEvents = eventsResult.data ?? [];

    const byBusiness = new Map<string, Array<{ event_time: string | null; title: string }>>();
    for (const event of allEvents) {
      if (slot !== 21 && event.event_time && event.event_time.slice(0, 2) < String(slot).padStart(2, "0")) continue;
      const list = byBusiness.get(event.business_id) ?? [];
      list.push({ event_time: event.event_time, title: event.title });
      byBusiness.set(event.business_id, list);
    }

    let sent = 0;
    let skipped = 0;
    let expired = 0;

    for (const [businessId, events] of byBusiness) {
      if (!events.length) continue;
      events.sort((a, b) => (a.event_time ?? "99:99").localeCompare(b.event_time ?? "99:99"));
      const subsResult = await admin.from("push_subscriptions")
        .select("id,user_id,endpoint,p256dh,auth")
        .eq("business_id", businessId)
        .eq("enabled", true);
      if (subsResult.error) throw subsResult.error;

      const copy = reminderCopy(slot, events.length, events[0].title);
      for (const subscription of subsResult.data ?? []) {
        const existing = await admin.from("notification_delivery_log")
          .select("id")
          .eq("subscription_id", subscription.id)
          .eq("local_date", targetDate)
          .eq("slot", slot)
          .maybeSingle();
        if (existing.error) throw existing.error;
        if (existing.data) {
          skipped += 1;
          continue;
        }

        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            JSON.stringify({
              ...copy,
              tag: `nat-${targetDate}-${slot}`,
              url: "/dashboard?view=calendar",
            }),
            { TTL: 60 * 60 * 6 },
          );

          const log = await admin.from("notification_delivery_log").insert({
            business_id: businessId,
            subscription_id: subscription.id,
            user_id: subscription.user_id,
            local_date: targetDate,
            slot,
            event_count: events.length,
          });
          if (log.error && log.error.code !== "23505") throw log.error;
          sent += 1;
        } catch (error: any) {
          if (error?.statusCode === 404 || error?.statusCode === 410) {
            await admin.from("push_subscriptions").update({ enabled: false, updated_at: new Date().toISOString() }).eq("id", subscription.id);
            expired += 1;
            continue;
          }
          console.error("push delivery failed", error?.statusCode ?? "unknown");
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, slot, targetDate, sent, skipped, expired }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    console.error("nat-push-dispatch", error instanceof Error ? error.message : "unknown");
    return new Response(JSON.stringify({ error: "INTERNAL_ERROR" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});

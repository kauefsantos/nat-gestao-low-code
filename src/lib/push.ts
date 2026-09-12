import { supabase } from "@/integrations/supabase/client";
import { resilientRequest } from "@/lib/resilient-request";

export type PushState = "unsupported" | "install_required" | "denied" | "prompt" | "enabled" | "disabled";

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  const iosStandalone = "standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return window.matchMedia("(display-mode: standalone)").matches || iosStandalone;
}

function base64UrlToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const normalized = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function supported() {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

async function getRegistration() {
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  return registration;
}

export async function getNatPushState(): Promise<PushState> {
  if (!supported()) return "unsupported";
  if (isIos() && !isStandalone()) return "install_required";
  if (Notification.permission === "denied") return "denied";
  const registration = await getRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) return "enabled";
  return Notification.permission === "default" ? "prompt" : "disabled";
}

export async function enableNatPush(businessId: string): Promise<PushState> {
  if (!supported()) return "unsupported";
  if (isIos() && !isStandalone()) return "install_required";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "prompt";

  const keyResult = await resilientRequest(async()=>{
    const result=await supabase.rpc("get_push_public_key", { p_business_id: businessId });
    if(result.error)throw result.error;
    return result;
  },{attempts:3,timeoutMs:8000});
  if (!keyResult.data) throw new Error("Chave pública de notificações não encontrada.");

  const registration = await getRegistration();
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(keyResult.data),
  });

  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!p256dh || !auth) throw new Error("O iPhone não retornou as chaves da notificação.");

  await resilientRequest(async()=>{
    const saved = await supabase.rpc("save_push_subscription", {
      p_business_id: businessId,
      p_endpoint: subscription.endpoint,
      p_p256dh: p256dh,
      p_auth: auth,
    });
    if(saved.error)throw saved.error;
    return saved;
  },{attempts:3,timeoutMs:10000});
  return "enabled";
}

export async function disableNatPush(businessId: string): Promise<PushState> {
  if (!supported()) return "unsupported";
  const registration = await getRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return "disabled";

  await resilientRequest(async()=>{
    const removed = await supabase.rpc("delete_push_subscription", {
      p_business_id: businessId,
      p_endpoint: subscription.endpoint,
    });
    if(removed.error)throw removed.error;
    return removed;
  },{attempts:3,timeoutMs:10000});

  const unsubscribed=await subscription.unsubscribe();
  if(!unsubscribed){
    // The server-side subscription is already disabled; surfacing this state lets the UI
    // advise a reload instead of silently claiming the browser was fully detached.
    throw new Error("Os avisos foram desativados no servidor, mas este navegador não confirmou a remoção local. Recarregue a página e tente novamente.");
  }
  return "disabled";
}

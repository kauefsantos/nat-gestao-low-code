import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/lovable-cloud/database";

// Public Lovable Cloud client configuration for the NAT project.
// These values are intentionally safe to expose in browser code; authorization remains enforced by RLS + MFA.
const DEFAULT_SUPABASE_URL = "https://qkqxzgvctusxybvfsxiu.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Kfba5oA2XoIUjA4tBh_6vw_iyKMDggR";

function getLovableCloudConfiguration() {
  const url =
    import.meta.env.VITE_SUPABASE_URL ||
    (typeof process !== "undefined" ? process.env.SUPABASE_URL : undefined) ||
    DEFAULT_SUPABASE_URL;
  const key =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    (typeof process !== "undefined" ? process.env.SUPABASE_PUBLISHABLE_KEY : undefined) ||
    DEFAULT_SUPABASE_PUBLISHABLE_KEY;
  return { url, key };
}

export function isSupabaseConfigured() {
  const { url, key } = getLovableCloudConfiguration();
  return Boolean(url && key);
}

function createLovableCloudClient() {
  const { url, key } = getLovableCloudConfiguration();
  if (!url || !key) throw new Error("Lovable Cloud não está configurado neste ambiente.");
  return createClient<Database>(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

let instance: ReturnType<typeof createLovableCloudClient> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createLovableCloudClient>, {
  get(_target, property) {
    if (!instance) instance = createLovableCloudClient();
    const value = Reflect.get(instance, property, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

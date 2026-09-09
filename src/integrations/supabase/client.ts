import { createClient } from "@supabase/supabase-js";

function getEnvironment() {
  const url = import.meta.env.VITE_SUPABASE_URL || (typeof process !== "undefined" ? process.env.SUPABASE_URL : undefined);
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || (typeof process !== "undefined" ? process.env.SUPABASE_PUBLISHABLE_KEY : undefined);
  return { url, key };
}

function createSupabaseClient() {
  const { url, key } = getEnvironment();
  if (!url || !key) {
    throw new Error("Supabase não está configurado neste ambiente.");
  }
  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

let instance: ReturnType<typeof createSupabaseClient> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_target, property, receiver) {
    if (!instance) instance = createSupabaseClient();
    return Reflect.get(instance, property, receiver);
  },
});

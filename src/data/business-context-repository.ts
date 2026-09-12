import { supabase } from "@/integrations/supabase/client";

export async function loadCurrentBusinessId(): Promise<string | null> {
  const result = await supabase
    .from("business_members")
    .select("business_id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (result.error) throw new Error(`Não foi possível localizar os dados da NAT: ${result.error.message}`);
  return result.data?.business_id ?? null;
}

export async function signOutCurrentSession() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error("Não foi possível encerrar a sessão.");
}

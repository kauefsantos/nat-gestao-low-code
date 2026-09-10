import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";

export interface AuthState { isAuthenticated: boolean; user: User | null; session: Session | null; isLoading: boolean; configured: boolean }
export function useAuth(): AuthState {
  const configured = isSupabaseConfigured();
  const [user,setUser] = useState<User | null>(null); const [session,setSession] = useState<Session | null>(null); const [isLoading,setIsLoading] = useState(configured);
  useEffect(() => {
    if (!configured) { setIsLoading(false); return; }
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event,nextSession) => { if (!active) return; setSession(nextSession); setUser(nextSession?.user ?? null); setIsLoading(false); });
    void supabase.auth.getSession().then(({ data: { session: nextSession } }) => { if (!active) return; setSession(nextSession); setUser(nextSession?.user ?? null); setIsLoading(false); }).catch(() => { if (active) setIsLoading(false); });
    return () => { active = false; subscription.unsubscribe(); };
  },[configured]);
  return { isAuthenticated: Boolean(session), user, session, isLoading, configured };
}

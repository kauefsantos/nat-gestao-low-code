import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";

export interface AuthState { isAuthenticated: boolean; user: User | null; session: Session | null; isLoading: boolean; configured: boolean }

function sessionHasAal2(session: Session | null) {
  const token = session?.access_token;
  if (!token) return false;
  try {
    const part = token.split(".")[1];
    if (!part) return false;
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const payload = JSON.parse(atob(padded)) as { aal?: unknown };
    return payload.aal === "aal2";
  } catch {
    return false;
  }
}

export function useAuth(): AuthState {
  const configured = isSupabaseConfigured();
  const [user,setUser] = useState<User | null>(null); const [session,setSession] = useState<Session | null>(null); const [isLoading,setIsLoading] = useState(configured);
  useEffect(() => {
    if (!configured) { setIsLoading(false); return; }
    let active = true;
    const applySession = (nextSession: Session | null) => {
      if (!active) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setIsLoading(false);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event,nextSession) => applySession(nextSession));
    void supabase.auth.getSession().then(({ data: { session: nextSession } }) => applySession(nextSession)).catch(() => { if (active) setIsLoading(false); });
    return () => { active = false; subscription.unsubscribe(); };
  },[configured]);
  return { isAuthenticated: Boolean(session) && sessionHasAal2(session), user, session, isLoading, configured };
}

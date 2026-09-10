import { useCallback, useEffect, useRef, useState } from "react";
import { initialState, type NatState } from "@/domain/nat";
import { useAuth } from "@/hooks/use-auth";
import { loadNatCloudState, persistNatTransition } from "@/data/nat-repository";
import { supabase } from "@/integrations/supabase/client";

export function useNatStore() {
  const { user } = useAuth();
  const [state, setState] = useState<NatState>(initialState);
  const [ready, setReady] = useState(false);
  const stateRef = useRef<NatState>(initialState);
  const businessIdRef = useRef<string | null>(null);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());

  const applyState = useCallback((next: NatState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const reloadFromCloud = useCallback(async () => {
    const loaded = await loadNatCloudState();
    businessIdRef.current = loaded.businessId;
    applyState(loaded.state);
  }, [applyState]);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      if (!user) { setReady(false); return; }
      try {
        setReady(false);
        const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (assurance.error) throw assurance.error;
        if (assurance.data.currentLevel !== "aal2") {
          if (typeof window !== "undefined") {
            const target = new URL("/login", window.location.origin);
            target.searchParams.set("mfa", "1");
            window.location.replace(target.toString());
          }
          return;
        }
        const loaded = await loadNatCloudState();
        if (cancelled) return;
        businessIdRef.current = loaded.businessId;
        applyState(loaded.state);
        setReady(true);
      } catch (error) {
        console.error("[NAT] Falha ao carregar dados protegidos", error);
        if (!cancelled && typeof window !== "undefined") window.alert("Não foi possível carregar os dados da NAT. Tente entrar novamente.");
      }
    }
    void hydrate();
    return () => { cancelled = true; };
  }, [applyState, user]);

  const update = useCallback((recipe: (current: NatState) => NatState) => {
    const previous = stateRef.current;
    const next = recipe(previous);
    const businessId = businessIdRef.current;
    applyState(next);
    if (!businessId) return;
    writeQueue.current = writeQueue.current
      .then(() => persistNatTransition(businessId, previous, next))
      .catch(async (error) => {
        console.error("[NAT] Falha ao persistir alteração", error);
        try { await reloadFromCloud(); } catch (reloadError) { console.error("[NAT] Falha ao recarregar após erro de persistência", reloadError); }
        if (typeof window !== "undefined") window.alert("A alteração não pôde ser salva com segurança e foi desfeita. Tente novamente.");
      });
  }, [applyState, reloadFromCloud]);

  const reset = useCallback(() => {
    if (typeof window === "undefined") return;
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith("nat-gestao-")) window.localStorage.removeItem(key);
    }
    void reloadFromCloud();
  }, [reloadFromCloud]);

  return { state, update, reset, ready };
}

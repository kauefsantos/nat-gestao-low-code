import { useCallback, useEffect, useRef, useState } from "react";
import { initialState, type NatState } from "@/domain/nat";
import { useAuth } from "@/hooks/use-auth";
import { loadNatCloudState, persistNatTransition, sameNatState } from "@/data/nat-repository";
import { supabase } from "@/integrations/supabase/client";

const devError = (message: string,error?: unknown) => { if (import.meta.env.DEV) console.error(message,error); };
export function useNatStore() {
  const { user } = useAuth(); const [state,setState] = useState<NatState>(initialState); const [ready,setReady] = useState(false);
  const stateRef = useRef<NatState>(initialState); const businessIdRef = useRef<string | null>(null); const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const applyState = useCallback((next: NatState) => { stateRef.current = next; setState(next); },[]);
  const reloadFromCloud = useCallback(async () => { const loaded = await loadNatCloudState(); businessIdRef.current = loaded.businessId; applyState(loaded.state); setReady(true); },[applyState]);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      if (!user) { setReady(false); return; }
      try {
        setReady(false);
        const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel(); if (assurance.error) throw assurance.error;
        if (assurance.data.currentLevel !== "aal2") { if (typeof window !== "undefined") window.location.replace("/login?mfa=1"); return; }
        const loaded = await loadNatCloudState(); if (cancelled) return; businessIdRef.current = loaded.businessId; applyState(loaded.state); setReady(true);
      } catch (error) { devError("[NAT] Falha ao carregar dados protegidos",error); if (!cancelled && typeof window !== "undefined") window.alert("Não foi possível carregar os dados da NAT. Tente entrar novamente."); }
    }
    void hydrate(); return () => { cancelled = true; };
  },[applyState,user]);

  const update = useCallback((recipe: (current: NatState) => NatState) => {
    const previous = stateRef.current; const next = recipe(previous); const businessId = businessIdRef.current; applyState(next); if (!businessId) return;
    writeQueue.current = writeQueue.current.then(async () => {
      const remote = await loadNatCloudState();
      if (!sameNatState(remote.state,previous)) throw new Error("CONFLICT: dados alterados em outro aparelho");
      await persistNatTransition(businessId,previous,next);
      await reloadFromCloud();
    }).catch(async (error) => {
      devError("[NAT] Falha ao persistir alteração",error);
      try { await reloadFromCloud(); } catch (reloadError) { devError("[NAT] Falha ao recarregar após erro",reloadError); }
      if (typeof window !== "undefined") window.alert(error instanceof Error && error.message.startsWith("CONFLICT") ? "Os dados mudaram em outro aparelho. Recarregamos a versão mais recente; refaça sua alteração." : "A alteração não pôde ser salva com segurança e foi desfeita. Confira os campos e tente novamente.");
    });
  },[applyState,reloadFromCloud]);

  const refresh = useCallback(() => { setReady(false); void reloadFromCloud().catch((error) => { devError("[NAT] Falha ao atualizar",error); setReady(true); }); },[reloadFromCloud]);
  return { state, update, refresh, ready, businessId: businessIdRef.current };
}

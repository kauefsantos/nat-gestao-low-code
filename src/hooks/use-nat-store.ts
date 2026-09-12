import { useCallback, useEffect, useRef, useState } from "react";
import { initialState, type NatState } from "@/domain/nat";
import { useAuth } from "@/hooks/use-auth";
import { emptyNatVersions, loadNatCloudState, persistNatTransition, setProductAvailabilityCloud, type NatVersions } from "@/data/nat-repository";
import { supabase } from "@/integrations/supabase/client";
import { classifyApiError } from "@/lib/api-error";

export type NatSyncNotice = { tone:"saving"|"saved"|"error"; message:string } | null;
const devError = (message: string,error?: unknown) => { if (import.meta.env.DEV) console.error(message,error); };

export function useNatStore() {
  const { user } = useAuth();
  const [state,setState] = useState<NatState>(initialState);
  const [ready,setReady] = useState(false);
  const [loadError,setLoadError] = useState<string|null>(null);
  const [syncNotice,setSyncNotice] = useState<NatSyncNotice>(null);
  const [syncRevision,setSyncRevision] = useState(0);
  const stateRef = useRef<NatState>(initialState);
  const businessIdRef = useRef<string | null>(null);
  const versionsRef = useRef<NatVersions>(emptyNatVersions());
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const writeSequence = useRef(0);
  const noticeTimer = useRef<number|null>(null);

  const applyState = useCallback((next: NatState) => { stateRef.current = next; setState(next); },[]);
  const applyLoaded = useCallback((loaded: Awaited<ReturnType<typeof loadNatCloudState>>) => {
    businessIdRef.current=loaded.businessId; versionsRef.current=loaded.versions; applyState(loaded.state); setLoadError(null);
  },[applyState]);
  const reloadFromCloud = useCallback(async () => { const loaded = await loadNatCloudState(); applyLoaded(loaded); setReady(true); },[applyLoaded]);

  const clearSyncNotice=useCallback(()=>{
    if(noticeTimer.current!==null)window.clearTimeout(noticeTimer.current);
    noticeTimer.current=null;setSyncNotice(null);
  },[]);
  const showSyncNotice=useCallback((notice:Exclude<NatSyncNotice,null>,autoClear=false)=>{
    if(noticeTimer.current!==null)window.clearTimeout(noticeTimer.current);
    setSyncNotice(notice);
    if(autoClear)noticeTimer.current=window.setTimeout(()=>{noticeTimer.current=null;setSyncNotice(null);},2400);
  },[]);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      if (!user) { setReady(false); setLoadError(null); businessIdRef.current=null; versionsRef.current=emptyNatVersions(); return; }
      try {
        setReady(false); setLoadError(null);
        const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel(); if (assurance.error) throw assurance.error;
        if (assurance.data.currentLevel !== "aal2") { if (typeof window !== "undefined") window.location.replace("/login?mfa=1"); return; }
        const loaded = await loadNatCloudState(); if (cancelled) return; applyLoaded(loaded); setReady(true);
      } catch (error) {
        devError("[NAT] Falha ao carregar dados protegidos",error);
        if(!cancelled){setLoadError("Não foi possível carregar os dados da NAT. Confira a conexão e tente novamente.");setReady(true);}
      }
    }
    void hydrate(); return () => { cancelled = true; };
  },[applyLoaded,user]);
  useEffect(()=>()=>{if(noticeTimer.current!==null)window.clearTimeout(noticeTimer.current);},[]);

  const handleWriteError=useCallback(async(error:unknown,sequence:number,fallback:string)=>{
    devError("[NAT] Falha ao persistir alteração",error);
    const classified=classifyApiError(error);
    try { await reloadFromCloud(); setSyncRevision((value)=>value+1); } catch (reloadError) { devError("[NAT] Falha ao recarregar após erro",reloadError); }
    if(sequence!==writeSequence.current)return;
    showSyncNotice({tone:"error",message:classified.code==="INTERNAL_ERROR"?fallback:classified.message});
  },[reloadFromCloud,showSyncNotice]);

  const update = useCallback((recipe: (current: NatState) => NatState) => {
    const previous = stateRef.current; const next = recipe(previous); const businessId = businessIdRef.current; applyState(next); if (!businessId) return;
    const sequence=++writeSequence.current;
    showSyncNotice({tone:"saving",message:"Salvando alteração..."});
    writeQueue.current = writeQueue.current.then(async () => {
      await persistNatTransition(businessId,previous,next,versionsRef.current);
      await reloadFromCloud();
      setSyncRevision((value)=>value+1);
      if(sequence===writeSequence.current)showSyncNotice({tone:"saved",message:"Tudo salvo."},true);
    }).catch((error)=>handleWriteError(error,sequence,"A alteração não pôde ser salva com segurança e foi desfeita. Confira os campos e tente novamente."));
  },[applyState,handleWriteError,reloadFromCloud,showSyncNotice]);

  const setProductAvailability = useCallback((productId:string,available:boolean) => {
    const businessId=businessIdRef.current;
    const previous=stateRef.current;
    const product=previous.products.find((candidate)=>candidate.id===productId);
    if(!businessId||!product||(product.available!==false)===available)return;
    applyState({...previous,products:previous.products.map((candidate)=>candidate.id===productId?{...candidate,available}:candidate)});
    const sequence=++writeSequence.current;
    showSyncNotice({tone:"saving",message:available?"Retomando sabor...":"Pausando sabor..."});
    writeQueue.current=writeQueue.current.then(async()=>{
      await setProductAvailabilityCloud(businessId,productId,versionsRef.current.products[productId]??null,available);
      await reloadFromCloud();
      setSyncRevision((value)=>value+1);
      if(sequence===writeSequence.current)showSyncNotice({tone:"saved",message:available?"Sabor em produção novamente.":"Sabor pausado."},true);
    }).catch((error)=>handleWriteError(error,sequence,"Não foi possível alterar a disponibilidade deste sabor. Tente novamente."));
  },[applyState,handleWriteError,reloadFromCloud,showSyncNotice]);

  const refresh = useCallback(() => {
    setReady(false);setLoadError(null);
    void reloadFromCloud().then(()=>setSyncRevision((value)=>value+1)).catch((error) => {
      devError("[NAT] Falha ao atualizar",error); setLoadError("Não foi possível atualizar os dados da NAT. Confira a conexão e tente novamente."); setReady(true);
    });
  },[reloadFromCloud]);

  return { state,update,setProductAvailability,refresh,ready,loadError,syncNotice,clearSyncNotice,syncRevision,businessId:businessIdRef.current };
}

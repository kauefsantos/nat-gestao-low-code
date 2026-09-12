import { useCallback, useEffect, useRef, useState } from "react";
import { initialState, type NatState } from "@/domain/nat";
import { useAuth } from "@/hooks/use-auth";
import { emptyNatVersions, persistNatTransition, setProductAvailabilityCloud, type NatVersions, type PersistContext } from "@/data/nat-repository";
import { initialHistoryCursor, type HistoryCursor } from "@/data/nat-operational-v2";
import { loadNatHistoryPageV3, loadNatOperationalStateV3 } from "@/data/nat-operational-v3";
import { invalidateFundingSummary } from "@/data/funding-repository";
import { classifyApiError } from "@/lib/api-error";

export type NatSyncNotice={tone:"saving"|"saved"|"error";message:string;actionLabel?:string;onAction?:()=>void}|null;
export type NatWriteSuccess={message?:string;actionLabel?:string;onAction?:()=>void};
const devError=(message:string,error?:unknown)=>{if(import.meta.env.DEV)console.error(message,error);};
type LoadedState=Awaited<ReturnType<typeof loadNatOperationalStateV3>>;

function mergeVersionMap(current:Record<string,string>,incoming:Record<string,string>|undefined){return{...current,...(incoming??{})};}
function mergeVersions(current:NatVersions,incoming:Partial<NatVersions>):NatVersions{return{settings:incoming.settings===undefined?current.settings:incoming.settings,supplies:mergeVersionMap(current.supplies,incoming.supplies),products:mergeVersionMap(current.products,incoming.products),sales:mergeVersionMap(current.sales,incoming.sales),expenses:mergeVersionMap(current.expenses,incoming.expenses)};}
function mergeById<T extends{id:string}>(current:T[],incoming:T[]){const map=new Map(current.map((item)=>[item.id,item]));for(const item of incoming)map.set(item.id,item);return[...map.values()];}

export function useNatStore(){
  const{user,isAuthenticated,isLoading:authLoading}=useAuth();
  const[state,setState]=useState<NatState>(initialState);const[ready,setReady]=useState(false);const[loadError,setLoadError]=useState<string|null>(null);const[syncNotice,setSyncNotice]=useState<NatSyncNotice>(null);
  const[inventoryRevision,setInventoryRevision]=useState(0);const[fundingRevision,setFundingRevision]=useState(0);const[historyLoaded,setHistoryLoaded]=useState(false);const[historyLoading,setHistoryLoading]=useState(false);
  const stateRef=useRef<NatState>(initialState);const businessIdRef=useRef<string|null>(null);const versionsRef=useRef<NatVersions>(emptyNatVersions());const historyCursorRef=useRef<HistoryCursor>({sale:null,expense:null,salesDone:false,expensesDone:false});const historyPromiseRef=useRef<Promise<void>|null>(null);const writeQueue=useRef<Promise<void>>(Promise.resolve());const writeSequence=useRef(0);const noticeTimer=useRef<number|null>(null);

  const applyState=useCallback((next:NatState)=>{stateRef.current=next;setState(next);},[]);
  const applyLoaded=useCallback((loaded:LoadedState)=>{businessIdRef.current=loaded.businessId;versionsRef.current=loaded.versions;applyState(loaded.state);historyCursorRef.current=initialHistoryCursor(loaded.state);setHistoryLoaded(false);setLoadError(null);},[applyState]);
  const reloadFromCloud=useCallback(async()=>{const loaded=await loadNatOperationalStateV3();applyLoaded(loaded);setReady(true);},[applyLoaded]);

  const loadMoreHistory=useCallback(async()=>{
    const businessId=businessIdRef.current;if(!businessId||historyLoaded)return;
    if(historyPromiseRef.current)return historyPromiseRef.current;
    setHistoryLoading(true);
    historyPromiseRef.current=(async()=>{const page=await loadNatHistoryPageV3(businessId,historyCursorRef.current,100);historyCursorRef.current=page.cursor;versionsRef.current={...versionsRef.current,sales:mergeVersionMap(versionsRef.current.sales,page.saleVersions),expenses:mergeVersionMap(versionsRef.current.expenses,page.expenseVersions)};const next:NatState={...stateRef.current,sales:mergeById(stateRef.current.sales,page.sales).sort((a,b)=>+new Date(b.soldAt)-+new Date(a.soldAt)),expenses:mergeById(stateRef.current.expenses,page.expenses).sort((a,b)=>b.spentAt.localeCompare(a.spentAt))};applyState(next);const done=page.cursor.salesDone&&page.cursor.expensesDone;setHistoryLoaded(done);})().finally(()=>{historyPromiseRef.current=null;setHistoryLoading(false);});
    return historyPromiseRef.current;
  },[applyState,historyLoaded]);
  const ensureFullHistory=loadMoreHistory;

  const clearSyncNotice=useCallback(()=>{if(noticeTimer.current!==null)window.clearTimeout(noticeTimer.current);noticeTimer.current=null;setSyncNotice(null);},[]);
  const showSyncNotice=useCallback((notice:Exclude<NatSyncNotice,null>,autoClear=false)=>{if(noticeTimer.current!==null)window.clearTimeout(noticeTimer.current);setSyncNotice(notice);if(autoClear)noticeTimer.current=window.setTimeout(()=>{noticeTimer.current=null;setSyncNotice(null);},2800);},[]);

  useEffect(()=>{
    let cancelled=false;
    async function hydrate(){
      if(authLoading)return;
      if(!user||!isAuthenticated){setReady(false);setLoadError(null);businessIdRef.current=null;versionsRef.current=emptyNatVersions();setHistoryLoaded(false);return;}
      try{
        setReady(false);setLoadError(null);
        const loaded=await loadNatOperationalStateV3();
        if(cancelled)return;
        applyLoaded(loaded);setReady(true);
      }catch(error){
        devError("[NAT] Falha ao carregar dados protegidos",error);
        if(!cancelled){
          const technical=error instanceof Error?error.message:String(error);
          setLoadError(import.meta.env.DEV?technical:"Não foi possível carregar os dados da NAT. Confira a conexão e tente novamente.");
          setReady(true);
        }
      }
    }
    void hydrate();
    return()=>{cancelled=true;};
  },[applyLoaded,authLoading,isAuthenticated,user]);
  useEffect(()=>()=>{if(noticeTimer.current!==null)window.clearTimeout(noticeTimer.current);},[]);

  const handleWriteError=useCallback(async(error:unknown,sequence:number,fallback:string)=>{devError("[NAT] Falha ao persistir alteração",error);const classified=classifyApiError(error);try{if(businessIdRef.current)invalidateFundingSummary(businessIdRef.current);await reloadFromCloud();setInventoryRevision((value)=>value+1);setFundingRevision((value)=>value+1);}catch(reloadError){devError("[NAT] Falha ao recarregar após erro",reloadError);}if(sequence!==writeSequence.current)return;showSyncNotice({tone:"error",message:classified.code==="INTERNAL_ERROR"?fallback:classified.message});},[reloadFromCloud,showSyncNotice]);

  const update=useCallback((recipe:(current:NatState)=>NatState,success?:NatWriteSuccess,context:PersistContext={})=>{const previous=stateRef.current;const next=recipe(previous);const businessId=businessIdRef.current;applyState(next);if(!businessId)return;const sequence=++writeSequence.current;showSyncNotice({tone:"saving",message:"Salvando alteração..."});writeQueue.current=writeQueue.current.then(async()=>{const result=await persistNatTransition(businessId,previous,next,versionsRef.current,context);versionsRef.current=mergeVersions(versionsRef.current,result.versions);if(result.inventoryChanged)setInventoryRevision((value)=>value+1);if(result.fundingChanged){invalidateFundingSummary(businessId);setFundingRevision((value)=>value+1);}if(sequence===writeSequence.current)showSyncNotice({tone:"saved",message:success?.message??"Tudo salvo.",actionLabel:success?.actionLabel,onAction:success?.onAction},!success?.actionLabel);}).catch((error)=>handleWriteError(error,sequence,"A alteração não pôde ser salva com segurança e foi desfeita. Confira os campos e tente novamente."));},[applyState,handleWriteError,showSyncNotice]);

  const setProductAvailability=useCallback((productId:string,available:boolean)=>{const businessId=businessIdRef.current;const previous=stateRef.current;const product=previous.products.find((candidate)=>candidate.id===productId);if(!businessId||!product||(product.available!==false)===available)return;applyState({...previous,products:previous.products.map((candidate)=>candidate.id===productId?{...candidate,available}:candidate)});const sequence=++writeSequence.current;showSyncNotice({tone:"saving",message:available?"Retomando produto...":"Pausando produto..."});writeQueue.current=writeQueue.current.then(async()=>{const version=await setProductAvailabilityCloud(businessId,productId,versionsRef.current.products[productId]??null,available);if(version)versionsRef.current={...versionsRef.current,products:{...versionsRef.current.products,[productId]:version}};if(sequence===writeSequence.current)showSyncNotice({tone:"saved",message:available?"Produto disponível novamente.":"Produto pausado."},true);}).catch((error)=>handleWriteError(error,sequence,"Não foi possível alterar a disponibilidade deste produto. Tente novamente."));},[applyState,handleWriteError,showSyncNotice]);

  const refresh=useCallback(()=>{setReady(false);setLoadError(null);if(businessIdRef.current)invalidateFundingSummary(businessIdRef.current);void reloadFromCloud().then(()=>{setInventoryRevision((value)=>value+1);setFundingRevision((value)=>value+1);}).catch((error)=>{devError("[NAT] Falha ao atualizar",error);setLoadError("Não foi possível atualizar os dados da NAT. Confira a conexão e tente novamente.");setReady(true);});},[reloadFromCloud]);
  return{state,update,setProductAvailability,refresh,ensureFullHistory,loadMoreHistory,historyLoaded,historyLoading,ready,loadError,syncNotice,clearSyncNotice,syncRevision:inventoryRevision,inventoryRevision,fundingRevision,businessId:businessIdRef.current};
}

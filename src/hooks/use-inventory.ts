import { useCallback, useEffect, useRef, useState } from "react";
import { emptyInventorySnapshot, type InventoryItemKind, type InventorySnapshot } from "@/domain/inventory";
import { loadInventorySnapshot, recordInventoryProduction, setInventoryBalance } from "@/data/inventory-repository";

export type InventoryNotice = { tone:"saving"|"saved"|"error"; message:string } | null;

export function useInventory(businessId:string|null,syncRevision=0) {
  const [snapshot,setSnapshot]=useState<InventorySnapshot>(emptyInventorySnapshot());
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<InventoryNotice>(null);
  const requestRef=useRef(0);
  const noticeTimer=useRef<number|null>(null);

  const clearNotice=useCallback(()=>{
    if(noticeTimer.current!==null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current=null;
    setNotice(null);
  },[]);

  const showNotice=useCallback((next:Exclude<InventoryNotice,null>,autoClear=false)=>{
    if(noticeTimer.current!==null) window.clearTimeout(noticeTimer.current);
    setNotice(next);
    if(autoClear) noticeTimer.current=window.setTimeout(()=>{noticeTimer.current=null;setNotice(null);},2400);
  },[]);

  const reload=useCallback(async()=>{
    if(!businessId){setSnapshot(emptyInventorySnapshot());return;}
    const request=++requestRef.current;
    try {
      setLoading(true);setError(null);
      const next=await loadInventorySnapshot(businessId);
      if(request===requestRef.current)setSnapshot(next);
    } catch(cause) {
      const message=cause instanceof Error?cause.message:"Não foi possível carregar o estoque.";
      if(request===requestRef.current)setError(message);
    } finally {
      if(request===requestRef.current)setLoading(false);
    }
  },[businessId]);

  useEffect(()=>{void reload();},[reload,syncRevision]);
  useEffect(()=>()=>{if(noticeTimer.current!==null)window.clearTimeout(noticeTimer.current);},[]);

  const setBalance=useCallback(async(args:{kind:InventoryItemKind;itemId:string;quantity:number;minimumQuantity:number;note?:string})=>{
    if(!businessId)throw new Error("Empresa não carregada.");
    showNotice({tone:"saving",message:"Salvando estoque..."});
    try {
      await setInventoryBalance({businessId,...args});
      await reload();
      showNotice({tone:"saved",message:"Estoque atualizado."},true);
    } catch(cause) {
      const message=cause instanceof Error?cause.message:"Não foi possível atualizar o estoque.";
      showNotice({tone:"error",message});
      throw cause;
    }
  },[businessId,reload,showNotice]);

  const registerProduction=useCallback(async(args:{productId:string;batches:number;producedAt:string;note?:string})=>{
    if(!businessId)throw new Error("Empresa não carregada.");
    showNotice({tone:"saving",message:"Registrando produção..."});
    try {
      await recordInventoryProduction({businessId,...args});
      await reload();
      showNotice({tone:"saved",message:"Produção registrada e estoque atualizado."},true);
    } catch(cause) {
      const message=cause instanceof Error?cause.message:"Não foi possível registrar a produção.";
      showNotice({tone:"error",message});
      throw cause;
    }
  },[businessId,reload,showNotice]);

  return { snapshot,loading,error,reload,setBalance,registerProduction,notice,clearNotice };
}

import { useCallback, useEffect, useRef, useState } from "react";
import { emptyFundingSummary, type FundingSummary } from "@/domain/funding";
import { loadFundingSummary } from "@/data/funding-repository";

export function useFundingSummary(businessId:string|null,revision=0){
  const[summary,setSummary]=useState<FundingSummary>(emptyFundingSummary());
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState<string|null>(null);
  const requestRef=useRef(0);
  const reload=useCallback(async()=>{
    if(!businessId){setSummary(emptyFundingSummary());return;}
    const request=++requestRef.current;
    try{setLoading(true);setError(null);const next=await loadFundingSummary(businessId);if(request===requestRef.current)setSummary(next);}
    catch(cause){if(request===requestRef.current)setError(cause instanceof Error?cause.message:"Não foi possível carregar a origem do dinheiro.");}
    finally{if(request===requestRef.current)setLoading(false);}
  },[businessId]);
  useEffect(()=>{void reload();},[reload,revision]);
  return{summary,loading,error,reload};
}

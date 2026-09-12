import { Activity, RefreshCw } from "lucide-react";
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resilientRequest } from "@/lib/resilient-request";

type JobHealth={name:string;lastStartedAt:string|null;lastSucceededAt:string|null;lastFailedAt:string|null;status:string;stale:boolean};
type Health={generatedAt:string;push:{sent24h:number;retrying:number;deadLetter:number;expired24h:number;oldestRetryAt:string|null};jobs:JobHealth[];ai:{enabled:boolean;calls24h:number;failed24h:number;circuitOpenUntil:string|null}};

export function IntegrationHealthPanel({businessId}:{businessId:string|null}){
  const [health,setHealth]=useState<Health|null>(null);const[loading,setLoading]=useState(false);const[error,setError]=useState<string|null>(null);
  const load=useCallback(async()=>{
    if(!businessId)return;setLoading(true);setError(null);
    try{
      const result=await resilientRequest(async()=>{const response=await supabase.rpc("get_integration_health" as never,{p_business_id:businessId} as never);if(response.error)throw response.error;return response;},{attempts:2,timeoutMs:8000});
      setHealth(result.data as unknown as Health);
    }catch(cause){setError(cause instanceof Error?cause.message:"Não foi possível consultar a saúde das integrações.");}
    finally{setLoading(false);}
  },[businessId]);
  if(!businessId)return null;
  const stale=health?.jobs.filter((job)=>job.stale)??[];
  return <section className="nat-card" aria-labelledby="integration-health-title">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="flex items-start gap-3"><Activity className="mt-1 shrink-0" size={20}/><div><p className="eyebrow">Diagnóstico técnico</p><h2 id="integration-health-title" className="section-title">Saúde das integrações</h2><p className="mt-1 text-sm text-caramel">Resumo operacional de lembretes, tarefas automáticas e IA, sem exibir receitas, clientes ou valores do negócio.</p></div></div><button type="button" className="secondary-button shrink-0 justify-center" disabled={loading} onClick={()=>void load()}><RefreshCw size={16} className={loading?"animate-spin":""}/>{health?"Atualizar":"Verificar"}</button></div>
    {error&&<p role="alert" className="mt-4 rounded-2xl bg-rose-soft p-3 text-sm">Não foi possível abrir o diagnóstico agora.</p>}
    {health&&<div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl bg-soft p-4"><p className="text-xs font-bold uppercase tracking-wider text-caramel">Push 24h</p><p className="mt-2 font-display text-3xl">{health.push.sent24h}</p><p className="text-xs text-caramel">enviados</p></div>
      <div className="rounded-2xl bg-soft p-4"><p className="text-xs font-bold uppercase tracking-wider text-caramel">Retries</p><p className="mt-2 font-display text-3xl">{health.push.retrying}</p><p className="text-xs text-caramel">aguardando nova tentativa</p></div>
      <div className={`rounded-2xl p-4 ${health.push.deadLetter?"bg-rose-soft":"bg-soft"}`}><p className="text-xs font-bold uppercase tracking-wider text-caramel">Falhas finais</p><p className="mt-2 font-display text-3xl">{health.push.deadLetter}</p><p className="text-xs text-caramel">dead-letter</p></div>
      <div className={`rounded-2xl p-4 ${stale.length?"bg-rose-soft":"bg-soft"}`}><p className="text-xs font-bold uppercase tracking-wider text-caramel">Jobs atrasados</p><p className="mt-2 font-display text-3xl">{stale.length}</p><p className="text-xs text-caramel">{stale.length?stale.map((job)=>job.name).join(", "):"automação em dia"}</p></div>
      <div className="rounded-2xl bg-soft p-4 sm:col-span-2 xl:col-span-4"><p className="text-xs font-bold uppercase tracking-wider text-caramel">IA</p><p className="mt-1 text-sm">{health.ai.enabled?"Ativa":"Desativada no aplicativo"} · {health.ai.calls24h} chamada(s) ao provedor nas últimas 24h · {health.ai.failed24h} falha(s).</p>{health.ai.circuitOpenUntil&&<p className="mt-1 text-xs text-caramel">Circuit breaker aberto até {new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date(health.ai.circuitOpenUntil))}.</p>}</div>
    </div>}
  </section>;
}

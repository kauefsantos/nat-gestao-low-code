import { Activity, RefreshCw } from "lucide-react";
import { useCallback, useState } from "react";
import { loadIntegrationHealth, type IntegrationHealth } from "@/data/integration-health-repository";

export function IntegrationHealthPanel({businessId}:{businessId:string|null}){
  const [health,setHealth]=useState<IntegrationHealth|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);

  const load=useCallback(async()=>{
    if(!businessId)return;
    setLoading(true);
    setError(null);
    try{
      setHealth(await loadIntegrationHealth(businessId));
    }catch(cause){
      setError(cause instanceof Error?cause.message:"Não foi possível consultar a saúde das integrações.");
    }finally{
      setLoading(false);
    }
  },[businessId]);

  if(!businessId)return null;

  return <section className="nat-card" aria-labelledby="integration-health-title">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3"><Activity className="mt-1 shrink-0" size={20}/><div>
        <p className="eyebrow">Diagnóstico técnico</p>
        <h2 id="integration-health-title" className="section-title">Saúde das integrações</h2>
        <p className="mt-1 text-sm text-caramel">Resumo dos registros técnicos disponíveis no Lovable Cloud, sem exibir receitas, clientes ou valores do negócio.</p>
      </div></div>
      <button type="button" className="secondary-button shrink-0 justify-center" disabled={loading} onClick={()=>void load()}>
        <RefreshCw size={16} className={loading?"animate-spin":""}/>{health?"Atualizar":"Verificar"}
      </button>
    </div>

    {error&&<p role="alert" className="mt-4 rounded-2xl bg-rose-soft p-3 text-sm">Não foi possível abrir o diagnóstico agora.</p>}

    {health&&<div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl bg-soft p-4"><p className="text-xs font-bold uppercase tracking-wider text-caramel">Push 24h</p><p className="mt-2 text-3xl font-bold">{health.push.sent24h}</p><p className="text-sm text-caramel">enviados</p></div>
      <div className="rounded-2xl bg-soft p-4"><p className="text-xs font-bold uppercase tracking-wider text-caramel">Novas tentativas</p><p className="mt-2 text-3xl font-bold">{health.push.retrying}</p><p className="text-sm text-caramel">aguardando retry</p></div>
      <div className={`rounded-2xl p-4 ${health.push.deadLetter?"bg-rose-soft":"bg-soft"}`}><p className="text-xs font-bold uppercase tracking-wider text-caramel">Falhas finais</p><p className="mt-2 text-3xl font-bold">{health.push.deadLetter}</p><p className="text-sm text-caramel">dead-letter</p></div>
      <div className="rounded-2xl bg-soft p-4"><p className="text-xs font-bold uppercase tracking-wider text-caramel">Jobs automáticos</p><p className="mt-2 text-3xl font-bold">—</p><p className="text-sm text-caramel">sem telemetria durável disponível</p></div>
      <div className="rounded-2xl bg-soft p-4 sm:col-span-2 xl:col-span-4">
        <p className="text-xs font-bold uppercase tracking-wider text-caramel">IA</p>
        <p className="mt-1 text-sm">{health.ai.enabled?"Ativa":"Desativada no aplicativo"} · {health.ai.calls24h} chamada(s) registradas nas últimas 24h · {health.ai.failed24h} falha(s).</p>
      </div>
    </div>}
  </section>;
}

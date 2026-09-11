import { Ban, Plus, ShoppingBag, X } from "lucide-react";
import { useState } from "react";
import { dashboardNumbers, money, paymentLabel, type NatState, type Sale } from "@/domain/nat";
import { useDialogA11y } from "@/hooks/use-dialog-a11y";
import { Empty, Metric } from "./Views";

function saleLabel(sale:Sale) {
  return sale.items.length>1?`Pedido com ${sale.items.length} produtos`:sale.items[0]?.productName??sale.productName;
}

function CancelSaleDialog({ sale,onClose,onConfirm }: { sale:Sale; onClose:()=>void; onConfirm:(reason:string)=>void }) {
  const [reason,setReason]=useState("Cliente desistiu");
  const panelRef=useDialogA11y<HTMLDivElement>({onClose});
  const submit=(event:React.FormEvent)=>{event.preventDefault();onConfirm(reason.trim()||"Cancelada pelo usuário");};
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#35150A]/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}>
    <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="cancel-sale-title" className="w-full rounded-t-[28px] bg-[#FFF9F6] p-5 pb-[max(24px,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:rounded-[28px] sm:p-6">
      <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Histórico</p><h2 id="cancel-sale-title" className="mt-1 font-display text-3xl">Cancelar venda</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X size={19}/></button></div>
      <p className="mt-3 text-sm leading-6 text-caramel">{saleLabel(sale)} · {money(sale.totalReceived)}. A venda continuará no histórico, mas sairá dos indicadores.</p>
      <form className="mt-5 space-y-4" onSubmit={submit}>
        <div><label htmlFor="cancel-sale-reason" className="field-label">Motivo do cancelamento</label><textarea id="cancel-sale-reason" className="nat-input min-h-24 resize-y" value={reason} onChange={(event)=>setReason(event.target.value)} maxLength={500}/><p className="field-help">Ex.: cliente desistiu, pedido duplicado ou erro no lançamento.</p></div>
        <div className="grid grid-cols-2 gap-2"><button type="button" className="secondary-button justify-center" onClick={onClose}>Voltar</button><button type="submit" className="primary-button justify-center"><Ban size={17}/> Confirmar</button></div>
      </form>
    </div>
  </div>;
}

export function SalesHistoryView({ state,onNew,onCancel }: { state:NatState; onNew:()=>void; onCancel:(id:string,reason:string)=>void }) {
  const numbers=dashboardNumbers(state);
  const [saleToCancel,setSaleToCancel]=useState<Sale|null>(null);
  const confirmCancel=(reason:string)=>{if(!saleToCancel)return;onCancel(saleToCancel.id,reason);setSaleToCancel(null);};
  return <>
    <section>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Movimento</p><h1 className="mt-2 font-display text-4xl sm:text-5xl">Vendas</h1><p className="mt-2 max-w-2xl text-caramel">Cada pedido pode reunir vários produtos. Cancelamentos permanecem no histórico, mas não entram nos indicadores.</p></div><button type="button" className="primary-button" onClick={onNew}><Plus size={18}/> Nova venda</button></div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3"><Metric label="Faturamento do mês" value={money(numbers.revenue)} hint="somente pedidos concluídos"/><Metric label="Unidades" value={String(numbers.units)} hint="produtos vendidos"/><Metric label="Sobrou das vendas" value={money(numbers.contribution)} hint="antes dos demais gastos"/></div>
      <div className="nat-card mt-5"><h2 className="section-title">Histórico</h2><div className="mt-4 space-y-3">{state.sales.map((sale)=>{
        const cancelled=sale.status==="cancelled";
        return <article key={sale.id} className={`rounded-2xl border p-4 ${cancelled?"border-dashed border-nat bg-soft/60":"border-nat"}`}>
          <div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rose-soft"><ShoppingBag size={18}/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-bold">{saleLabel(sale)}</p>{cancelled&&<span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-caramel">Cancelada</span>}</div><p className="text-xs text-caramel">{new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(sale.soldAt))} • {sale.quantity} un • {paymentLabel[sale.paymentMethod]}</p></div><div className="text-right"><p className={`font-bold ${cancelled?"line-through text-caramel":""}`}>{money(sale.totalReceived)}</p>{!cancelled&&<p className="text-xs text-caramel">+ {money(sale.contributionSnapshot)}</p>}</div>{!cancelled&&<button type="button" className="icon-button" onClick={()=>setSaleToCancel(sale)} aria-label={`Cancelar ${saleLabel(sale)}`}><Ban size={17}/></button>}</div>
          {sale.items.length>1&&<div className="mt-3 space-y-1 border-t border-nat pt-3">{sale.items.map((item)=><div key={item.id??item.productId} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate text-caramel">{item.quantity} × {item.productName}</span><span className="shrink-0 font-bold">{money(item.unitPriceSnapshot*item.quantity)}</span></div>)}</div>}
          {cancelled&&sale.cancelReason&&<p className="mt-3 border-t border-nat pt-3 text-xs text-caramel">Motivo: {sale.cancelReason}</p>}
        </article>;
      })}{state.sales.length===0&&<Empty text="Nenhuma venda registrada ainda."/>}</div></div>
    </section>
    {saleToCancel&&<CancelSaleDialog sale={saleToCancel} onClose={()=>setSaleToCancel(null)} onConfirm={confirmCancel}/>} 
  </>;
}

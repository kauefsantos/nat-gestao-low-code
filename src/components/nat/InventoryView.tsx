import { AlertTriangle, Package, Plus, RefreshCw, X } from "lucide-react";
import { useMemo, useState } from "react";
import { inventoryCategoryLabel, inventoryMovementLabel, inventoryQuantity, type InventoryCategory, type InventoryItem, type InventoryItemKind, type InventorySnapshot } from "@/domain/inventory";
import type { NatState } from "@/domain/nat";
import { useDialogA11y } from "@/hooks/use-dialog-a11y";
import { Empty, Metric } from "./Views";

type Filter = "all" | InventoryCategory;

type Props = {
  state:NatState;
  snapshot:InventorySnapshot;
  loading:boolean;
  error:string|null;
  onRetry:()=>void;
  onSetBalance:(args:{kind:InventoryItemKind;itemId:string;quantity:number;minimumQuantity:number;note?:string})=>Promise<void>;
  onProduction:(args:{productId:string;batches:number;producedAt:string;note?:string})=>Promise<void>;
};

const filters:{value:Filter;label:string}[]=[
  {value:"all",label:"Tudo"},{value:"product",label:"Produtos prontos"},{value:"ingredient",label:"Ingredientes"},{value:"packaging",label:"Embalagens"},{value:"other",label:"Outros"},
];

function BalanceDialog({item,onClose,onSave}:{item:InventoryItem;onClose:()=>void;onSave:Props["onSetBalance"]}) {
  const [quantity,setQuantity]=useState(item.tracked?String(item.currentQuantity):"");
  const [minimum,setMinimum]=useState(item.tracked?String(item.minimumQuantity):"0");
  const [note,setNote]=useState(item.tracked?"Contagem física":"Saldo inicial");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const panelRef=useDialogA11y<HTMLDivElement>({onClose});
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();setError("");
    const q=Number(quantity.replace(",","."));const min=Number(minimum.replace(",","."));
    if(!Number.isFinite(q)||q<0){setError("Informe o saldo contado, zero ou maior.");return;}
    if(!Number.isFinite(min)||min<0){setError("O estoque mínimo precisa ser zero ou maior.");return;}
    try{setBusy(true);await onSave({kind:item.kind,itemId:item.itemId,quantity:q,minimumQuantity:min,note});onClose();}
    catch(cause){setError(cause instanceof Error?cause.message:"Não foi possível salvar o estoque.");}
    finally{setBusy(false);}
  };
  return <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#35150A]/35 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(event)=>{if(event.target===event.currentTarget&&!busy)onClose();}}>
    <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="inventory-balance-title" className="w-full rounded-t-[28px] bg-[#FFF9F6] p-5 pb-[max(24px,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:rounded-[28px] sm:p-6">
      <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Estoque</p><h2 id="inventory-balance-title" className="mt-1 font-display text-3xl">{item.tracked?"Ajustar contagem":"Definir saldo inicial"}</h2><p className="mt-2 text-sm text-caramel">{item.name} · unidade de controle: {item.baseUnit==="unit"?"un":item.baseUnit}</p></div><button type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label="Fechar"><X size={19}/></button></div>
      <form className="mt-5 space-y-4" onSubmit={submit}>
        <div><label htmlFor="inventory-count" className="field-label">Quanto existe agora?</label><input id="inventory-count" className="nat-input" inputMode="decimal" value={quantity} onChange={(e)=>setQuantity(e.target.value)} placeholder="0" autoFocus required/><p className="field-help">Digite a quantidade que você contou fisicamente. A NAT registra a diferença como movimento, sem apagar o histórico.</p></div>
        <div><label htmlFor="inventory-minimum" className="field-label">Avisar como estoque baixo a partir de</label><input id="inventory-minimum" className="nat-input" inputMode="decimal" value={minimum} onChange={(e)=>setMinimum(e.target.value)} placeholder="0" required/></div>
        <div><label htmlFor="inventory-note" className="field-label">Observação</label><input id="inventory-note" className="nat-input" value={note} onChange={(e)=>setNote(e.target.value)} maxLength={500} placeholder="Ex.: contagem da noite"/></div>
        {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button type="submit" className="primary-button w-full justify-center" disabled={busy}>{busy?"Salvando...":item.tracked?"Salvar contagem":"Começar a controlar"}</button>
      </form>
    </div>
  </div>;
}

function ProductionDialog({state,items,onClose,onSave}:{state:NatState;items:InventoryItem[];onClose:()=>void;onSave:Props["onProduction"]}) {
  const trackedIds=new Set(items.filter((item)=>item.kind==="product"&&item.tracked).map((item)=>item.itemId));
  const products=state.products.filter((product)=>trackedIds.has(product.id)&&product.recipe.length>0);
  const [productId,setProductId]=useState(products[0]?.id??"");
  const [batches,setBatches]=useState("1");
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [note,setNote]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const panelRef=useDialogA11y<HTMLDivElement>({onClose});
  const product=products.find((item)=>item.id===productId);
  const batchValue=Number(batches.replace(",","."))||0;
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();setError("");
    if(!product){setError("Escolha um produto com estoque e receita configurados.");return;}
    if(!Number.isFinite(batchValue)||batchValue<=0){setError("A quantidade de lotes precisa ser maior que zero.");return;}
    if(!date){setError("Informe a data da produção.");return;}
    try{setBusy(true);await onSave({productId:product.id,batches:batchValue,producedAt:new Date(`${date}T12:00:00`).toISOString(),note});onClose();}
    catch(cause){setError(cause instanceof Error?cause.message:"Não foi possível registrar a produção.");}
    finally{setBusy(false);}
  };
  return <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#35150A]/35 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(event)=>{if(event.target===event.currentTarget&&!busy)onClose();}}>
    <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="inventory-production-title" className="w-full rounded-t-[28px] bg-[#FFF9F6] p-5 pb-[max(24px,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:rounded-[28px] sm:p-6">
      <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Produção</p><h2 id="inventory-production-title" className="mt-1 font-display text-3xl">Registrar produção</h2><p className="mt-2 text-sm leading-6 text-caramel">A NAT soma os produtos prontos e desconta automaticamente os ingredientes, embalagens e outros insumos que já estiverem sendo controlados.</p></div><button type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label="Fechar"><X size={19}/></button></div>
      {products.length===0?<div className="mt-5"><Empty text="Primeiro defina o saldo inicial de pelo menos um produto com receita configurada."/></div>:<form className="mt-5 space-y-4" onSubmit={submit}>
        <div><label htmlFor="production-product" className="field-label">Produto</label><select id="production-product" className="nat-input" value={productId} onChange={(e)=>setProductId(e.target.value)}>{products.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-3"><div><label htmlFor="production-batches" className="field-label">Quantos lotes?</label><input id="production-batches" className="nat-input" inputMode="decimal" value={batches} onChange={(e)=>setBatches(e.target.value)} required/></div><div><label htmlFor="production-date" className="field-label">Data</label><input id="production-date" type="date" className="nat-input" value={date} onChange={(e)=>setDate(e.target.value)} required/></div></div>
        {product&&batchValue>0&&<div className="rounded-2xl bg-rose-soft p-4" aria-live="polite"><p className="text-xs font-bold uppercase tracking-wider text-caramel">Vai entrar no estoque</p><p className="mt-1 font-display text-3xl">{inventoryQuantity(product.batchYield*batchValue,"unit")}</p><p className="mt-1 text-xs text-caramel">Baseado no rendimento cadastrado de {product.batchYield} unidades por lote.</p></div>}
        <div><label htmlFor="production-note" className="field-label">Observação</label><input id="production-note" className="nat-input" value={note} onChange={(e)=>setNote(e.target.value)} maxLength={500} placeholder="Ex.: produção para encomendas"/></div>
        {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button type="submit" className="primary-button w-full justify-center" disabled={busy}>{busy?"Registrando...":"Confirmar produção"}</button>
      </form>}
    </div>
  </div>;
}

export function InventoryView({state,snapshot,loading,error,onRetry,onSetBalance,onProduction}:Props) {
  const [filter,setFilter]=useState<Filter>("all");
  const [editing,setEditing]=useState<InventoryItem|null>(null);
  const [productionOpen,setProductionOpen]=useState(false);
  const tracked=snapshot.items.filter((item)=>item.tracked);
  const low=tracked.filter((item)=>item.lowStock);
  const filtered=useMemo(()=>snapshot.items.filter((item)=>filter==="all"||item.category===filter),[snapshot.items,filter]);

  return <>
    <section className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Controle do que existe de verdade</p><h1 className="mt-2 font-display text-4xl sm:text-5xl">Estoque</h1><p className="mt-2 max-w-2xl text-caramel">Acompanhe produtos prontos, ingredientes, embalagens e outros insumos. Você escolhe quando começar a controlar cada item, informando o saldo que existe naquele momento.</p></div><button type="button" className="primary-button" onClick={()=>setProductionOpen(true)} disabled={!tracked.some((item)=>item.kind==="product")}><Plus size={18}/> Registrar produção</button></div>

      <div className="grid gap-3 sm:grid-cols-3"><Metric label="Itens controlados" value={String(tracked.length)} hint={`${snapshot.items.length-tracked.length} ainda sem saldo inicial`}/><Metric label="Estoque baixo" value={String(low.length)} hint={low.length?"itens no mínimo ou abaixo":"nenhum alerta agora"} tone={low.length?"attention":"default"}/><Metric label="Movimentos recentes" value={String(snapshot.movements.length)} hint="compras, produção, vendas e ajustes"/></div>

      {error&&<div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><div className="flex items-start gap-3"><AlertTriangle size={19} className="mt-0.5 shrink-0"/><div className="flex-1"><p className="font-bold">Não foi possível carregar o estoque.</p><p className="mt-1">{error}</p><button type="button" className="secondary-button mt-3" onClick={onRetry}><RefreshCw size={16}/> Tentar novamente</button></div></div></div>}

      <div className="nat-card"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="section-title">Saldos atuais</h2><p className="mt-1 text-sm text-caramel">“Não controlado” não bloqueia vendas nem produção; o controle começa somente após você informar o saldo inicial.</p></div>{loading&&<span role="status" className="text-sm font-bold text-caramel">Atualizando...</span>}</div>
        <div className="mt-4 flex max-w-full gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filtrar estoque">{filters.map((item)=><button key={item.value} type="button" role="tab" aria-selected={filter===item.value} className={`tab-button whitespace-nowrap ${filter===item.value?"active":""}`} onClick={()=>setFilter(item.value)}>{item.label}</button>)}</div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">{filtered.map((item)=><article key={`${item.kind}-${item.itemId}`} className={`rounded-2xl border p-4 ${item.lowStock?"border-rose bg-rose-soft/40":"border-nat"}`}><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-soft"><Package size={18}/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-bold">{item.name}</p>{item.lowStock&&<span className="rounded-full bg-rose px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-chocolate">Estoque baixo</span>}</div><p className="text-xs text-caramel">{inventoryCategoryLabel[item.category]}</p></div></div>
          <div className="mt-4 rounded-2xl bg-soft p-4"><p className="text-xs font-bold uppercase tracking-wider text-caramel">Saldo atual</p><p className="mt-1 font-display text-3xl">{item.tracked?inventoryQuantity(item.currentQuantity,item.baseUnit):"Não controlado"}</p>{item.tracked&&<p className="mt-1 text-xs text-caramel">Mínimo: {inventoryQuantity(item.minimumQuantity,item.baseUnit)}</p>}</div>
          <button type="button" className="secondary-button mt-3 w-full justify-center" onClick={()=>setEditing(item)}>{item.tracked?"Ajustar contagem":"Definir saldo inicial"}</button>
        </article>)}{!filtered.length&&!loading&&<div className="md:col-span-2"><Empty text="Nenhum item nesta categoria."/></div>}</div>
      </div>

      <div className="nat-card"><div><p className="eyebrow">Rastreabilidade</p><h2 className="section-title">Últimos movimentos</h2><p className="mt-1 text-sm text-caramel">O saldo é a soma destes movimentos. Nada é apagado quando você faz uma nova contagem.</p></div><div className="mt-4 space-y-2">{snapshot.movements.slice(0,30).map((movement)=><div key={movement.id} className="flex items-start gap-3 rounded-2xl border border-nat p-3"><div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${movement.quantityDelta<0?"bg-soft":"bg-rose-soft"}`}><span className="font-bold">{movement.quantityDelta<0?"−":"+"}</span></div><div className="min-w-0 flex-1"><p className="font-bold">{movement.itemName}</p><p className="text-xs text-caramel">{inventoryMovementLabel[movement.movementType]} · {new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(movement.occurredAt))}</p>{movement.note&&<p className="mt-1 truncate text-xs text-caramel">{movement.note}</p>}</div><strong className={movement.quantityDelta<0?"text-caramel":""}>{movement.quantityDelta>0?"+":""}{inventoryQuantity(movement.quantityDelta,movement.baseUnit)}</strong></div>)}{!snapshot.movements.length&&!loading&&<Empty text="Os movimentos aparecerão aqui depois que você começar a controlar algum item."/>}</div></div>
    </section>
    {editing&&<BalanceDialog item={editing} onClose={()=>setEditing(null)} onSave={onSetBalance}/>} 
    {productionOpen&&<ProductionDialog state={state} items={snapshot.items} onClose={()=>setProductionOpen(false)} onSave={onProduction}/>} 
  </>;
}

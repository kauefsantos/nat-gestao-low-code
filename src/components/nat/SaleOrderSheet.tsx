import { CircleDollarSign, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { buildSaleOrder, money, paymentLabel, transactionTypeLabel, type NatState, type PaymentMethod, type Sale, type TransactionType } from "@/domain/nat";
import { useDialogA11y } from "@/hooks/use-dialog-a11y";

type DraftLine = { key: string; productId: string; quantity: string };

export function SaleOrderSheet({ state,onClose,onSave }: { state:NatState; onClose:()=>void; onSave:(sale:Sale)=>void }) {
  const sellable = state.products.filter((product)=>product.available!==false&&product.recipe.length>0);
  const initialProduct = sellable[0];
  const panelRef=useDialogA11y<HTMLDivElement>({onClose});
  const [lines,setLines] = useState<DraftLine[]>(initialProduct?[{key:crypto.randomUUID(),productId:initialProduct.id,quantity:"1"}]:[]);
  const [total,setTotal] = useState(initialProduct?String(initialProduct.sellingPrice):"");
  const [method,setMethod] = useState<PaymentMethod>("pix");
  const [date,setDate] = useState(new Date().toISOString().slice(0,10));
  const [customerId,setCustomerId]=useState("");
  const [transactionType,setTransactionType]=useState<TransactionType>("sale");
  const [error,setError] = useState("");
  const customers=(state.customers??[]).filter((customer)=>customer.active);

  const listTotal = useMemo(()=>lines.reduce((sum,line)=>{
    const product=sellable.find((candidate)=>candidate.id===line.productId);
    const quantity=Number(line.quantity.replace(",","."))||0;
    return sum+(product?.sellingPrice??0)*quantity;
  },0),[lines,sellable]);
  const received=transactionType==="sale"?(Number(total.replace(",","."))||0):0;
  const adjustment=received-listTotal;
  const hasAdjustment=transactionType==="sale"&&Math.abs(adjustment)>=0.005;
  let preview:Sale|null=null;
  try {
    const items=lines.map((line)=>({product:sellable.find((candidate)=>candidate.id===line.productId)!,quantity:Number(line.quantity.replace(",","."))||0}));
    if(items.length&&items.every((item)=>item.product&&item.quantity>0)) preview=buildSaleOrder({items,supplies:state.supplies,paymentFeePercent:state.settings.paymentFeePercent,totalReceived:received,paymentMethod:method,soldAt:`${date}T12:00:00.000Z`,customerId:customerId||null,transactionType});
  } catch { preview=null; }

  function suggestedTotal(next:DraftLine[]) { return next.reduce((sum,line)=>{const product=sellable.find((candidate)=>candidate.id===line.productId);const quantity=Number(line.quantity.replace(",","."))||0;return sum+(product?.sellingPrice??0)*quantity;},0); }
  function updateLines(next:DraftLine[]) { setError(""); setLines(next); if(transactionType==="sale")setTotal(String(suggestedTotal(next))); }
  function addLine() { const used=new Set(lines.map((line)=>line.productId));const nextProduct=sellable.find((product)=>!used.has(product.id));if(nextProduct)updateLines([...lines,{key:crypto.randomUUID(),productId:nextProduct.id,quantity:"1"}]); }
  function submit(event:React.FormEvent) {
    event.preventDefault(); setError("");
    if(!lines.length){setError("Adicione pelo menos um produto.");return;}
    const ids=lines.map((line)=>line.productId); if(new Set(ids).size!==ids.length){setError("O mesmo produto não pode aparecer duas vezes.");return;}
    const items=lines.map((line)=>({product:sellable.find((candidate)=>candidate.id===line.productId),quantity:Number(line.quantity.replace(",","."))||0}));
    if(items.some((item)=>!item.product||item.quantity<=0)){setError("Revise os produtos e quantidades.");return;}
    if(received<0||!date){setError("Revise valor e data.");return;}
    try { onSave(buildSaleOrder({items:items.map((item)=>({product:item.product!,quantity:item.quantity})),supplies:state.supplies,paymentFeePercent:state.settings.paymentFeePercent,totalReceived:received,paymentMethod:method,soldAt:`${date}T12:00:00.000Z`,customerId:customerId||null,transactionType})); }
    catch { setError("Revise os produtos, a disponibilidade e as receitas antes de salvar."); }
  }

  return <div className="fixed inset-0 z-50 flex justify-end bg-[#35150A]/35 backdrop-blur-[2px]" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}><div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="sale-order-title" className="h-full w-full max-w-xl overflow-y-auto bg-[#FFF9F6] p-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(20px,env(safe-area-inset-top))] shadow-2xl sm:p-7">
    <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">NAT Gestão</p><h2 id="sale-order-title" className="mt-2 font-display text-4xl">Registrar movimento</h2><p className="mt-2 text-sm leading-6 text-caramel">Venda, cortesia, consumo próprio ou perda. Só vendas entram no faturamento e na recompra de clientes.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20}/></button></div>
    <div className="mt-7">{sellable.length===0?<div className="rounded-2xl border border-dashed border-nat p-8 text-center text-sm text-caramel">Nenhum sabor disponível com receita completa.</div>:<form className="space-y-5" onSubmit={submit}>
      <div><label className="field-label" htmlFor="movement-type">Tipo</label><select id="movement-type" className="nat-input" value={transactionType} onChange={(e)=>{const next=e.target.value as TransactionType;setTransactionType(next);if(next!=="sale")setTotal("0");else setTotal(String(suggestedTotal(lines)));}}>{(["sale","courtesy","personal_consumption","loss"] as TransactionType[]).map((type)=><option key={type} value={type}>{transactionTypeLabel[type]}</option>)}</select>{transactionType!=="sale"&&<p className="field-help">Essa movimentação mantém custo e quantidade, mas não conta como faturamento ou recompra.</p>}</div>
      <div><label className="field-label" htmlFor="sale-customer">Cliente</label><select id="sale-customer" className="nat-input" value={customerId} onChange={(e)=>setCustomerId(e.target.value)}><option value="">Cliente não identificado</option>{customers.map((customer)=><option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></div>
      <div><div className="flex items-center justify-between gap-3"><div><p className="field-label">Produtos</p><p className="field-help">Adicione todos os sabores do pedido.</p></div><button type="button" className="secondary-button shrink-0" onClick={addLine} disabled={lines.length>=sellable.length}><Plus size={16}/> Adicionar</button></div><div className="mt-3 space-y-3">{lines.map((line,index)=>{const usedByOthers=new Set(lines.filter((candidate)=>candidate.key!==line.key).map((candidate)=>candidate.productId));return <div key={line.key} className="grid grid-cols-[minmax(0,1fr)_82px_42px] gap-2 rounded-2xl bg-soft p-3"><select className="nat-input" aria-label={`Produto ${index+1}`} value={line.productId} onChange={(event)=>updateLines(lines.map((candidate)=>candidate.key===line.key?{...candidate,productId:event.target.value}:candidate))}>{sellable.filter((product)=>!usedByOthers.has(product.id)||product.id===line.productId).map((product)=><option key={product.id} value={product.id}>{product.name}</option>)}</select><input className="nat-input" inputMode="numeric" aria-label={`Quantidade ${index+1}`} value={line.quantity} onChange={(event)=>updateLines(lines.map((candidate)=>candidate.key===line.key?{...candidate,quantity:event.target.value}:candidate))}/><button type="button" className="icon-button" disabled={lines.length===1} onClick={()=>updateLines(lines.filter((candidate)=>candidate.key!==line.key))} aria-label="Remover produto"><Trash2 size={16}/></button></div>;})}</div></div>
      {transactionType==="sale"&&<><div className="rounded-2xl bg-rose-soft p-4"><div className="flex items-center justify-between gap-3"><span className="text-sm font-bold">Preço de tabela</span><strong className="font-display text-2xl">{money(listTotal)}</strong></div></div><div><label htmlFor="sale-total" className="field-label">Valor realmente recebido</label><input id="sale-total" className="nat-input" inputMode="decimal" value={total} onChange={(event)=>setTotal(event.target.value)}/>{hasAdjustment&&<p className="mt-2 text-sm text-caramel">{adjustment<0?"Desconto":"Acréscimo"}: <strong>{money(Math.abs(adjustment))}</strong></p>}</div><fieldset><legend className="field-label">Como recebeu?</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{(["pix","cash","card","other"] as PaymentMethod[]).map((item)=><button key={item} type="button" aria-pressed={method===item} className={`choice-button ${method===item?"active":""}`} onClick={()=>setMethod(item)}>{paymentLabel[item]}</button>)}</div></fieldset></>}
      <div><label htmlFor="sale-date" className="field-label">Data</label><input id="sale-date" type="date" className="nat-input" value={date} onChange={(event)=>setDate(event.target.value)} required/></div>
      {preview&&<div className="rounded-2xl bg-rose-soft p-4"><p className="text-xs font-bold uppercase tracking-wider text-caramel">Impacto desta movimentação</p><p className="mt-1 font-display text-3xl">{money(preview.contributionSnapshot)}</p><p className="mt-1 text-xs text-caramel">O banco recalcula o custo definitivo item a item ao salvar.</p></div>}
      {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button className="primary-button w-full justify-center" type="submit"><CircleDollarSign size={18}/> Salvar</button>
    </form>}</div>
  </div></div>;
}

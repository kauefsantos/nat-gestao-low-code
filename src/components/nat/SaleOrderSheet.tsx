import { CircleDollarSign, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { buildSaleOrder, money, paymentLabel, type NatState, type PaymentMethod, type Sale } from "@/domain/nat";
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
  const [error,setError] = useState("");

  const listTotal = useMemo(()=>lines.reduce((sum,line)=>{
    const product=sellable.find((candidate)=>candidate.id===line.productId);
    const quantity=Number(line.quantity.replace(",","."))||0;
    return sum+(product?.sellingPrice??0)*quantity;
  },0),[lines,sellable]);

  const received=Number(total.replace(",","."))||0;
  const adjustment=received-listTotal;
  const hasAdjustment=Math.abs(adjustment)>=0.005;
  let preview:Sale|null=null;
  try {
    const items=lines.map((line)=>({product:sellable.find((candidate)=>candidate.id===line.productId)!,quantity:Number(line.quantity.replace(",","."))||0}));
    if(items.length&&items.every((item)=>item.product&&item.quantity>0)) preview=buildSaleOrder({items,supplies:state.supplies,paymentFeePercent:state.settings.paymentFeePercent,totalReceived:received,paymentMethod:method,soldAt:`${date}T12:00:00.000Z`});
  } catch { preview=null; }

  function suggestedTotal(next:DraftLine[]) {
    return next.reduce((sum,line)=>{
      const product=sellable.find((candidate)=>candidate.id===line.productId);
      const quantity=Number(line.quantity.replace(",","."))||0;
      return sum+(product?.sellingPrice??0)*quantity;
    },0);
  }
  function updateLines(next:DraftLine[]) { setError(""); setLines(next); setTotal(String(suggestedTotal(next))); }
  function addLine() {
    const used=new Set(lines.map((line)=>line.productId));
    const nextProduct=sellable.find((product)=>!used.has(product.id));
    if(!nextProduct)return;
    updateLines([...lines,{key:crypto.randomUUID(),productId:nextProduct.id,quantity:"1"}]);
  }
  function submit(event:React.FormEvent) {
    event.preventDefault(); setError("");
    if(!lines.length){setError("Adicione pelo menos um produto.");return;}
    const ids=lines.map((line)=>line.productId);
    if(new Set(ids).size!==ids.length){setError("O mesmo produto não pode aparecer duas vezes.");return;}
    const items=lines.map((line)=>({product:sellable.find((candidate)=>candidate.id===line.productId),quantity:Number(line.quantity.replace(",","."))||0}));
    if(items.some((item)=>!item.product)){setError("Escolha um produto válido.");return;}
    if(items.some((item)=>item.quantity<=0)){setError("As quantidades precisam ser maiores que zero.");return;}
    if(received<0){setError("O valor recebido não pode ser negativo.");return;}
    if(!date){setError("Informe a data.");return;}
    try {
      onSave(buildSaleOrder({items:items.map((item)=>({product:item.product!,quantity:item.quantity})),supplies:state.supplies,paymentFeePercent:state.settings.paymentFeePercent,totalReceived:received,paymentMethod:method,soldAt:`${date}T12:00:00.000Z`}));
    } catch {
      setError("Revise os produtos, a disponibilidade e as receitas antes de registrar a venda.");
    }
  }

  return <div className="fixed inset-0 z-50 flex justify-end bg-[#35150A]/35 backdrop-blur-[2px]" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}>
    <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="sale-order-title" className="h-full w-full max-w-xl overflow-y-auto bg-[#FFF9F6] p-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(20px,env(safe-area-inset-top))] shadow-2xl sm:p-7">
      <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">NAT Gestão</p><h2 id="sale-order-title" className="mt-2 font-display text-4xl">Registrar venda</h2><p className="mt-2 text-sm leading-6 text-caramel">Adicione todos os produtos do pedido. Sabores pausados não aparecem aqui, e o banco recalcula os custos de cada item antes de gravar.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20}/></button></div>
      <div className="mt-7">{sellable.length===0?<div className="rounded-2xl border border-dashed border-nat p-8 text-center text-sm text-caramel">Nenhum sabor em produção está com a receita completa. Retome um sabor no Portfólio ou complete uma receita antes de registrar a venda.</div>:<form className="space-y-5" onSubmit={submit}>
        <div><div className="flex items-center justify-between gap-3"><div><p className="field-label">Produtos do pedido</p><p className="field-help">Um pedido pode ter brownies, brigadeiros e outros produtos juntos.</p></div><button type="button" className="secondary-button shrink-0" onClick={addLine} disabled={lines.length>=sellable.length}><Plus size={16}/> Adicionar</button></div>
          <div className="mt-3 space-y-3">{lines.map((line,index)=>{
            const usedByOthers=new Set(lines.filter((candidate)=>candidate.key!==line.key).map((candidate)=>candidate.productId));
            return <div key={line.key} className="grid grid-cols-[minmax(0,1fr)_82px_42px] gap-2 rounded-2xl bg-soft p-3"><div><label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-caramel sm:sr-only" htmlFor={`sale-product-${index}`}>Produto</label><select id={`sale-product-${index}`} className="nat-input" value={line.productId} onChange={(event)=>updateLines(lines.map((candidate)=>candidate.key===line.key?{...candidate,productId:event.target.value}:candidate))}>{sellable.filter((product)=>!usedByOthers.has(product.id)||product.id===line.productId).map((product)=><option key={product.id} value={product.id}>{product.name}</option>)}</select></div><div><label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-caramel sm:sr-only" htmlFor={`sale-quantity-${index}`}>Qtd.</label><input id={`sale-quantity-${index}`} className="nat-input" inputMode="numeric" aria-label={`Quantidade de ${sellable.find((product)=>product.id===line.productId)?.name??"produto"}`} value={line.quantity} onChange={(event)=>updateLines(lines.map((candidate)=>candidate.key===line.key?{...candidate,quantity:event.target.value}:candidate))}/></div><button type="button" className="icon-button self-end sm:self-center" disabled={lines.length===1} onClick={()=>updateLines(lines.filter((candidate)=>candidate.key!==line.key))} aria-label="Remover produto"><Trash2 size={16}/></button></div>;})}</div>
        </div>
        <div className="rounded-2xl bg-rose-soft p-4" aria-live="polite"><div className="flex items-center justify-between gap-3"><span className="text-sm font-bold">Preço de tabela do pedido</span><strong className="font-display text-2xl">{money(listTotal)}</strong></div><p className="mt-1 text-xs text-caramel">Você pode alterar o valor recebido para registrar desconto, acréscimo ou negociação.</p></div>
        <div><label htmlFor="sale-total" className="field-label">Valor realmente recebido</label><input id="sale-total" className="nat-input" inputMode="decimal" value={total} onChange={(event)=>{setError("");setTotal(event.target.value);}}/>{hasAdjustment&&<p className="mt-2 rounded-xl bg-soft px-3 py-2 text-sm text-caramel" aria-live="polite">{adjustment<0?"Desconto":"Acréscimo"}: <strong className="text-chocolate">{money(Math.abs(adjustment))}</strong></p>}</div>
        <fieldset><legend className="field-label">Como recebeu?</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{(["pix","cash","card","other"] as PaymentMethod[]).map((item)=><button key={item} type="button" aria-pressed={method===item} className={`choice-button ${method===item?"active":""}`} onClick={()=>{setError("");setMethod(item);}}>{paymentLabel[item]}</button>)}</div></fieldset>
        <div><label htmlFor="sale-date" className="field-label">Data da venda</label><input id="sale-date" type="date" className="nat-input" value={date} onChange={(event)=>{setError("");setDate(event.target.value);}} required/></div>
        {preview&&<div className="rounded-2xl bg-rose-soft p-4" aria-live="polite"><p className="text-xs font-bold uppercase tracking-wider text-caramel">Quanto sobra nesta venda</p><p className="mt-1 font-display text-3xl">{money(preview.contributionSnapshot)}</p><p className="mt-1 text-xs text-caramel">Estimativa antes dos custos fixos e gastos esporádicos. O banco recalcula o valor definitivo item a item ao salvar.</p></div>}
        {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button className="primary-button w-full justify-center" type="submit"><CircleDollarSign size={18}/> Salvar pedido</button>
      </form>}</div>
    </div>
  </div>;
}

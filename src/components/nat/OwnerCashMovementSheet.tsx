import { CircleDollarSign, X } from "lucide-react";
import { useState } from "react";
import { id, ownerCashMovementLabel, type OwnerCashMovement, type OwnerCashMovementType } from "@/domain/nat";
import { useDialogA11y } from "@/hooks/use-dialog-a11y";

export function OwnerCashMovementSheet({value,onClose,onSave}:{value?:OwnerCashMovement;onClose:()=>void;onSave:(movement:OwnerCashMovement)=>void}){
  const [movementType,setMovementType]=useState<OwnerCashMovementType>(value?.movementType??"contribution");
  const [amount,setAmount]=useState(value?String(value.amount):"");
  const [date,setDate]=useState(value?.occurredAt.slice(0,10)??new Date().toISOString().slice(0,10));
  const [note,setNote]=useState(value?.note??"");
  const [error,setError]=useState("");
  const panelRef=useDialogA11y<HTMLDivElement>({onClose});
  const submit=(event:React.FormEvent)=>{
    event.preventDefault();setError("");
    const numeric=Number(amount.replace(",","."));
    if(!Number.isFinite(numeric)||numeric<=0){setError("Informe um valor maior que zero.");return;}
    if(!date){setError("Informe a data.");return;}
    const now=new Date().toISOString();
    onSave({id:value?.id??id("owner-cash"),movementType,amount:numeric,occurredAt:date,note:note.trim()||null,createdAt:value?.createdAt??now,updatedAt:now});
  };
  return <div className="fixed inset-0 z-50 flex justify-end bg-[#35150A]/35 backdrop-blur-[2px]" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}>
    <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="owner-cash-title" className="h-full w-full max-w-xl overflow-y-auto bg-[#FFF9F6] p-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(20px,env(safe-area-inset-top))] shadow-2xl sm:p-7">
      <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Caixa</p><h2 id="owner-cash-title" className="mt-2 font-display text-4xl">{value?"Editar movimento":"Capital, aporte ou retirada"}</h2><p className="mt-2 text-sm leading-6 text-caramel">Capital inicial registra a base de abertura uma única vez. Novos aportes e retiradas pertencem ao fluxo posterior dos donos. Nenhum deles é faturamento.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20}/></button></div>
      <form className="mt-7 space-y-5" onSubmit={submit}>
        <fieldset><legend className="field-label">Tipo</legend><div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{(["initial_capital","contribution","withdrawal"] as OwnerCashMovementType[]).map((type)=><button key={type} type="button" aria-pressed={movementType===type} className={`choice-button ${movementType===type?"active":""}`} onClick={()=>setMovementType(type)}>{ownerCashMovementLabel[type]}</button>)}</div></fieldset>
        <div><label htmlFor="owner-cash-amount" className="field-label">Valor</label><input id="owner-cash-amount" className="nat-input" inputMode="decimal" value={amount} onChange={(event)=>setAmount(event.target.value)} placeholder="0,00" required/></div>
        <div><label htmlFor="owner-cash-date" className="field-label">Data</label><input id="owner-cash-date" className="nat-input" type="date" value={date} onChange={(event)=>setDate(event.target.value)} required/></div>
        <div><label htmlFor="owner-cash-note" className="field-label">Observação (opcional)</label><input id="owner-cash-note" className="nat-input" value={note} onChange={(event)=>setNote(event.target.value)} maxLength={500} placeholder={movementType==="initial_capital"?"Ex.: capital inicial consolidado":"Ex.: reforço de caixa para insumos"}/></div>
        <div className="rounded-2xl bg-rose-soft p-4 text-sm text-caramel"><strong className="block text-chocolate">Capital e aporte ≠ receita</strong><span>O capital inicial fica separado dos novos aportes. Ambos explicam a origem do dinheiro, mas não aumentam faturamento nem resultado.</span></div>
        {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button type="submit" className="primary-button w-full justify-center"><CircleDollarSign size={18}/> Salvar movimento</button>
      </form>
    </div>
  </div>;
}

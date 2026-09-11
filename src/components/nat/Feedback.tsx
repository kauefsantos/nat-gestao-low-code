import { AlertTriangle, CheckCircle2, LoaderCircle, X } from "lucide-react";
import { useId, type ReactNode } from "react";
import { useDialogA11y } from "@/hooks/use-dialog-a11y";

export type AppNotice = { tone:"saving"|"saved"|"error"; message:string } | null;

export function StatusToast({ notice,onDismiss }: { notice:AppNotice; onDismiss?:()=>void }) {
  if(!notice)return null;
  const Icon=notice.tone==="saving"?LoaderCircle:notice.tone==="saved"?CheckCircle2:AlertTriangle;
  const role=notice.tone==="error"?"alert":"status";
  return <div className="pointer-events-none fixed inset-x-0 top-[max(76px,env(safe-area-inset-top))] z-[70] flex justify-center px-4" aria-live={notice.tone==="error"?"assertive":"polite"}>
    <div role={role} className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border bg-white px-4 py-3 shadow-xl ${notice.tone==="error"?"border-red-200":"border-nat"}`}>
      <Icon size={19} className={`mt-0.5 shrink-0 ${notice.tone==="saving"?"animate-spin":""}`} aria-hidden="true"/>
      <p className="min-w-0 flex-1 text-sm font-semibold leading-5">{notice.message}</p>
      {notice.tone!=="saving"&&onDismiss&&<button type="button" className="-mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-full hover:bg-soft" onClick={onDismiss} aria-label="Fechar aviso"><X size={15}/></button>}
    </div>
  </div>;
}

export function ConfirmDialog({ title,text,confirmLabel="Confirmar",danger=false,onClose,onConfirm,children }: { title:string; text:string; confirmLabel?:string; danger?:boolean; onClose:()=>void; onConfirm:()=>void; children?:ReactNode }) {
  const titleId=useId();
  const panelRef=useDialogA11y<HTMLDivElement>({onClose});
  return <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#35150A]/35 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}>
    <div ref={panelRef} tabIndex={-1} role="alertdialog" aria-modal="true" aria-labelledby={titleId} className="w-full rounded-t-[28px] bg-[#FFF9F6] p-5 pb-[max(24px,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:rounded-[28px] sm:p-6">
      <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Confirmar ação</p><h2 id={titleId} className="mt-1 font-display text-3xl">{title}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X size={19}/></button></div>
      <p className="mt-3 text-sm leading-6 text-caramel">{text}</p>
      {children&&<div className="mt-4">{children}</div>}
      <div className="mt-5 grid grid-cols-2 gap-2"><button type="button" className="secondary-button justify-center" onClick={onClose}>Voltar</button><button type="button" className={`justify-center ${danger?"rounded-xl bg-red-700 px-4 py-3 font-bold text-white":"primary-button"}`} onClick={onConfirm}>{confirmLabel}</button></div>
    </div>
  </div>;
}

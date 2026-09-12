import { AlertTriangle, CheckCircle2, LoaderCircle, X } from "lucide-react";
import { useId, type ReactNode } from "react";
import { useDialogA11y } from "@/hooks/use-dialog-a11y";

export type AppNotice = { tone:"saving"|"saved"|"error"; message:string; actionLabel?:string; onAction?:()=>void } | null;

export function StatusToast({ notice,onDismiss }: { notice:AppNotice; onDismiss?:()=>void }) {
  if(!notice)return null;
  const Icon=notice.tone==="saving"?LoaderCircle:notice.tone==="saved"?CheckCircle2:AlertTriangle;
  const role=notice.tone==="error"?"alert":"status";
  return <div className="pointer-events-none fixed inset-x-0 top-[max(76px,env(safe-area-inset-top))] z-[70] flex justify-center pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))]" aria-live={notice.tone==="error"?"assertive":"polite"}>
    <div role={role} className={`pointer-events-auto flex w-full max-w-lg items-start gap-3 rounded-2xl border bg-white px-4 py-3 shadow-xl ${notice.tone==="error"?"border-red-200":"border-nat"}`}>
      <Icon size={19} className={`mt-0.5 shrink-0 ${notice.tone==="saving"?"animate-spin":""}`} aria-hidden="true"/>
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold leading-5">{notice.message}</p>{notice.actionLabel&&notice.onAction&&<button type="button" className="mt-1 min-h-11 px-1 text-xs font-black underline underline-offset-4" onClick={notice.onAction}>{notice.actionLabel}</button>}</div>
      {notice.tone!=="saving"&&onDismiss&&<button type="button" className="-my-2 -mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full" onClick={onDismiss} aria-label="Fechar aviso"><X size={15}/></button>}
    </div>
  </div>;
}

export function ConfirmDialog({ title,text,confirmLabel="Confirmar",danger=false,busy=false,onClose,onConfirm,children }: { title:string; text:string; confirmLabel?:string; danger?:boolean; busy?:boolean; onClose:()=>void; onConfirm:()=>void; children?:ReactNode }) {
  const titleId=useId();
  const safeClose=()=>{if(!busy)onClose();};
  const panelRef=useDialogA11y<HTMLDivElement>({onClose:safeClose});
  return <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#35150A]/35 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(event)=>{if(event.target===event.currentTarget)safeClose();}}>
    <div ref={panelRef} tabIndex={-1} role="alertdialog" aria-modal="true" aria-labelledby={titleId} className="max-h-[100dvh] w-full overflow-y-auto overscroll-contain rounded-t-[28px] bg-[#FFF9F6] p-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(20px,env(safe-area-inset-top))] shadow-2xl sm:max-h-[calc(100dvh-48px)] sm:max-w-md sm:rounded-[28px] sm:p-6">
      <div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="eyebrow">Confirmar ação</p><h2 id={titleId} className="mt-1 font-display text-3xl">{title}</h2></div><button type="button" className="icon-button shrink-0" onClick={safeClose} disabled={busy} aria-label="Fechar"><X size={19}/></button></div>
      <p className="mt-3 text-sm leading-6 text-caramel">{text}</p>
      {children&&<div className="mt-4">{children}</div>}
      <div className="mt-5 grid grid-cols-2 gap-2"><button type="button" className="secondary-button justify-center" onClick={safeClose} disabled={busy}>Voltar</button><button type="button" disabled={busy} className={`min-h-11 justify-center ${danger?"rounded-xl bg-red-700 px-4 py-3 font-bold text-white disabled:opacity-50":"primary-button"}`} onClick={onConfirm}>{busy?"Processando...":confirmLabel}</button></div>
    </div>
  </div>;
}

export function HelpTip({label,children}:{label:string;children:ReactNode}){
  return <details className="group relative inline-block align-middle"><summary className="ml-1 inline-grid h-8 w-8 cursor-pointer list-none place-items-center rounded-full border border-nat text-xs font-black text-caramel" aria-label={label}>?</summary><div className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+80px)] z-[80] rounded-2xl border border-nat bg-white p-3 text-left text-xs font-normal leading-5 text-caramel shadow-xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:mt-2 sm:w-64">{children}</div></details>;
}

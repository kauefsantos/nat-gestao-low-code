import { Bell, BellOff, CalendarDays, Check, Clock3, History, LoaderCircle, PackageCheck, Pencil, Plus, ShoppingBasket, Sparkles, X, XCircle } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { calendarEventDateLabel, calendarEventShortDate, calendarKindLabel, type CalendarEvent, type CalendarEventKind } from "@/domain/calendar";
import { useCalendar } from "@/hooks/use-calendar";
import { useDialogA11y } from "@/hooks/use-dialog-a11y";
import { disableNatPush, enableNatPush, getNatPushState, type PushState } from "@/lib/push";

const kindIcon:Record<CalendarEventKind,React.ReactNode>={
  content:<Sparkles size={16}/>,delivery:<PackageCheck size={16}/>,production:<Clock3 size={16}/>,purchase:<ShoppingBasket size={16}/>,
};

function saoPauloDate(){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const get=(type:string)=>parts.find((part)=>part.type===type)?.value??"";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function EventForm({event,onClose,onSave}:{event:CalendarEvent|null;onClose:()=>void;onSave:(event:CalendarEvent)=>Promise<void>}) {
  const editing=Boolean(event);
  const titleId=useId();
  const formRef=useDialogA11y<HTMLFormElement>({onClose});
  const [date,setDate]=useState(event?.eventDate??saoPauloDate);
  const [time,setTime]=useState(event?.eventTime?event.eventTime.slice(0,5):"");
  const [kind,setKind]=useState<CalendarEventKind>(event?.kind??"delivery");
  const [title,setTitle]=useState(event?.title??"");
  const [details,setDetails]=useState(event?.details??"");
  const [channel,setChannel]=useState(event?.channel??"");
  const [objective,setObjective]=useState(event?.objective??"");
  const [reminder,setReminder]=useState(event?event.reminderEnabled:true);
  const [saving,setSaving]=useState(false);
  const [failure,setFailure]=useState<string|null>(null);

  async function submit(formEvent:React.FormEvent){
    formEvent.preventDefault();
    if(!title.trim())return;
    setSaving(true); setFailure(null);
    try{
      await onSave({
        id:event?.id??crypto.randomUUID(),
        eventDate:date,
        eventTime:time||null,
        kind,
        title:title.trim(),
        details:details.trim()||null,
        channel:channel.trim()||null,
        objective:objective.trim()||null,
        status:event?.status==="done"?"done":"planned",
        source:event?.source??"manual",
        updatedAt:event?.updatedAt??null,
        reminderEnabled:reminder,
        completedAt:event?.completedAt??null,
        cancelledAt:event?.cancelledAt??null,
      });
      onClose();
    }catch(cause){
      const message=cause instanceof Error?cause.message:"";
      setFailure(message.includes("CONFLICT")?"Esse compromisso mudou em outro aparelho. Feche e abra a agenda para ver a versão mais nova.":"Não foi possível salvar o compromisso. Confira os campos e tente novamente.");
    }finally{setSaving(false);}
  }

  return <div className="fixed inset-0 z-50 flex items-end overflow-y-auto bg-black/30 p-0 sm:items-center sm:justify-center sm:p-6" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}>
    <form ref={formRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit} className="w-full rounded-t-[28px] bg-cream p-5 shadow-xl sm:max-w-lg sm:rounded-[28px] sm:p-6">
      <div className="flex items-center justify-between">
        <div><p className="eyebrow">Agenda NAT</p><h2 id={titleId} className="font-display text-3xl">{editing?"Editar compromisso":"Novo compromisso"}</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18}/></button>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <label className="field-label">Data<input required type="date" className="nat-input mt-1" value={date} onChange={e=>setDate(e.target.value)}/></label>
        <label className="field-label">Horário<input type="time" className="nat-input mt-1" value={time} onChange={e=>setTime(e.target.value)}/></label>
      </div>
      <label className="field-label mt-4">Tipo<select className="nat-input mt-1" value={kind} onChange={e=>setKind(e.target.value as CalendarEventKind)}><option value="delivery">Entrega</option><option value="production">Produção</option><option value="purchase">Compra</option><option value="content">Conteúdo</option></select></label>
      <label className="field-label mt-4">Título<input required maxLength={180} className="nat-input mt-1" placeholder="Ex.: Entregar caixa para Ana" value={title} onChange={e=>setTitle(e.target.value)}/></label>
      <label className="field-label mt-4">Detalhes<textarea maxLength={2000} className="nat-input mt-1 min-h-24 resize-y" placeholder="Endereço, pedido, observações..." value={details} onChange={e=>setDetails(e.target.value)}/></label>
      {(kind==="content"||channel||objective)&&<div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="field-label">Formato<input maxLength={120} className="nat-input mt-1" placeholder="Ex.: Reels" value={channel} onChange={e=>setChannel(e.target.value)}/></label>
        <label className="field-label">Objetivo<input maxLength={240} className="nat-input mt-1" placeholder="Ex.: mostrar o recheio" value={objective} onChange={e=>setObjective(e.target.value)}/></label>
      </div>}
      <label className="mt-4 flex items-start gap-3 rounded-2xl border border-nat bg-white/45 p-4">
        <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-current" checked={reminder} onChange={e=>setReminder(e.target.checked)}/>
        <span><span className="text-sm font-bold">Receber lembrete</span><span className="mt-1 block text-xs leading-5 text-caramel">A NAT avisa no celular nos horários dos lembretes. Desmarque se não quiser aviso deste compromisso.</span></span>
      </label>
      {failure&&<p className="mt-4 rounded-2xl bg-rose-soft p-3 text-sm" role="alert">{failure}</p>}
      <button type="submit" disabled={saving||!title.trim()} className="primary-button mt-5 w-full justify-center">{saving?"Salvando...":editing?"Salvar alterações":"Adicionar ao calendário"}</button>
    </form>
  </div>;
}

function pushStateText(state:PushState){
  if(state==="enabled")return "Ativas neste aparelho. A NAT avisa às 09h, 12h, 16h e 21h quando houver algo planejado.";
  if(state==="install_required")return "No iPhone, adicione a NAT à Tela de Início pelo Safari e abra pelo ícone para ativar os avisos.";
  if(state==="denied")return "As notificações estão bloqueadas para este app. Reative a permissão nos Ajustes do aparelho.";
  if(state==="unsupported")return "Este navegador ou aparelho não oferece Web Push para a NAT.";
  return "Ative os avisos neste aparelho para receber lembretes mesmo com o app fechado.";
}

function PushPanel({businessId}:{businessId:string|null}){
  const [state,setState]=useState<PushState>("prompt"); const [busy,setBusy]=useState(false); const [message,setMessage]=useState<string|null>(null);
  useEffect(()=>{let cancelled=false;void getNatPushState().then((next)=>{if(!cancelled)setState(next);}).catch(()=>{if(!cancelled)setState("unsupported");});return()=>{cancelled=true;};},[]);
  async function enable(){if(!businessId)return;setBusy(true);setMessage(null);try{setState(await enableNatPush(businessId));setMessage("Lembretes configurados neste aparelho.");}catch(error){setMessage(error instanceof Error?error.message:"Não foi possível ativar os lembretes.");}finally{setBusy(false);}}
  async function disable(){if(!businessId)return;setBusy(true);setMessage(null);try{setState(await disableNatPush(businessId));setMessage("Lembretes desativados neste aparelho.");}catch(error){setMessage(error instanceof Error?error.message:"Não foi possível desativar os lembretes.");}finally{setBusy(false);}}
  const canEnable=businessId&&state!=="enabled"&&state!=="denied"&&state!=="unsupported"&&state!=="install_required";
  return <div className="rounded-2xl border border-nat bg-white/45 p-4">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rose-soft">{state==="enabled"?<Bell size={18}/>:<BellOff size={18}/>}</div><div><p className="text-sm font-bold">Lembretes do iPhone</p><p className="mt-1 max-w-2xl text-xs leading-5 text-caramel">{pushStateText(state)}</p></div></div>
      {state==="enabled"?<button type="button" className="secondary-button shrink-0 justify-center" onClick={()=>void disable()} disabled={busy}>{busy?<LoaderCircle className="animate-spin" size={16}/>:<BellOff size={16}/>} Desativar</button>:<button type="button" className="primary-button shrink-0 justify-center" onClick={()=>void enable()} disabled={!canEnable||busy}>{busy?<LoaderCircle className="animate-spin" size={16}/>:<Bell size={16}/>} Ativar lembretes</button>}
    </div>
    <div className="mt-3 flex flex-wrap gap-2">{["09h · sem horário ou antes das 12h","12h · compromissos das 12h às 15h59","16h · compromissos a partir das 16h","21h · agenda de amanhã"].map((item)=><span key={item} className="rounded-full bg-soft px-3 py-2 text-[11px] font-bold text-caramel">{item}</span>)}</div>
    {message&&<p className="mt-3 text-xs text-caramel" role="status">{message}</p>}
  </div>;
}

function EventCard({item,onEdit,onToggleDone,onCancel}:{item:CalendarEvent;onEdit:()=>void;onToggleDone:()=>void;onCancel:()=>void}){
  const cancelled=item.status==="cancelled";
  return <article className={`flex gap-3 rounded-2xl border border-nat p-4 ${item.status==="done"?"opacity-55":""} ${cancelled?"bg-soft/60 opacity-70":""}`}>
    <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-rose-soft">{kindIcon[item.kind]}</div>
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-black uppercase tracking-wider text-caramel">{calendarKindLabel[item.kind]}</span>
        {item.eventTime&&<span className="text-xs font-bold">{item.eventTime.slice(0,5)}</span>}
        {item.source==="editorial_seed"&&<span className="rounded-full bg-soft px-2 py-1 text-[10px] font-bold text-caramel">Sugestão NAT</span>}
        {cancelled&&<span className="rounded-full bg-rose-soft px-2 py-1 text-[10px] font-bold">Cancelado</span>}
        {!cancelled&&!item.reminderEnabled&&<span className="inline-flex items-center gap-1 rounded-full bg-soft px-2 py-1 text-[10px] font-bold text-caramel"><BellOff size={11}/> sem lembrete</span>}
      </div>
      <p className={`mt-1 font-bold ${item.status==="done"||cancelled?"line-through":""}`}>{item.title}</p>
      {item.details&&<p className="mt-1 text-sm leading-6 text-caramel">{item.details}</p>}
      {item.channel&&<p className="mt-2 text-xs text-caramel"><strong>Formato:</strong> {item.channel}</p>}
      {item.objective&&<p className="text-xs text-caramel"><strong>Objetivo:</strong> {item.objective}</p>}
      {cancelled&&<p className="mt-2 text-xs text-caramel">Guardado no histórico. Nada foi apagado.</p>}
    </div>
    {!cancelled&&<div className="flex shrink-0 flex-col gap-1">
      <button type="button" className="icon-button" aria-label={item.status==="done"?"Reabrir compromisso":"Marcar como feito"} onClick={onToggleDone}>{item.status==="done"?<Clock3 size={16}/>:<Check size={16}/>}</button>
      <button type="button" className="icon-button" aria-label="Editar compromisso" onClick={onEdit}><Pencil size={16}/></button>
      <button type="button" className="icon-button" aria-label="Cancelar compromisso" onClick={onCancel}><XCircle size={16}/></button>
    </div>}
  </article>;
}

export function CalendarView(){
  const {events,loading,error,businessId,save,cancel}=useCalendar();
  const [formOpen,setFormOpen]=useState(false);
  const [editing,setEditing]=useState<CalendarEvent|null>(null);

  const activeEvents=useMemo(()=>events.filter(event=>event.status!=="cancelled"),[events]);
  const cancelledEvents=useMemo(()=>events.filter(event=>event.status==="cancelled"),[events]);
  const groups=useMemo(()=>{const map=new Map<string,CalendarEvent[]>();for(const event of activeEvents){const list=map.get(event.eventDate)??[];list.push(event);map.set(event.eventDate,list);}return [...map.entries()];},[activeEvents]);
  const today=saoPauloDate(); const todayEvents=activeEvents.filter(event=>event.eventDate===today);

  function openNew(){setEditing(null);setFormOpen(true);}
  function openEdit(event:CalendarEvent){setEditing(event);setFormOpen(true);}
  async function cancelEvent(event:CalendarEvent){
    if(!window.confirm(`Cancelar “${event.title}”? Ele sai da agenda e fica guardado no histórico.`))return;
    await cancel(event);
  }

  return <section className="space-y-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="eyebrow">Rotina da NAT</p><h1 className="mt-2 font-display text-4xl sm:text-5xl">Calendário</h1><p className="mt-2 max-w-2xl text-caramel">Entregas, produção, compras e conteúdo no mesmo lugar. Você pode editar, marcar como feito ou cancelar sem perder o histórico.</p></div>
      <button type="button" className="primary-button" onClick={openNew}><Plus size={18}/> Adicionar</button>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="metric-card"><p className="text-xs font-bold uppercase tracking-wider text-caramel">Hoje</p><p className="mt-3 font-display text-3xl">{todayEvents.length}</p><p className="mt-1 text-xs text-caramel">compromissos</p></div>
      <div className="metric-card"><p className="text-xs font-bold uppercase tracking-wider text-caramel">Conteúdo</p><p className="mt-3 font-display text-3xl">{activeEvents.filter(e=>e.kind==="content"&&e.status==="planned").length}</p><p className="mt-1 text-xs text-caramel">ideias planejadas</p></div>
      <div className="metric-card"><p className="text-xs font-bold uppercase tracking-wider text-caramel">Entregas</p><p className="mt-3 font-display text-3xl">{activeEvents.filter(e=>e.kind==="delivery"&&e.status==="planned").length}</p><p className="mt-1 text-xs text-caramel">pendentes</p></div>
    </div>
    <div className="nat-card">
      <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-full bg-rose-soft"><CalendarDays size={19}/></div><div><h2 className="section-title">Agenda</h2><p className="text-sm text-caramel">Marque como feito, edite ou cancele sem apagar o histórico.</p></div></div>
      {loading?<p className="mt-6 text-sm text-caramel">Carregando calendário...</p>:error?<p className="mt-6 rounded-2xl bg-rose-soft p-4 text-sm">{error}</p>:<div className="mt-6 space-y-6">
        {groups.map(([date,items])=><div key={date}>
          <div className="mb-2 flex items-center justify-between"><h3 className="font-display text-2xl capitalize">{calendarEventDateLabel(date)}</h3><span className="text-xs font-bold text-caramel">{calendarEventShortDate(date)}</span></div>
          <div className="space-y-2">{items.map(item=><EventCard key={item.id} item={item} onEdit={()=>openEdit(item)} onToggleDone={()=>void save({...item,status:item.status==="done"?"planned":"done"})} onCancel={()=>void cancelEvent(item)}/>)}</div>
        </div>)}
        {groups.length===0&&<p className="text-sm text-caramel">Nenhum compromisso na agenda.</p>}
      </div>}
    </div>
    {cancelledEvents.length>0&&<div className="nat-card">
      <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-full bg-soft"><History size={19}/></div><div><h2 className="section-title">Histórico de cancelados</h2><p className="text-sm text-caramel">Ficam guardados aqui só para consulta.</p></div></div>
      <div className="mt-5 space-y-2">{cancelledEvents.map(item=><EventCard key={item.id} item={item} onEdit={()=>undefined} onToggleDone={()=>undefined} onCancel={()=>undefined}/>)}</div>
    </div>}
    <PushPanel businessId={businessId}/>
    {formOpen&&<EventForm event={editing} onClose={()=>{setFormOpen(false);setEditing(null);}} onSave={save}/>}
  </section>;
}

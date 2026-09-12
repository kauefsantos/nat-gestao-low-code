import { Copy, Download, Image as ImageIcon, KeyRound, LoaderCircle, Sparkles, Unplug } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  configureContentAi,
  disconnectContentAi,
  generateContentWithAi,
  loadContentAiStatus,
  type AiCopy,
  type ContentFormat,
} from "@/data/content-ai-repository";

type FormatKey=ContentFormat;

const AI_ENABLED=false;

const formats:Record<FormatKey,{label:string;width:number;height:number}>={
  feed:{label:"Feed 1080 × 1350",width:1080,height:1350},
  story:{label:"Story 1080 × 1920",width:1080,height:1920},
  square:{label:"Quadrado 1080 × 1080",width:1080,height:1080},
};

function headlineFromPrompt(prompt:string){
  const clean=prompt.trim().replace(/\s+/g," ");
  if(!clean)return "Um doce momento começa aqui";
  if(clean.length<=64)return clean;
  return `${clean.slice(0,61).trim()}…`;
}

function wrapText(ctx:CanvasRenderingContext2D,text:string,maxWidth:number){
  const words=text.split(/\s+/);const lines:string[]=[];let line="";
  for(const word of words){const next=line?`${line} ${word}`:word;if(ctx.measureText(next).width>maxWidth&&line){lines.push(line);line=word;}else line=next;}
  if(line)lines.push(line);return lines;
}

export function ContentStudio(){
  const [prompt,setPrompt]=useState(""); const [format,setFormat]=useState<FormatKey>("feed"); const [generated,setGenerated]=useState(false);
  const [aiConnected,setAiConnected]=useState<boolean|null>(null); const [aiCopy,setAiCopy]=useState<AiCopy|null>(null); const [aiBusy,setAiBusy]=useState(false);
  const [showKey,setShowKey]=useState(false); const [apiKey,setApiKey]=useState(""); const [message,setMessage]=useState<string|null>(null);
  const canvasRef=useRef<HTMLCanvasElement|null>(null); const selected=useMemo(()=>formats[format],[format]);
  const [businessId,setBusinessId]=useState<string|null>(null);

  useEffect(()=>{
    let cancelled=false;
    async function load(){
      if(!AI_ENABLED){if(!cancelled)setAiConnected(false);return;}
      try{
        const status=await loadContentAiStatus();
        if(cancelled)return;
        setBusinessId(status.businessId);
        setAiConnected(status.connected);
      }catch{
        if(!cancelled)setAiConnected(false);
      }
    }
    void load();
    return()=>{cancelled=true;};
  },[]);

  function render(copy:AiCopy|null=aiCopy){
    const canvas=canvasRef.current;if(!canvas)return;canvas.width=selected.width;canvas.height=selected.height;const ctx=canvas.getContext("2d");if(!ctx)return;
    const w=canvas.width,h=canvas.height;ctx.fillStyle="#F8EEE9";ctx.fillRect(0,0,w,h);
    ctx.fillStyle="#EAAC93";ctx.beginPath();ctx.ellipse(w*.1,h*.1,w*.26,h*.13,-.4,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=.55;ctx.beginPath();ctx.ellipse(w*.92,h*.88,w*.32,h*.18,-.5,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    ctx.fillStyle="#35150A";ctx.beginPath();ctx.arc(w/2,h*.2,Math.min(w,h)*.115,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="#F8EEE9";ctx.lineWidth=4;ctx.beginPath();ctx.arc(w/2,h*.2,Math.min(w,h)*.103,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle="#F8EEE9";ctx.textAlign="center";ctx.font=`${Math.round(w*.12)}px Georgia, serif`;ctx.fillText("NAT",w/2,h*.215);
    ctx.font=`700 ${Math.round(w*.022)}px Arial, sans-serif`;ctx.fillText("BROWNIES E BRIGADEIROS GOURMET",w/2,h*.255);

    ctx.fillStyle="#35150A";ctx.font=`${Math.round(w*.072)}px Georgia, serif`;
    const title=copy?.headline||headlineFromPrompt(prompt);const lines=wrapText(ctx,title,w*.74).slice(0,4);const start=h*.46-(lines.length-1)*w*.043;
    lines.forEach((line,index)=>ctx.fillText(line,w/2,start+index*w*.09));

    const subheadline=copy?.subheadline||"Mais que doces: bons momentos em cada mordida.";
    ctx.fillStyle="#956454";ctx.font=`600 ${Math.round(w*.025)}px Arial, sans-serif`;
    const subLines=wrapText(ctx,subheadline,w*.7).slice(0,3);
    subLines.forEach((line,index)=>ctx.fillText(line,w/2,h*.69+index*w*.038));

    ctx.strokeStyle="#EAAC93";ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(w*.28,h*.79);ctx.quadraticCurveTo(w*.5,h*.75,w*.72,h*.79);ctx.stroke();
    ctx.fillStyle="#35150A";ctx.font=`700 ${Math.round(w*.024)}px Arial, sans-serif`;ctx.fillText(copy?.cta||"Peça pelo direct",w/2,h*.85);
    ctx.fillStyle="#956454";ctx.font=`700 ${Math.round(w*.022)}px Arial, sans-serif`;ctx.fillText("@natgourmet.doces",w/2,h*.91);
    setGenerated(true);
  }

  async function connectAi(){
    if(!AI_ENABLED){setMessage("IA temporariamente desativada. Ela poderá ser ativada no futuro.");return;}
    if(!businessId||!apiKey.trim())return;
    setAiBusy(true);setMessage(null);
    try{
      await configureContentAi(businessId,apiKey.trim());
      setApiKey("");setShowKey(false);setAiConnected(true);setMessage("IA conectada com segurança.");
    }catch(error){setMessage(error instanceof Error?error.message:"Não foi possível conectar a IA.");}
    finally{setAiBusy(false);}
  }

  async function disconnectAi(){
    if(!AI_ENABLED)return;
    if(!businessId||!window.confirm("Desconectar a IA da NAT? A chave armazenada será removida."))return;
    setAiBusy(true);setMessage(null);
    try{
      await disconnectContentAi(businessId);
      setAiConnected(false);setAiCopy(null);setMessage("IA desconectada.");
    }catch(error){setMessage(error instanceof Error?error.message:"Não foi possível desconectar a IA.");}
    finally{setAiBusy(false);}
  }

  async function generateWithAi(){
    if(!AI_ENABLED){setMessage("IA temporariamente desativada. Use o Modelo NAT sem IA por enquanto.");return;}
    if(!businessId||!prompt.trim())return;
    setAiBusy(true);setMessage(null);
    try{
      const result=await generateContentWithAi({businessId,prompt:prompt.trim(),format});
      setAiCopy(result);render(result);setMessage("Conteúdo criado com IA e aplicado ao layout da NAT.");
    }catch(error){setMessage(error instanceof Error?error.message:"Não foi possível gerar o conteúdo com IA.");}
    finally{setAiBusy(false);}
  }

  function generateTemplate(){setAiCopy(null);render(null);setMessage("Modelo NAT gerado sem usar IA.");}
  function download(){const canvas=canvasRef.current;if(!canvas||!generated)return;const link=document.createElement("a");link.download=`nat-${format}-${new Date().toISOString().slice(0,10)}.png`;link.href=canvas.toDataURL("image/png");link.click();}
  async function copyCaption(){if(aiCopy?.caption&&navigator.clipboard)await navigator.clipboard.writeText(aiCopy.caption);}

  return <div className="nat-card">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rose-soft"><Sparkles size={19}/></div><div><p className="eyebrow">Criar conteúdo</p><h2 className="font-display text-3xl">Monte seu conteúdo da NAT</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-caramel">Crie uma arte no padrão visual da NAT e baixe em PNG. A geração automática de textos com IA está temporariamente desativada.</p></div></div>
      {AI_ENABLED?(aiConnected?<button type="button" className="secondary-button shrink-0" onClick={()=>void disconnectAi()} disabled={aiBusy}><Unplug size={16}/> Desconectar IA</button>:<button type="button" className="secondary-button shrink-0" onClick={()=>setShowKey((value)=>!value)}><KeyRound size={16}/> Conectar IA</button>):<div className="shrink-0 rounded-xl bg-rose-soft px-4 py-2 text-center text-xs font-bold text-caramel">IA temporariamente desativada</div>}
    </div>

    {AI_ENABLED&&showKey&&!aiConnected&&<div className="mt-5 rounded-2xl border border-nat bg-soft p-4"><p className="text-sm font-bold">Conectar OpenAI</p><p className="mt-1 text-xs leading-5 text-caramel">Cole uma chave da API da OpenAI. Ela é enviada diretamente ao backend e armazenada com segurança no Lovable Cloud; o app não consegue lê-la de volta.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><input type="password" autoComplete="off" className="nat-input flex-1" placeholder="Chave da API" value={apiKey} onChange={e=>setApiKey(e.target.value)}/><button type="button" className="primary-button justify-center" onClick={()=>void connectAi()} disabled={aiBusy||apiKey.trim().length<20}>{aiBusy?<LoaderCircle className="animate-spin" size={17}/>:<KeyRound size={17}/>} Salvar conexão</button></div></div>}

    <label className="field-label mt-5">O que você quer comunicar?<textarea className="nat-input mt-1 min-h-28 resize-y" maxLength={1500} placeholder="Ex.: Quero avisar que amanhã teremos brownie de Ninho com Nutella e encomendas até as 18h." value={prompt} onChange={e=>setPrompt(e.target.value)}/></label>
    <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]"><label className="field-label">Formato<select className="nat-input mt-1" value={format} onChange={e=>{setFormat(e.target.value as FormatKey);setGenerated(false);setAiCopy(null);}}>{Object.entries(formats).map(([key,value])=><option key={key} value={key}>{value.label}</option>)}</select></label>
      <button type="button" className="secondary-button self-end justify-center" onClick={generateTemplate}><ImageIcon size={18}/> Modelo NAT</button>
      <button type="button" className="primary-button self-end justify-center" onClick={()=>void generateWithAi()} disabled={!AI_ENABLED||!aiConnected||aiBusy||!prompt.trim()}>{aiBusy?<LoaderCircle className="animate-spin" size={18}/>:<Sparkles size={18}/>} {AI_ENABLED?"Gerar com IA":"IA desativada"}</button>
    </div>

    {!AI_ENABLED?<p className="mt-3 rounded-xl bg-soft p-3 text-xs leading-5 text-caramel">A IA está desativada por enquanto para não gerar custos de API. O recurso foi preservado e poderá ser reativado no futuro. O <strong>Modelo NAT</strong> continua funcionando normalmente sem custo de IA.</p>:aiConnected===false&&<p className="mt-3 text-xs leading-5 text-caramel">O modelo visual continua funcionando sem IA. Para receber chamada, legenda e CTA sugeridos automaticamente, conecte uma chave da API.</p>}
    {message&&<p className="mt-3 rounded-xl bg-rose-soft p-3 text-sm text-caramel" role="status">{message}</p>}

    <div className="mt-5 overflow-hidden rounded-[24px] border border-nat bg-white"><canvas ref={canvasRef} className={`block h-auto w-full ${generated?"":"hidden"}`} />{!generated&&<div className="grid min-h-64 place-items-center p-8 text-center text-sm text-caramel">A prévia da arte aparece aqui.</div>}</div>
    <button type="button" className="secondary-button mt-4 w-full justify-center" disabled={!generated} onClick={download}><Download size={18}/> Baixar PNG</button>

    {aiCopy&&<div className="mt-5 grid gap-3 lg:grid-cols-[1fr_.7fr]"><div className="rounded-2xl bg-soft p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-bold">Legenda sugerida</p><button type="button" className="icon-button" aria-label="Copiar legenda" onClick={()=>void copyCaption()}><Copy size={16}/></button></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-caramel">{aiCopy.caption}</p></div><div className="rounded-2xl bg-rose-soft p-4"><p className="text-sm font-bold">Direção visual sugerida</p><p className="mt-2 text-sm leading-6 text-caramel">{aiCopy.visual_direction}</p><p className="mt-3 text-xs text-caramel">A direção visual é uma sugestão criativa; nesta etapa a foto não é gerada automaticamente.</p></div></div>}
  </div>;
}

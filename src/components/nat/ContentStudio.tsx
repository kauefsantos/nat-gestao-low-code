import { Download, Image as ImageIcon, Sparkles } from "lucide-react";
import { useMemo, useRef, useState } from "react";

type FormatKey="feed"|"story"|"square";
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
  const [prompt,setPrompt]=useState(""); const [format,setFormat]=useState<FormatKey>("feed"); const [generated,setGenerated]=useState(false); const canvasRef=useRef<HTMLCanvasElement|null>(null);
  const selected=useMemo(()=>formats[format],[format]);
  function render(){
    const canvas=canvasRef.current;if(!canvas)return;canvas.width=selected.width;canvas.height=selected.height;const ctx=canvas.getContext("2d");if(!ctx)return;
    const w=canvas.width,h=canvas.height;ctx.fillStyle="#F8EEE9";ctx.fillRect(0,0,w,h);
    ctx.fillStyle="#EAAC93";ctx.beginPath();ctx.ellipse(w*.1,h*.1,w*.26,h*.13,-.4,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=.55;ctx.beginPath();ctx.ellipse(w*.92,h*.88,w*.32,h*.18,-.5,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    ctx.fillStyle="#35150A";ctx.beginPath();ctx.arc(w/2,h*.2,Math.min(w,h)*.115,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="#F8EEE9";ctx.lineWidth=4;ctx.beginPath();ctx.arc(w/2,h*.2,Math.min(w,h)*.103,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle="#F8EEE9";ctx.textAlign="center";ctx.font=`${Math.round(w*.12)}px Georgia, serif`;ctx.fillText("NAT",w/2,h*.215);
    ctx.font=`700 ${Math.round(w*.022)}px Arial, sans-serif`;ctx.fillText("BROWNIES E BRIGADEIROS GOURMET",w/2,h*.255);
    ctx.fillStyle="#35150A";ctx.font=`${Math.round(w*.075)}px Georgia, serif`;const title=headlineFromPrompt(prompt);const lines=wrapText(ctx,title,w*.72).slice(0,4);const start=h*.46-(lines.length-1)*w*.045;lines.forEach((line,index)=>ctx.fillText(line,w/2,start+index*w*.095));
    ctx.strokeStyle="#EAAC93";ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(w*.28,h*.72);ctx.quadraticCurveTo(w*.5,h*.67,w*.72,h*.72);ctx.stroke();
    ctx.fillStyle="#956454";ctx.font=`600 ${Math.round(w*.026)}px Arial, sans-serif`;ctx.fillText("Mais que doces: bons momentos em cada mordida.",w/2,h*.79);
    ctx.font=`700 ${Math.round(w*.024)}px Arial, sans-serif`;ctx.fillText("@natgourmet.doces",w/2,h*.88);
    setGenerated(true);
  }
  function download(){const canvas=canvasRef.current;if(!canvas||!generated)return;const link=document.createElement("a");link.download=`nat-${format}-${new Date().toISOString().slice(0,10)}.png`;link.href=canvas.toDataURL("image/png");link.click();}
  return <div className="nat-card"><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rose-soft"><Sparkles size={19}/></div><div><p className="eyebrow">Criar conteúdo</p><h2 className="font-display text-3xl">Conte o que você quer postar</h2><p className="mt-1 text-sm leading-6 text-caramel">Nesta primeira etapa o NAT monta um rascunho visual seguindo a identidade da marca. A camada de IA generativa será conectada pelo backend, sem expor chave no iPhone.</p></div></div><label className="field-label mt-5">O que você quer comunicar?<textarea className="nat-input mt-1 min-h-28 resize-y" placeholder="Ex.: Quero avisar que amanhã teremos brownie de Ninho com Nutella e encomendas até as 18h." value={prompt} onChange={e=>setPrompt(e.target.value)}/></label><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]"><label className="field-label">Formato<select className="nat-input mt-1" value={format} onChange={e=>{setFormat(e.target.value as FormatKey);setGenerated(false);}}>{Object.entries(formats).map(([key,value])=><option key={key} value={key}>{value.label}</option>)}</select></label><button type="button" className="primary-button self-end justify-center" onClick={render}><ImageIcon size={18}/> Gerar rascunho</button></div><div className="mt-5 overflow-hidden rounded-[24px] border border-nat bg-white"><canvas ref={canvasRef} className={`block h-auto w-full ${generated?"":"hidden"}`} />{!generated&&<div className="grid min-h-64 place-items-center p-8 text-center text-sm text-caramel">A prévia da arte aparece aqui.</div>}</div><button type="button" className="secondary-button mt-4 w-full justify-center" disabled={!generated} onClick={download}><Download size={18}/> Baixar PNG</button></div>;
}

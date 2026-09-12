import { CalendarDays, Calculator, Package, ReceiptText, Search, ShoppingBasket, Users, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { NatState } from "@/domain/nat";
import type { NatView } from "./AppShell";
import { useDialogA11y } from "@/hooks/use-dialog-a11y";

type Result={key:string;label:string;hint:string;view:NatView;icon:React.ReactNode};

function normalize(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR");}

export function GlobalSearchSheet({state,onClose,onView,onSale,onSupply}:{state:NatState;onClose:()=>void;onView:(view:NatView)=>void;onSale:()=>void;onSupply:()=>void}){
  const [query,setQuery]=useState("");
  const searchInputRef=useRef<HTMLInputElement>(null);
  const panelRef=useDialogA11y<HTMLDivElement>({onClose,initialFocusRef:searchInputRef});
  const results=useMemo(()=>{
    const q=normalize(query.trim()); if(q.length<2)return [] as Result[];
    const list:Result[]=[];
    for(const customer of state.customers??[])if(normalize(customer.name).includes(q))list.push({key:`customer-${customer.id}`,label:customer.name,hint:"Cliente",view:"customers",icon:<Users size={17}/>});
    for(const product of state.products)if(normalize(product.name).includes(q))list.push({key:`product-${product.id}`,label:product.name,hint:"Produto / receita",view:"products",icon:<Package size={17}/>});
    for(const supply of state.supplies)if(normalize(supply.name).includes(q))list.push({key:`supply-${supply.id}`,label:supply.name,hint:"Compra / material",view:"products",icon:<ShoppingBasket size={17}/>});
    for(const sale of state.sales.slice(0,80)){const text=sale.items.map((item)=>item.productName).join(" ");if(normalize(text).includes(q))list.push({key:`sale-${sale.id}`,label:text||"Movimento",hint:"Venda ou saída",view:"sales",icon:<ReceiptText size={17}/>});}
    return list.slice(0,16);
  },[query,state]);
  const go=(view:NatView)=>{onClose();onView(view);};
  const resultMessage=query.trim().length<2?"Digite pelo menos 2 letras para buscar.":results.length===0?"Nenhum resultado encontrado.":`${results.length} ${results.length===1?"resultado encontrado":"resultados encontrados"}.`;
  return <div className="fixed inset-0 z-[65] flex items-start justify-center bg-[#35150A]/35 pb-[max(12px,env(safe-area-inset-bottom))] pl-[max(12px,env(safe-area-inset-left))] pr-[max(12px,env(safe-area-inset-right))] pt-[max(20px,env(safe-area-inset-top))] backdrop-blur-[2px] sm:p-8" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}><div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="global-search-title" className="max-h-[calc(100dvh-32px)] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-[28px] bg-[#FFF9F6] p-5 shadow-2xl sm:max-h-[calc(100dvh-64px)] sm:p-6"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="eyebrow">Atalho</p><h2 id="global-search-title" className="font-display text-3xl">Buscar na NAT</h2></div><button type="button" className="icon-button shrink-0" onClick={onClose} aria-label="Fechar busca"><X size={18}/></button></div><div className="relative mt-5"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-caramel" size={18} aria-hidden="true"/><input ref={searchInputRef} className="nat-input pl-11" value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Cliente, produto, ingrediente ou venda" aria-label="Buscar na NAT" aria-describedby="global-search-status" enterKeyHint="search"/></div><p id="global-search-status" role="status" aria-live="polite" className="sr-only">{resultMessage}</p>{query.trim().length<2?<div className="mt-5"><p className="text-base font-bold">Ações rápidas</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><button type="button" className="secondary-button justify-start" onClick={()=>{onClose();onSale();}}><ReceiptText size={17}/> Registrar venda ou saída</button><button type="button" className="secondary-button justify-start" onClick={()=>{onClose();onSupply();}}><ShoppingBasket size={17}/> Registrar compra</button><button type="button" className="secondary-button justify-start" onClick={()=>go("calendar")}><CalendarDays size={17}/> Abrir agenda</button><button type="button" className="secondary-button justify-start" onClick={()=>go("pricing")}><Calculator size={17}/> Conferir preços</button></div></div>:<div className="mt-4 max-h-[55vh] space-y-2 overflow-y-auto overscroll-contain">{results.map((result)=><button key={result.key} type="button" className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-[#956454] bg-white px-4 text-left" onClick={()=>go(result.view)}><span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-full bg-soft">{result.icon}</span><span className="min-w-0 flex-1"><strong className="block truncate">{result.label}</strong><span className="text-sm text-caramel">{result.hint}</span></span></button>)}{results.length===0&&<p className="rounded-2xl border border-dashed border-[#956454] p-6 text-center text-base text-caramel">Nada encontrado. Tente parte do nome ou use uma ação rápida.</p>}</div>}</div></div>;
}

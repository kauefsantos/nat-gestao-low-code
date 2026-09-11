import { ChevronRight, PauseCircle, PlayCircle, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { money, type NatState, type Product } from "@/domain/nat";
import { BRIGADEIRO_CATALOG, BROWNIE_CATALOG, PRODUCT_CATALOG, portfolioAnalytics, type CatalogItem } from "@/domain/catalog";

function PageHeading({ eyebrow,title,text,action }: { eyebrow:string; title:string; text:string; action?:ReactNode }) {
  return <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">{eyebrow}</p><h1 className="mt-2 font-display text-4xl sm:text-5xl">{title}</h1><p className="mt-2 max-w-2xl text-caramel">{text}</p></div>{action}</div>;
}

type AnalyticsEntry = ReturnType<typeof portfolioAnalytics>["month"][number];

function FamilySection({ title,items,state,monthMap,allMap,onConfigure,onEdit,onAvailability }: { title:string; items:CatalogItem[]; state:NatState; monthMap:Map<string,AnalyticsEntry>; allMap:Map<string,AnalyticsEntry>; onConfigure:(item:CatalogItem)=>void; onEdit:(product:Product)=>void; onAvailability:(product:Product,available:boolean)=>void }) {
  const monthQuantity=items.reduce((sum,item)=>sum+(monthMap.get(item.key)?.quantity??0),0);
  const allQuantity=items.reduce((sum,item)=>sum+(allMap.get(item.key)?.quantity??0),0);
  const configured=items.filter((item)=>state.products.some((product)=>product.portfolioKey===item.key)).length;
  const available=items.filter((item)=>state.products.some((product)=>product.portfolioKey===item.key&&product.available!==false)).length;

  return <section className="nat-card overflow-hidden p-0">
    <div className="grid gap-4 bg-chocolate p-5 text-white sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.18em] text-rose">Categoria</p>
        <h2 className="mt-1 font-display text-4xl">{title}</h2>
        <p className="mt-2 text-sm text-white/70">{configured}/{items.length} sabores configurados · {available} em produção</p>
      </div>
      <div className="grid grid-cols-2 gap-2 text-right sm:min-w-[230px]">
        <div className="rounded-2xl bg-white/10 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-white/65">Vendidos no mês</p><p className="mt-1 font-display text-3xl">{monthQuantity}</p></div>
        <div className="rounded-2xl bg-white/10 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-white/65">Vendidos no total</p><p className="mt-1 font-display text-3xl">{allQuantity}</p></div>
      </div>
    </div>

    <div className="divide-y divide-[#ead6cc]">
      {items.map((item)=>{
        const product=state.products.find((candidate)=>candidate.portfolioKey===item.key);
        const isAvailable=product?.available!==false;
        const month=monthMap.get(item.key)?.quantity??0;
        const total=allMap.get(item.key)?.quantity??0;
        return <div key={item.key} className={`grid gap-3 p-4 sm:grid-cols-[1fr_96px_96px_auto] sm:items-center sm:p-5 ${product&&!isAvailable?"bg-soft/60":""}`}>
          <div className="flex min-w-0 items-start gap-3">
            <span aria-hidden="true" className={`mt-2 h-2 w-2 shrink-0 rounded-full ${product&&!isAvailable?"bg-caramel/45":"bg-rose"}`}/>
            <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-caramel">Subcategoria</p><div className="mt-1 flex flex-wrap items-center gap-2"><h3 className="text-base font-bold sm:text-lg">{item.flavor}</h3>{product&&<span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${isAvailable?"bg-rose-soft text-chocolate":"bg-white text-caramel"}`}>{isAvailable?"Em produção":"Pausado"}</span>}</div><p className="mt-1 text-xs text-caramel">{!product?"Ainda não configurado":isAvailable?"Disponível para novas vendas":"Fora das novas vendas; receita, custos e histórico preservados"}</p></div>
          </div>
          <div className="flex items-baseline justify-between gap-2 rounded-xl bg-soft px-3 py-2 sm:block sm:text-right"><span className="text-xs text-caramel sm:block">No mês</span><strong className="text-lg">{month}</strong></div>
          <div className="flex items-baseline justify-between gap-2 rounded-xl bg-soft px-3 py-2 sm:block sm:text-right"><span className="text-xs text-caramel sm:block">Total</span><strong className="text-lg">{total}</strong></div>
          <div className="flex flex-wrap items-center gap-2 justify-self-start sm:justify-self-end">
            {product&&<button type="button" className="secondary-button" onClick={()=>onAvailability(product,!isAvailable)} aria-label={`${isAvailable?"Pausar":"Retomar"} ${item.flavor}`}>{isAvailable?<PauseCircle size={15}/>:<PlayCircle size={15}/>} {isAvailable?"Pausar":"Retomar"}</button>}
            <button type="button" className="text-button" onClick={()=>product?onEdit(product):onConfigure(item)}>{product?"Editar":"Configurar"}<ChevronRight size={15}/></button>
          </div>
        </div>;
      })}
    </div>
  </section>;
}

export function PortfolioHierarchyView({ state,onConfigure,onEdit,onAvailability,onPricing }: { state:NatState; onConfigure:(item:CatalogItem)=>void; onEdit:(product:Product)=>void; onAvailability:(product:Product,available:boolean)=>void; onPricing:()=>void }) {
  const analytics=portfolioAnalytics(state);
  const monthMap=new Map(analytics.month.map((entry)=>[entry.key,entry]));
  const allMap=new Map(analytics.allTime.map((entry)=>[entry.key,entry]));
  const top=analytics.month[0];
  const topItem=top?PRODUCT_CATALOG.find((item)=>item.key===top.key):null;

  return <section className="space-y-5">
    <PageHeading eyebrow="Categorias e sabores" title="Portfólio" text="Veja cada sabor, acompanhe as vendas e pause temporariamente o que não estiver em produção. Um sabor pausado continua aqui com receita, custos e histórico, mas não aparece em novas vendas." action={<button type="button" className="secondary-button" onClick={onPricing}><TrendingUp size={18}/> Ver preços</button>}/>

    {topItem&&<div className="rounded-[28px] bg-rose-soft p-5 sm:p-6"><p className="eyebrow">Destaque do mês</p><div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-display text-3xl sm:text-4xl">{topItem.name}</p><p className="mt-1 text-sm text-caramel">Sabor mais vendido no período atual</p></div><div className="text-left sm:text-right"><p className="font-display text-3xl">{top.quantity} un</p><p className="text-xs text-caramel">{money(top.revenue)} em vendas</p></div></div></div>}

    <FamilySection title="Brownies" items={BROWNIE_CATALOG} state={state} monthMap={monthMap} allMap={allMap} onConfigure={onConfigure} onEdit={onEdit} onAvailability={onAvailability}/>
    <FamilySection title="Brigadeiros" items={BRIGADEIRO_CATALOG} state={state} monthMap={monthMap} allMap={allMap} onConfigure={onConfigure} onEdit={onEdit} onAvailability={onAvailability}/>
  </section>;
}

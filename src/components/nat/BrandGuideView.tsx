import { Camera, ChevronDown, ChevronUp, Heart, Instagram, MessageCircle, PackageCheck, Palette, Shapes, Type } from "lucide-react";
import { useState, type ReactNode } from "react";

const colors=[
  {name:"Chocolate NAT",hex:"#35150A",use:"Base / premium"},
  {name:"Cacau",hex:"#55281B",use:"Profundidade"},
  {name:"Rosé confeitaria",hex:"#EAAC93",use:"Acento / afeto"},
  {name:"Rosé claro",hex:"#F2C5B5",use:"Suavidade"},
  {name:"Creme",hex:"#F8EEE9",use:"Respiro / fundo"},
  {name:"Caramelo",hex:"#956454",use:"Apoio / texto"},
];

type PanelProps={title:string;text:string;icon?:ReactNode;children:ReactNode;dark?:boolean;eyebrow?:string};
function CollapsiblePanel({title,text,icon,children,dark=false,eyebrow}:PanelProps){
  const[open,setOpen]=useState(false);
  return <section className={dark?"brand-guide-panel rounded-[28px] bg-chocolate p-6 text-white sm:p-8":"nat-card brand-guide-panel"}>
    <div className="brand-guide-panel-header">
      <div className="brand-guide-panel-lead">
        {icon&&<div className={`brand-guide-panel-icon ${dark?"bg-white/10":"bg-rose-soft"}`}>{icon}</div>}
        <div className="brand-guide-panel-copy">
          {eyebrow&&<p className={`text-xs font-bold uppercase tracking-[.18em] ${dark?"text-rose":"text-caramel"}`}>{eyebrow}</p>}
          <h2 className={`brand-guide-panel-title ${dark?"text-white":"text-chocolate"}`}>{title}</h2>
          <p className={`brand-guide-panel-description ${dark?"text-white/75":"text-caramel"}`}>{text}</p>
        </div>
      </div>
      <button type="button" className={`brand-guide-panel-toggle ${dark?"brand-guide-panel-toggle-dark":""}`} aria-expanded={open} onClick={()=>setOpen((value)=>!value)}>{open?<ChevronUp size={13}/>:<ChevronDown size={13}/>} {open?"Retrair":"Expandir"}</button>
    </div>
    {open&&<div className="brand-guide-panel-body mt-5">{children}</div>}
  </section>;
}

export function BrandGuideView(){
  return <section className="space-y-5">
    <div><p className="eyebrow">Manual rápido da marca</p><h1 className="mt-2 font-display text-4xl sm:text-5xl">Identidade visual</h1><p className="mt-2 max-w-3xl text-caramel">Consulta prática para manter posts, embalagens, fotos, cardápios e materiais da NAT coerentes com a identidade da marca.</p></div>

    <CollapsiblePanel dark eyebrow="Essência da NAT" title="Afetiva, elegante e artesanal" text="Feita para transformar doces em presentes, lembranças e momentos.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
        ["Afeto","O produto deve parecer feito para alguém."],
        ["Capricho","Textura, embalagem e mensagem fazem parte da experiência."],
        ["Gourmet acessível","Bonito e desejável, sem parecer distante."],
        ["Presenteável","Funciona para consumo próprio e também para presentear."],
      ].map(([itemTitle,itemText])=><div key={itemTitle} className="rounded-2xl bg-white/10 p-4"><p className="font-bold text-rose">{itemTitle}</p><p className="mt-2 text-sm leading-5 text-white/75">{itemText}</p></div>)}</div>
    </CollapsiblePanel>

    <CollapsiblePanel icon={<Palette size={19}/>} title="Paleta da marca" text="A base é chocolate, rosé e creme. Regra de equilíbrio: aproximadamente 60% tons claros, 30% chocolate e 10% rosé.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{colors.map((color)=><div key={color.hex} className="overflow-hidden rounded-2xl border border-nat"><div className="h-24" style={{backgroundColor:color.hex}}/><div className="p-4"><p className="font-bold">{color.name}</p><p className="mt-1 font-mono text-xs text-caramel">{color.hex}</p><p className="mt-2 text-xs text-caramel">{color.use}</p></div></div>)}</div>
    </CollapsiblePanel>

    <CollapsiblePanel icon={<Type size={19}/>} title="Tipografia" text="Elegância nos títulos e clareza no restante.">
      <div className="space-y-3"><div className="rounded-2xl bg-chocolate p-5 text-white"><p className="text-xs font-bold uppercase tracking-wider text-rose">GFS Didot</p><p className="mt-2 font-display text-3xl">Doce, elegante, inesquecível.</p><p className="mt-2 text-xs text-white/70">Títulos, chamadas, campanhas e frases afetivas.</p></div><div className="rounded-2xl bg-soft p-5"><p className="text-xs font-bold uppercase tracking-wider text-caramel">Lato</p><p className="mt-2 text-lg">Brownies artesanais • Brigadeiros gourmet</p><p className="mt-2 text-xs text-caramel">Textos, preços, informações, cardápio e digital.</p></div></div>
    </CollapsiblePanel>

    <CollapsiblePanel icon={<Shapes size={19}/>} title="Linguagem gráfica" text="Poucos elementos, bastante espaço vazio e repetição consistente.">
      <div className="grid grid-cols-2 gap-3">{[["Aro duplo","Remete ao selo do logo."],["Corações","Sinais pequenos de afeto; usar com moderação."],["Traços / sprinkles","Movimento artesanal inspirado no brigadeiro."],["Curvas","Sensação de laço, cuidado e delicadeza."]].map(([itemTitle,itemText])=><div key={itemTitle} className="rounded-2xl bg-soft p-4"><p className="font-bold">{itemTitle}</p><p className="mt-1 text-xs leading-5 text-caramel">{itemText}</p></div>)}</div><p className="mt-4 rounded-xl bg-rose-soft p-3 text-sm text-caramel"><strong className="text-chocolate">Regra:</strong> usar apenas 1 ou 2 elementos gráficos por peça. A delicadeza vem do respiro, não do excesso.</p>
    </CollapsiblePanel>

    <CollapsiblePanel icon={<Camera size={19}/>} title="Direção de fotografia" text="A foto precisa dar vontade de provar e vender a experiência, não só mostrar o produto.">
      <div className="grid gap-3 md:grid-cols-3">{[["Macro / textura","Aproximar casquinha, recheio, ganache e granulado. Fundo escuro ou creme."],["Presente / contexto","Caixa aberta, laço, bilhete e mão entregando. A marca aparece sem dominar a cena."],["Momento / afeto","Café, encontro, aniversário ou mesa posta. Priorizar luz quente e natural."]].map(([itemTitle,itemText])=><div key={itemTitle} className="rounded-2xl border border-nat p-4"><p className="font-display text-2xl">{itemTitle}</p><p className="mt-2 text-sm leading-6 text-caramel">{itemText}</p></div>)}</div>
    </CollapsiblePanel>

    <CollapsiblePanel icon={<PackageCheck size={19}/>} title="Embalagens" text="Começar pequeno e manter unidade visual antes de ampliar o número de formatos.">
      <div className="space-y-2">{["Adesivo redondo para fechar papel, saco e caixa","Cinta para brownie","Cartão de agradecimento com Instagram e WhatsApp","Caixa chocolate + fita rosé para a linha presenteável"].map((item,index)=><div key={item} className="flex gap-3 rounded-xl bg-soft p-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-rose-soft text-xs font-black">{index+1}</span><p className="text-sm leading-6">{item}</p></div>)}</div>
    </CollapsiblePanel>

    <CollapsiblePanel icon={<Instagram size={19}/>} title="Redes sociais" text="O feed deve alternar produto, afeto, bastidores e venda para não virar um catálogo repetitivo.">
      <div className="space-y-3">{[[40,"Produto","textura, corte, recheio e novidade"],[25,"Afeto","frases, ocasiões e presentes"],[20,"Bastidores","preparo, embalagem e rotina"],[15,"Venda","cardápio, prazo e chamada para pedido"]].map(([value,itemTitle,itemText])=><div key={String(itemTitle)}><div className="flex items-center justify-between text-sm"><strong>{itemTitle}</strong><span className="font-bold text-caramel">{value}%</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-soft"><div className="h-full rounded-full bg-rose" style={{width:`${value}%`}}/></div><p className="mt-1 text-xs text-caramel">{itemText}</p></div>)}</div><p className="mt-4 text-xs leading-5 text-caramel">Repetir paleta e tipografia, mas variar a composição para a marca parecer viva, não um template engessado.</p>
    </CollapsiblePanel>

    <CollapsiblePanel icon={<MessageCircle size={19}/>} title="Tom de voz" text="Carinho sem excesso de fofura: próxima e afetiva, preservando acabamento gourmet.">
      <div className="grid gap-4 md:grid-cols-2"><div className="rounded-2xl bg-rose-soft p-5"><p className="font-bold">A marca é</p><div className="mt-3 flex flex-wrap gap-2">{["Acolhedora","Caprichosa","Delicada","Desejável","Direta na venda"].map((item)=><span key={item} className="rounded-full bg-white px-3 py-2 text-xs font-bold">{item}</span>)}</div></div><div className="rounded-2xl bg-soft p-5"><p className="font-bold">A marca evita</p><div className="mt-3 flex flex-wrap gap-2">{["Excesso de diminutivos","Muitas exclamações","Texto genérico de gourmet","Promoção o tempo todo","Visual infantil"].map((item)=><span key={item} className="rounded-full bg-white px-3 py-2 text-xs font-bold text-caramel">{item}</span>)}</div></div></div><div className="mt-4 flex flex-wrap gap-2">{["momento","mordida","afeto","presente","feito à mão"].map((word)=><span key={word} className="inline-flex items-center gap-1 rounded-full border border-nat px-3 py-2 text-xs font-bold"><Heart size={12}/>{word}</span>)}</div>
    </CollapsiblePanel>

    <CollapsiblePanel eyebrow="Evolução da identidade" title="O que priorizar" text="Uma referência rápida para decidir o que desenvolver primeiro.">
      <div className="grid gap-3 md:grid-cols-3">{[["1 · Essencial","Logo vetorizado e versões, paleta, tipografia, adesivo redondo, cinta de brownie, cartão e templates para Instagram."],["2 · Presenteável","Caixa própria, papel seda ou lacre, tag de presente, cardápio impresso e materiais de datas comemorativas."],["3 · Expansão","Uniforme ou avental, expositor de feira, sacola personalizada, página de pedidos e linha corporativa."]].map(([itemTitle,itemText])=><div key={itemTitle} className="rounded-2xl border border-nat p-4"><p className="font-display text-2xl">{itemTitle}</p><p className="mt-2 text-sm leading-6 text-caramel">{itemText}</p></div>)}</div>
    </CollapsiblePanel>
  </section>;
}

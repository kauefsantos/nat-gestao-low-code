import { Calculator, Home, LogOut, Package, Plus, ReceiptText, Settings as SettingsIcon } from "lucide-react";
import type { ReactNode } from "react";

export type NatView = "home" | "sales" | "products" | "pricing";

type Props = {
  view: NatView;
  onView: (view: NatView) => void;
  onSale: () => void;
  onSettings: () => void;
  onLogout: () => void;
  children: ReactNode;
};

export function Brand() {
  return <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-full border-2 border-chocolate p-1"><div className="grid h-full w-full place-items-center rounded-full border border-chocolate font-display text-lg">NAT</div></div><div><div className="font-display text-xl leading-none">NAT Gestão</div><div className="mt-1 text-[10px] font-bold uppercase tracking-[0.22em] text-caramel">Brownies • Brigadeiros</div></div></div>;
}

function SideButton({ icon,label,active,onClick }: { icon: ReactNode; label: string; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`side-button ${active ? "active" : ""}`}>{icon}<span>{label}</span></button>;
}

function MobileNav({ view,onView,onSale }: { view: NatView; onView: (view: NatView) => void; onSale: () => void }) {
  const items: { view: NatView; label: string; icon: ReactNode }[] = [
    { view:"home",label:"Início",icon:<Home size={18}/> },
    { view:"sales",label:"Vendas",icon:<ReceiptText size={18}/> },
    { view:"products",label:"Produtos",icon:<Package size={18}/> },
    { view:"pricing",label:"Precificar",icon:<Calculator size={18}/> },
  ];
  return <nav aria-label="Navegação principal" className="app-safe-nav fixed inset-x-0 bottom-0 z-30 border-t border-nat bg-white/95 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden"><div className="mx-auto flex max-w-md items-end justify-around">{items.map((item,index) => index === 2 ? <div key={item.view} className="flex items-end gap-1"><button type="button" className={`mobile-nav-button ${view===item.view?"active":""}`} aria-current={view===item.view?"page":undefined} onClick={() => onView(item.view)}>{item.icon}<span>{item.label}</span></button><button type="button" className="mb-1 grid h-12 w-12 place-items-center rounded-full bg-chocolate text-white shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chocolate" onClick={onSale} aria-label="Registrar nova venda"><Plus size={22}/></button></div> : <button type="button" key={item.view} className={`mobile-nav-button ${view===item.view?"active":""}`} aria-current={view===item.view?"page":undefined} onClick={() => onView(item.view)}>{item.icon}<span>{item.label}</span></button>)}</div></nav>;
}

export function AppShell({ view,onView,onSale,onSettings,onLogout,children }: Props) {
  return <div className="min-h-screen bg-cream text-chocolate"><header className="app-safe-top sticky top-0 z-30 border-b border-nat bg-cream/95 backdrop-blur"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6"><Brand/><div className="flex items-center gap-2"><button type="button" className="icon-button" onClick={onSettings} aria-label="Configurações"><SettingsIcon size={20}/></button><button type="button" className="icon-button" onClick={onLogout} aria-label="Sair"><LogOut size={19}/></button></div></div></header><div className="mx-auto flex max-w-6xl gap-8 px-4 pb-28 pt-6 sm:px-6 lg:pb-12"><aside className="hidden w-52 shrink-0 lg:block"><nav aria-label="Navegação principal" className="sticky top-24 space-y-1"><SideButton icon={<Home size={18}/>} label="Início" active={view==="home"} onClick={() => onView("home")}/><SideButton icon={<ReceiptText size={18}/>} label="Vendas" active={view==="sales"} onClick={() => onView("sales")}/><SideButton icon={<Package size={18}/>} label="Produtos" active={view==="products"} onClick={() => onView("products")}/><SideButton icon={<Calculator size={18}/>} label="Precificar" active={view==="pricing"} onClick={() => onView("pricing")}/></nav></aside><main className="min-w-0 flex-1">{children}</main></div><MobileNav view={view} onView={onView} onSale={onSale}/></div>;
}

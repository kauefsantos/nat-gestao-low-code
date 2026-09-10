import { Calculator, Home, LayoutGrid, LogOut, Package, Plus, ReceiptText, Settings as SettingsIcon } from "lucide-react";
import type { ReactNode } from "react";

export type NatView = "home" | "sales" | "portfolio" | "products" | "pricing";

type Props = {
  view: NatView;
  onView: (view: NatView) => void;
  onSale: () => void;
  onSettings: () => void;
  onLogout: () => void;
  children: ReactNode;
};

export function Brand() {
  return <div className="flex min-w-0 items-center gap-3"><div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-chocolate"><div aria-hidden="true" className="absolute inset-[4px] rounded-full border border-chocolate"/><span className="relative z-10 font-display text-[18px] leading-none">NAT</span></div><div className="min-w-0"><div className="truncate font-display text-xl leading-none">NAT Gestão</div><div className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.18em] text-caramel">Brownies • Brigadeiros</div></div></div>;
}

function SideButton({ icon,label,active,onClick }: { icon: ReactNode; label: string; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`side-button ${active ? "active" : ""}`}>{icon}<span>{label}</span></button>;
}

const navItems: { view: NatView; label: string; icon: ReactNode }[] = [
  { view:"home",label:"Início",icon:<Home size={18}/> },
  { view:"sales",label:"Vendas",icon:<ReceiptText size={18}/> },
  { view:"portfolio",label:"Portfólio",icon:<LayoutGrid size={18}/> },
  { view:"products",label:"Produtos",icon:<Package size={18}/> },
  { view:"pricing",label:"Preços",icon:<Calculator size={18}/> },
];

function MobileNav({ view,onView,onSale }: { view: NatView; onView: (view: NatView) => void; onSale: () => void }) {
  return <><nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-30 border-t border-nat bg-white/95 px-[max(8px,env(safe-area-inset-left))] pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden"><div className="mx-auto grid max-w-lg grid-cols-5 items-end">{navItems.map((item)=><button type="button" key={item.view} className={`mobile-nav-button min-w-0 ${view===item.view?"active":""}`} aria-current={view===item.view?"page":undefined} onClick={() => onView(item.view)}>{item.icon}<span className="max-w-full truncate">{item.label}</span></button>)}</div></nav><button type="button" className="fixed right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-chocolate text-white shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chocolate lg:hidden" style={{bottom:"calc(env(safe-area-inset-bottom) + 72px)"}} onClick={onSale} aria-label="Registrar nova venda"><Plus size={22}/></button></>;
}

export function AppShell({ view,onView,onSale,onSettings,onLogout,children }: Props) {
  return <div className="min-h-screen bg-cream text-chocolate"><header className="sticky top-0 z-30 border-b border-nat bg-cream/95 backdrop-blur"><div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-[max(16px,env(safe-area-inset-left))] py-3 pr-[max(16px,env(safe-area-inset-right))] sm:px-6"><Brand/><div className="flex shrink-0 items-center gap-1"><button type="button" className="icon-button" onClick={onSettings} aria-label="Configurações"><SettingsIcon size={20}/></button><button type="button" className="icon-button" onClick={onLogout} aria-label="Sair"><LogOut size={19}/></button></div></div></header><div className="mx-auto flex max-w-6xl gap-8 px-[max(16px,env(safe-area-inset-left))] pb-28 pt-6 pr-[max(16px,env(safe-area-inset-right))] sm:px-6 lg:pb-12"><aside className="hidden w-52 shrink-0 lg:block"><nav aria-label="Navegação principal" className="sticky top-24 space-y-1">{navItems.map((item)=><SideButton key={item.view} icon={item.icon} label={item.label} active={view===item.view} onClick={() => onView(item.view)}/>)}</nav></aside><main className="min-w-0 flex-1">{children}</main></div><MobileNav view={view} onView={onView} onSale={onSale}/></div>;
}

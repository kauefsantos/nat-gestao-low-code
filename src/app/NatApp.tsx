import { useMemo, useState } from "react";
import {
  Calculator,
  ChevronRight,
  CircleDollarSign,
  Home,
  LogOut,
  Package,
  Plus,
  ReceiptText,
  Settings as SettingsIcon,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNatStore } from "@/hooks/use-nat-store";
import {
  buildSale,
  compatibleUnits,
  dashboardNumbers,
  id,
  money,
  paymentLabel,
  percent,
  preferredUsageUnit,
  productCost,
  supplyUnitCost,
  type NatState,
  type PaymentMethod,
  type Product,
  type RecipeItem,
  type Settings,
  type Supply,
  type SupplyCategory,
  type Unit,
  unitLabel,
} from "@/domain/nat";

type View = "home" | "sales" | "products" | "pricing";
type ProductTab = "products" | "supplies";

type Sheet =
  | { type: "sale" }
  | { type: "supply"; value?: Supply }
  | { type: "product"; value?: Product }
  | { type: "settings" }
  | null;

const inputClass = "nat-input";

export function NatApp() {
  const { state, update, reset, ready } = useNatStore();
  const [view, setView] = useState<View>("home");
  const [productTab, setProductTab] = useState<ProductTab>("products");
  const [sheet, setSheet] = useState<Sheet>(null);

  const numbers = useMemo(() => dashboardNumbers(state), [state]);

  if (!ready) {
    return <div className="min-h-screen grid place-items-center"><Brand /></div>;
  }

  const openProducts = (tab: ProductTab) => {
    setProductTab(tab);
    setView("products");
  };

  return (
    <div className="min-h-screen bg-cream text-chocolate">
      <header className="sticky top-0 z-30 border-b border-nat bg-cream/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Brand />
          <div className="flex items-center gap-2">
            <button className="icon-button" onClick={() => setSheet({ type: "settings" })} aria-label="Configurações">
              <SettingsIcon size={20} />
            </button>
            <button className="icon-button hidden sm:grid" onClick={() => void supabase.auth.signOut().then(() => { window.location.href = "/"; })} aria-label="Sair">
              <LogOut size={19} />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-8 px-4 pb-28 pt-6 sm:px-6 lg:pb-12">
        <aside className="hidden w-52 shrink-0 lg:block">
          <nav className="sticky top-24 space-y-1">
            <SideButton icon={<Home size={18} />} label="Início" active={view === "home"} onClick={() => setView("home")} />
            <SideButton icon={<ReceiptText size={18} />} label="Vendas" active={view === "sales"} onClick={() => setView("sales")} />
            <SideButton icon={<Package size={18} />} label="Produtos" active={view === "products"} onClick={() => setView("products")} />
            <SideButton icon={<Calculator size={18} />} label="Precificar" active={view === "pricing"} onClick={() => setView("pricing")} />
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          {view === "home" && (
            <HomePage
              state={state}
              numbers={numbers}
              onSale={() => setSheet({ type: "sale" })}
              onSupplies={() => openProducts("supplies")}
              onProducts={() => openProducts("products")}
              onPricing={() => setView("pricing")}
            />
          )}
          {view === "sales" && (
            <SalesPage
              state={state}
              onNew={() => setSheet({ type: "sale" })}
              onDelete={(saleId) => update((current) => ({ ...current, sales: current.sales.filter((sale) => sale.id !== saleId) }))}
            />
          )}
          {view === "products" && (
            <ProductsPage
              state={state}
              tab={productTab}
              onTab={setProductTab}
              onNewSupply={() => setSheet({ type: "supply" })}
              onEditSupply={(value) => setSheet({ type: "supply", value })}
              onDeleteSupply={(supplyId) => {
                const used = state.products.some((product) => product.recipe.some((item) => item.supplyId === supplyId));
                if (used) {
                  window.alert("Esse item está em uma receita. Retire-o do produto antes de excluir.");
                  return;
                }
                update((current) => ({ ...current, supplies: current.supplies.filter((supply) => supply.id !== supplyId) }));
              }}
              onNewProduct={() => setSheet({ type: "product" })}
              onEditProduct={(value) => setSheet({ type: "product", value })}
              onDeleteProduct={(productId) => update((current) => ({ ...current, products: current.products.filter((product) => product.id !== productId) }))}
            />
          )}
          {view === "pricing" && <PricingPage state={state} onProducts={() => openProducts("products")} />}
        </main>
      </div>

      <MobileNav view={view} onView={setView} onSale={() => setSheet({ type: "sale" })} />

      {sheet?.type === "sale" && <SaleSheet state={state} onClose={() => setSheet(null)} onSave={(sale) => { update((current) => ({ ...current, sales: [sale, ...current.sales] })); setSheet(null); }} />}
      {sheet?.type === "supply" && <SupplySheet value={sheet.value} onClose={() => setSheet(null)} onSave={(supply) => { update((current) => ({ ...current, supplies: current.supplies.some((item) => item.id === supply.id) ? current.supplies.map((item) => item.id === supply.id ? supply : item) : [...current.supplies, supply] })); setSheet(null); }} />}
      {sheet?.type === "product" && <ProductSheet state={state} value={sheet.value} onClose={() => setSheet(null)} onSave={(product) => { update((current) => ({ ...current, products: current.products.some((item) => item.id === product.id) ? current.products.map((item) => item.id === product.id ? product : item) : [...current.products, product] })); setSheet(null); }} />}
      {sheet?.type === "settings" && <SettingsSheet value={state.settings} onClose={() => setSheet(null)} onSave={(settings) => { update((current) => ({ ...current, settings })); setSheet(null); }} onReset={() => { if (window.confirm("Apagar todos os dados da NAT neste aparelho?")) { reset(); setSheet(null); } }} />}
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-11 w-11 place-items-center rounded-full border-2 border-chocolate p-1">
        <div className="grid h-full w-full place-items-center rounded-full border border-chocolate font-display text-lg">NAT</div>
      </div>
      <div>
        <div className="font-display text-xl leading-none">NAT Gestão</div>
        <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.22em] text-caramel">Brownies • Brigadeiros</div>
      </div>
    </div>
  );
}

function SideButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={`side-button ${active ? "active" : ""}`}>{icon}<span>{label}</span></button>;
}

function MobileNav({ view, onView, onSale }: { view: View; onView: (view: View) => void; onSale: () => void }) {
  const items: { view: View; label: string; icon: React.ReactNode }[] = [
    { view: "home", label: "Início", icon: <Home size={18} /> },
    { view: "sales", label: "Vendas", icon: <ReceiptText size={18} /> },
    { view: "products", label: "Produtos", icon: <Package size={18} /> },
    { view: "pricing", label: "Precificar", icon: <Calculator size={18} /> },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-nat bg-white/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-md items-end justify-around">
        {items.map((item, index) => index === 2 ? (
          <div key={item.view} className="flex items-end gap-1">
            <button className={`mobile-nav-button ${view === item.view ? "active" : ""}`} onClick={() => onView(item.view)}>{item.icon}<span>{item.label}</span></button>
            <button className="mb-1 grid h-12 w-12 place-items-center rounded-full bg-chocolate text-white shadow-lg" onClick={onSale} aria-label="Nova venda"><Plus size={22} /></button>
          </div>
        ) : (
          <button key={item.view} className={`mobile-nav-button ${view === item.view ? "active" : ""}`} onClick={() => onView(item.view)}>{item.icon}<span>{item.label}</span></button>
        ))}
      </div>
    </nav>
  );
}

function HomePage({ state, numbers, onSale, onSupplies, onProducts, onPricing }: { state: NatState; numbers: ReturnType<typeof dashboardNumbers>; onSale: () => void; onSupplies: () => void; onProducts: () => void; onPricing: () => void }) {
  const firstSteps = [state.supplies.length > 0, state.products.length > 0, state.sales.length > 0];
  const completed = firstSteps.filter(Boolean).length;
  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Sua confeitaria, sem complicação</p>
          <h1 className="mt-2 font-display text-4xl sm:text-5xl">Olá, {state.settings.ownerName}.</h1>
          <p className="mt-2 max-w-xl text-caramel">Aqui você descobre quanto custa produzir, quanto cobrar e quanto realmente sobrou das vendas.</p>
        </div>
        <button className="primary-button" onClick={onSale}><Plus size={18} /> Registrar venda</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Vendeu neste mês" value={money(numbers.revenue)} hint={`${numbers.sales.length} vendas registradas`} />
        <Metric label="Produtos vendidos" value={String(numbers.units)} hint="unidades no mês" />
        <Metric label="Sobrou das vendas" value={money(numbers.contribution)} hint="antes dos custos fixos" />
        <Metric label="Resultado estimado" value={money(numbers.estimatedResult)} hint="já descontando custos fixos" tone={numbers.estimatedResult < 0 ? "attention" : "default"} />
      </div>

      {completed < 3 && (
        <div className="rounded-[28px] bg-chocolate p-6 text-white sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-rose">Primeiros passos</p><h2 className="mt-2 font-display text-3xl">Vamos montar a NAT juntas.</h2></div>
            <div className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold">{completed}/3</div>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <Step done={firstSteps[0]} number="1" title="Cadastre uma compra" text="Ex.: 12 ovos por R$ 12." onClick={onSupplies} />
            <Step done={firstSteps[1]} number="2" title="Monte um produto" text="Informe a receita e o rendimento." onClick={onProducts} />
            <Step done={firstSteps[2]} number="3" title="Registre uma venda" text="O lucro é calculado sozinho." onClick={onSale} />
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <div className="nat-card">
          <div className="flex items-center justify-between gap-4"><div><p className="eyebrow">Visão rápida</p><h2 className="section-title">Últimas vendas</h2></div><button className="text-button" onClick={onSale}>Registrar <ChevronRight size={16} /></button></div>
          <div className="mt-5 space-y-2">
            {state.sales.slice(0, 5).map((sale) => <div key={sale.id} className="flex items-center justify-between rounded-2xl bg-soft px-4 py-3"><div><p className="font-bold">{sale.productName}</p><p className="text-xs text-caramel">{sale.quantity} un • {paymentLabel[sale.paymentMethod]}</p></div><div className="text-right"><p className="font-bold">{money(sale.totalReceived)}</p><p className="text-xs text-caramel">sobrou {money(sale.contributionSnapshot)}</p></div></div>)}
            {state.sales.length === 0 && <Empty text="Sua primeira venda vai aparecer aqui." />}
          </div>
        </div>
        <div className="nat-card">
          <p className="eyebrow">Precificação</p><h2 className="section-title">Você sabe quanto cobrar?</h2>
          <p className="mt-3 text-sm leading-6 text-caramel">O sistema soma ingredientes, embalagem, produção e perdas para mostrar o custo por unidade e um preço saudável.</p>
          <button className="secondary-button mt-5 w-full" onClick={onPricing}><Calculator size={18} /> Abrir precificador</button>
          {numbers.topProduct && <div className="mt-4 rounded-2xl bg-rose-soft p-4"><p className="text-xs font-bold uppercase tracking-wider text-caramel">Mais vendido no mês</p><p className="mt-1 font-display text-2xl">{numbers.topProduct.name}</p><p className="text-sm text-caramel">{numbers.topProduct.quantity} unidades</p></div>}
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value, hint, tone = "default" }: { label: string; value: string; hint: string; tone?: "default" | "attention" }) {
  return <div className={`metric-card ${tone === "attention" ? "attention" : ""}`}><p className="text-xs font-bold uppercase tracking-wider text-caramel">{label}</p><p className="mt-3 font-display text-3xl">{value}</p><p className="mt-1 text-xs text-caramel">{hint}</p></div>;
}

function Step({ done, number, title, text, onClick }: { done: boolean; number: string; title: string; text: string; onClick: () => void }) {
  return <button onClick={onClick} className="rounded-2xl bg-white/8 p-4 text-left transition hover:bg-white/12"><div className={`grid h-8 w-8 place-items-center rounded-full text-sm font-black ${done ? "bg-rose text-chocolate" : "bg-white/10"}`}>{done ? "✓" : number}</div><p className="mt-3 font-bold">{title}</p><p className="mt-1 text-sm text-white/65">{text}</p></button>;
}

function SalesPage({ state, onNew, onDelete }: { state: NatState; onNew: () => void; onDelete: (saleId: string) => void }) {
  const numbers = dashboardNumbers(state);
  return <section><PageHeading eyebrow="Movimento" title="Vendas" text="Registre só o essencial. O custo e o resultado são calculados automaticamente." action={<button className="primary-button" onClick={onNew}><Plus size={18} /> Nova venda</button>} />
    <div className="mt-6 grid gap-3 sm:grid-cols-3"><Metric label="Faturamento do mês" value={money(numbers.revenue)} hint="valor recebido" /><Metric label="Unidades" value={String(numbers.units)} hint="produtos vendidos" /><Metric label="Sobrou das vendas" value={money(numbers.contribution)} hint="antes dos custos fixos" /></div>
    <div className="nat-card mt-5"><h2 className="section-title">Histórico</h2><div className="mt-4 space-y-2">{state.sales.map((sale) => <div key={sale.id} className="flex items-center gap-3 rounded-2xl border border-nat p-4"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rose-soft"><ShoppingBag size={18} /></div><div className="min-w-0 flex-1"><p className="truncate font-bold">{sale.productName}</p><p className="text-xs text-caramel">{new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(sale.soldAt))} • {sale.quantity} un • {paymentLabel[sale.paymentMethod]}</p></div><div className="text-right"><p className="font-bold">{money(sale.totalReceived)}</p><p className="text-xs text-caramel">+ {money(sale.contributionSnapshot)}</p></div><button className="icon-button" onClick={() => { if (window.confirm("Excluir esta venda?")) onDelete(sale.id); }} aria-label="Excluir venda"><Trash2 size={17} /></button></div>)}{state.sales.length === 0 && <Empty text="Nenhuma venda registrada ainda." />}</div></div>
  </section>;
}

function ProductsPage({ state, tab, onTab, onNewSupply, onEditSupply, onDeleteSupply, onNewProduct, onEditProduct, onDeleteProduct }: { state: NatState; tab: ProductTab; onTab: (tab: ProductTab) => void; onNewSupply: () => void; onEditSupply: (supply: Supply) => void; onDeleteSupply: (id: string) => void; onNewProduct: () => void; onEditProduct: (product: Product) => void; onDeleteProduct: (id: string) => void }) {
  return <section><PageHeading eyebrow="Base de custos" title="Produtos" text="Primeiro cadastre o que você compra. Depois monte cada receita usando esses itens." />
    <div className="mt-5 inline-flex rounded-2xl bg-white p-1 shadow-sm"><button className={`tab-button ${tab === "products" ? "active" : ""}`} onClick={() => onTab("products")}>Meus produtos</button><button className={`tab-button ${tab === "supplies" ? "active" : ""}`} onClick={() => onTab("supplies")}>Ingredientes e embalagens</button></div>
    {tab === "supplies" ? <SuppliesList supplies={state.supplies} onNew={onNewSupply} onEdit={onEditSupply} onDelete={onDeleteSupply} /> : <ProductList state={state} onNew={onNewProduct} onEdit={onEditProduct} onDelete={onDeleteProduct} />}
  </section>;
}

function SuppliesList({ supplies, onNew, onEdit, onDelete }: { supplies: Supply[]; onNew: () => void; onEdit: (supply: Supply) => void; onDelete: (id: string) => void }) {
  return <div className="mt-5 nat-card"><div className="flex items-center justify-between gap-4"><div><h2 className="section-title">O que você compra</h2><p className="mt-1 text-sm text-caramel">Cadastre o pacote inteiro. A NAT calcula quanto custa cada grama, ml ou unidade.</p></div><button className="primary-button shrink-0" onClick={onNew}><Plus size={18} /><span className="hidden sm:inline">Cadastrar</span></button></div><div className="mt-5 grid gap-3 md:grid-cols-2">{supplies.map((supply) => <button key={supply.id} onClick={() => onEdit(supply)} className="group rounded-2xl border border-nat p-4 text-left transition hover:border-rose"><div className="flex items-start justify-between gap-3"><div><span className="rounded-full bg-rose-soft px-2.5 py-1 text-[11px] font-bold text-caramel">{supply.category === "ingredient" ? "Ingrediente" : "Embalagem"}</span><p className="mt-3 text-lg font-bold">{supply.name}</p><p className="mt-1 text-sm text-caramel">{supply.packageQuantity} {unitLabel[supply.packageUnit]} por {money(supply.packagePrice)}</p></div><button className="icon-button opacity-0 group-hover:opacity-100" onClick={(event) => { event.stopPropagation(); if (window.confirm(`Excluir ${supply.name}?`)) onDelete(supply.id); }} aria-label="Excluir"><Trash2 size={16} /></button></div><p className="mt-4 border-t border-nat pt-3 text-sm"><span className="text-caramel">Custo base: </span><strong>{money(supplyUnitCost(supply))}</strong> / {unitLabel[preferredUsageUnit(supply.packageUnit)]}</p></button>)}{supplies.length === 0 && <div className="md:col-span-2"><Empty text="Cadastre a primeira compra. Ex.: caixa com 12 ovos por R$ 12,00." /></div>}</div></div>;
}

function ProductList({ state, onNew, onEdit, onDelete }: { state: NatState; onNew: () => void; onEdit: (product: Product) => void; onDelete: (id: string) => void }) {
  return <div className="mt-5 nat-card"><div className="flex items-center justify-between gap-4"><div><h2 className="section-title">O que você vende</h2><p className="mt-1 text-sm text-caramel">Cada produto guarda a receita, o rendimento e o preço atual.</p></div><button className="primary-button shrink-0" onClick={onNew}><Plus size={18} /><span className="hidden sm:inline">Novo produto</span></button></div><div className="mt-5 grid gap-3 md:grid-cols-2">{state.products.map((product) => { const metrics = productCost(product, state.supplies, state.settings.paymentFeePercent); return <button key={product.id} onClick={() => onEdit(product)} className="group rounded-2xl border border-nat p-4 text-left transition hover:border-rose"><div className="flex items-start justify-between gap-3"><div><p className="font-display text-2xl">{product.name}</p><p className="mt-1 text-sm text-caramel">Rende {product.batchYield} unidades</p></div><button className="icon-button opacity-0 group-hover:opacity-100" onClick={(event) => { event.stopPropagation(); if (window.confirm(`Excluir ${product.name}?`)) onDelete(product.id); }} aria-label="Excluir"><Trash2 size={16} /></button></div><div className="mt-4 grid grid-cols-3 gap-2"><Mini label="Custo" value={money(metrics.unitCost)} /><Mini label="Venda" value={money(product.sellingPrice)} /><Mini label="Margem" value={percent(metrics.marginAtCurrentPrice)} /></div></button>; })}{state.products.length === 0 && <div className="md:col-span-2"><Empty text={state.supplies.length === 0 ? "Antes de criar um produto, cadastre os ingredientes e embalagens." : "Crie seu primeiro produto e monte a receita."} /></div>}</div></div>;
}

function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-soft p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-caramel">{label}</p><p className="mt-1 font-bold">{value}</p></div>; }

function PricingPage({ state, onProducts }: { state: NatState; onProducts: () => void }) {
  const [selectedId, setSelectedId] = useState(state.products[0]?.id ?? "");
  const selected = state.products.find((product) => product.id === selectedId) ?? state.products[0];
  const [simulation, setSimulation] = useState<string>(selected ? String(selected.sellingPrice) : "0");

  if (!selected) return <section><PageHeading eyebrow="Preço saudável" title="Precificar" text="Monte um produto primeiro para descobrir o custo e o preço recomendado." /><div className="nat-card mt-6"><Empty text="Você ainda não tem produtos cadastrados." /><button className="primary-button mx-auto mt-4" onClick={onProducts}>Criar produto</button></div></section>;

  const metrics = productCost(selected, state.supplies, state.settings.paymentFeePercent);
  const simulatedPrice = Number(simulation.replace(",", ".")) || 0;
  const simulatedFee = simulatedPrice * state.settings.paymentFeePercent / 100;
  const simulatedProfit = simulatedPrice - metrics.unitCost - simulatedFee;
  const simulatedMargin = simulatedPrice > 0 ? simulatedProfit / simulatedPrice * 100 : 0;

  return <section><PageHeading eyebrow="Preço saudável" title="Precificar" text="Sem markup e sem conta de cabeça. Escolha o produto e veja quanto custa, quanto cobrar e quanto sobra." />
    <div className="mt-6 nat-card"><label className="field-label">Qual produto você quer analisar?</label><select className={inputClass} value={selected.id} onChange={(event) => { const product = state.products.find((item) => item.id === event.target.value); setSelectedId(event.target.value); if (product) setSimulation(String(product.sellingPrice)); }}>{state.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></div>
    <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
      <div className="nat-card"><p className="eyebrow">Quanto custa fazer</p><p className="mt-2 font-display text-4xl">{money(metrics.unitCost)} <span className="font-sans text-base text-caramel">por unidade</span></p><div className="mt-6 space-y-3"><CostRow label="Ingredientes" value={metrics.ingredientBatch} /><CostRow label="Embalagens" value={metrics.packagingBatch} /><CostRow label="Produção" value={metrics.productionBatch} /><CostRow label="Perdas" value={metrics.lossBatch} /><div className="border-t border-nat pt-3"><CostRow label={`Total do lote (${selected.batchYield} un)`} value={metrics.totalBatch} strong /></div></div></div>
      <div className="space-y-4"><div className="rounded-[28px] bg-chocolate p-6 text-white"><p className="text-xs font-bold uppercase tracking-[.18em] text-rose">Preço recomendado</p><p className="mt-2 font-display text-5xl">{money(metrics.recommendedPrice)}</p><p className="mt-2 text-sm text-white/65">Considera a margem-alvo de {percent(selected.targetMarginPercent)} e a taxa média cadastrada.</p><div className="mt-5 rounded-2xl bg-white/8 p-4"><p className="text-xs text-white/60">Preço mínimo saudável</p><p className="mt-1 text-xl font-bold">{money(metrics.minimumPrice)}</p></div></div><div className="nat-card"><p className="eyebrow">E se eu vender por...</p><div className="relative mt-3"><span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-caramel">R$</span><input className={`${inputClass} pl-12 text-lg font-bold`} inputMode="decimal" value={simulation} onChange={(event) => setSimulation(event.target.value)} /></div><div className="mt-4 grid grid-cols-2 gap-2"><Mini label="Sobra por un." value={money(simulatedProfit)} /><Mini label="Margem" value={percent(simulatedMargin)} /></div></div></div>
    </div>
  </section>;
}

function CostRow({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) { return <div className="flex items-center justify-between gap-3"><span className={strong ? "font-bold" : "text-caramel"}>{label}</span><span className={strong ? "font-bold" : ""}>{money(value)}</span></div>; }

function PageHeading({ eyebrow, title, text, action }: { eyebrow: string; title: string; text: string; action?: React.ReactNode }) {
  return <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">{eyebrow}</p><h1 className="mt-2 font-display text-4xl sm:text-5xl">{title}</h1><p className="mt-2 max-w-2xl text-caramel">{text}</p></div>{action}</div>;
}

function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-nat p-8 text-center text-sm text-caramel">{text}</div>; }

function SheetShell({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 flex justify-end bg-[#35150A]/35 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="h-full w-full max-w-xl overflow-y-auto bg-[#FFF9F6] p-5 shadow-2xl sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="eyebrow">NAT Gestão</p><h2 className="mt-2 font-display text-4xl">{title}</h2>{subtitle && <p className="mt-2 text-sm leading-6 text-caramel">{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></div><div className="mt-7">{children}</div></div></div>;
}

function SupplySheet({ value, onClose, onSave }: { value?: Supply; onClose: () => void; onSave: (supply: Supply) => void }) {
  const [name, setName] = useState(value?.name ?? "");
  const [category, setCategory] = useState<SupplyCategory>(value?.category ?? "ingredient");
  const [quantity, setQuantity] = useState(String(value?.packageQuantity ?? ""));
  const [unit, setUnit] = useState<Unit>(value?.packageUnit ?? "unit");
  const [price, setPrice] = useState(String(value?.packagePrice ?? ""));
  const [date, setDate] = useState(value?.purchasedAt.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const q = Number(quantity.replace(",", "."));
  const p = Number(price.replace(",", "."));
  const preview: Supply = { id: value?.id ?? "preview", name, category, packageQuantity: q, packageUnit: unit, packagePrice: p, purchasedAt: new Date(`${date}T12:00:00`).toISOString() };
  return <SheetShell title={value ? "Atualizar compra" : "Cadastrar compra"} subtitle="Informe como você comprou. O sistema transforma isso no custo da quantidade usada na receita." onClose={onClose}><form className="space-y-5" onSubmit={(event) => { event.preventDefault(); if (!name.trim() || q <= 0 || p < 0) return; onSave({ ...preview, id: value?.id ?? id("supply"), name: name.trim() }); }}><div><label className="field-label">O que você comprou?</label><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Ovos" required /></div><div><label className="field-label">É ingrediente ou embalagem?</label><div className="grid grid-cols-2 gap-2"><Choice active={category === "ingredient"} onClick={() => setCategory("ingredient")} label="Ingrediente" /><Choice active={category === "packaging"} onClick={() => setCategory("packaging")} label="Embalagem" /></div></div><div className="grid grid-cols-[1fr_120px] gap-3"><div><label className="field-label">Quanto veio?</label><input className={inputClass} inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="12" required /></div><div><label className="field-label">Unidade</label><select className={inputClass} value={unit} onChange={(e) => setUnit(e.target.value as Unit)}><option value="unit">un</option><option value="g">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="l">L</option></select></div></div><div><label className="field-label">Quanto você pagou?</label><div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-caramel">R$</span><input className={`${inputClass} pl-12`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="12,00" required /></div></div><div><label className="field-label">Data da compra</label><input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} /></div>{q > 0 && p >= 0 && <div className="rounded-2xl bg-rose-soft p-4"><p className="text-xs font-bold uppercase tracking-wider text-caramel">A NAT calculou</p><p className="mt-1 font-display text-2xl">Cada {unitLabel[preferredUsageUnit(unit)]} custa {money(supplyUnitCost(preview))}</p></div>}<button className="primary-button w-full" type="submit">Salvar compra</button></form></SheetShell>;
}

function Choice({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) { return <button type="button" className={`choice-button ${active ? "active" : ""}`} onClick={onClick}>{label}</button>; }

function ProductSheet({ state, value, onClose, onSave }: { state: NatState; value?: Product; onClose: () => void; onSave: (product: Product) => void }) {
  const [name, setName] = useState(value?.name ?? "");
  const [yieldValue, setYieldValue] = useState(String(value?.batchYield ?? ""));
  const [sellingPrice, setSellingPrice] = useState(String(value?.sellingPrice ?? ""));
  const [loss, setLoss] = useState(String(value?.lossPercent ?? 3));
  const [production, setProduction] = useState(String(value?.productionCostPerBatch ?? 0));
  const [minimumMargin, setMinimumMargin] = useState(String(value?.minimumMarginPercent ?? state.settings.defaultMinimumMarginPercent));
  const [targetMargin, setTargetMargin] = useState(String(value?.targetMarginPercent ?? state.settings.defaultTargetMarginPercent));
  const [recipe, setRecipe] = useState<RecipeItem[]>(value?.recipe ?? []);

  const draft: Product = { id: value?.id ?? "preview", name, batchYield: Number(yieldValue.replace(",", ".")) || 0, sellingPrice: Number(sellingPrice.replace(",", ".")) || 0, lossPercent: Number(loss.replace(",", ".")) || 0, productionCostPerBatch: Number(production.replace(",", ".")) || 0, minimumMarginPercent: Number(minimumMargin.replace(",", ".")) || 0, targetMarginPercent: Number(targetMargin.replace(",", ".")) || 0, recipe };
  const metrics = productCost(draft, state.supplies, state.settings.paymentFeePercent);

  const addRecipeItem = () => {
    const supply = state.supplies[0];
    if (!supply) return;
    setRecipe((current) => [...current, { id: id("recipe"), supplyId: supply.id, quantity: 0, unit: preferredUsageUnit(supply.packageUnit) }]);
  };

  return <SheetShell title={value ? "Editar produto" : "Novo produto"} subtitle="Monte a receita do jeito que você faz na cozinha. A NAT transforma tudo em custo por unidade." onClose={onClose}><form className="space-y-6" onSubmit={(event) => { event.preventDefault(); if (!name.trim() || draft.batchYield <= 0) return; onSave({ ...draft, id: value?.id ?? id("product"), name: name.trim() }); }}><div><label className="field-label">Nome do produto</label><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Brownie tradicional" required /></div><div className="grid grid-cols-2 gap-3"><div><label className="field-label">A receita rende quantas unidades?</label><input className={inputClass} inputMode="decimal" value={yieldValue} onChange={(e) => setYieldValue(e.target.value)} placeholder="12" required /></div><div><label className="field-label">Preço atual por unidade</label><input className={inputClass} inputMode="decimal" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} placeholder="7,00" /></div></div><div className="border-t border-nat pt-5"><div className="flex items-center justify-between gap-4"><div><p className="font-bold">O que entra nessa receita?</p><p className="text-sm text-caramel">Ingredientes e embalagens usados no lote inteiro.</p></div><button type="button" className="secondary-button" onClick={addRecipeItem} disabled={state.supplies.length === 0}><Plus size={17} /> Adicionar</button></div>{state.supplies.length === 0 && <div className="mt-4"><Empty text="Cadastre ingredientes e embalagens antes de montar a receita." /></div>}<div className="mt-4 space-y-3">{recipe.map((item) => { const supply = state.supplies.find((candidate) => candidate.id === item.supplyId); const allowed = supply ? compatibleUnits(supply.packageUnit) : ["unit" as Unit]; return <div key={item.id} className="rounded-2xl bg-soft p-3"><div className="grid grid-cols-[1fr_90px_86px_42px] gap-2"><select className={inputClass} value={item.supplyId} onChange={(e) => { const nextSupply = state.supplies.find((candidate) => candidate.id === e.target.value); setRecipe((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, supplyId: e.target.value, unit: nextSupply ? preferredUsageUnit(nextSupply.packageUnit) : candidate.unit } : candidate)); }}>{state.supplies.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select><input className={inputClass} inputMode="decimal" value={item.quantity || ""} onChange={(e) => setRecipe((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, quantity: Number(e.target.value.replace(",", ".")) || 0 } : candidate))} placeholder="Qtd." /><select className={inputClass} value={item.unit} onChange={(e) => setRecipe((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, unit: e.target.value as Unit } : candidate))}>{allowed.map((unit) => <option key={unit} value={unit}>{unitLabel[unit]}</option>)}</select><button type="button" className="icon-button" onClick={() => setRecipe((current) => current.filter((candidate) => candidate.id !== item.id))}><Trash2 size={16} /></button></div></div>; })}</div></div><div className="grid grid-cols-2 gap-3"><div><label className="field-label">Gás, energia e outros por receita</label><input className={inputClass} inputMode="decimal" value={production} onChange={(e) => setProduction(e.target.value)} /></div><div><label className="field-label">Perdas estimadas</label><div className="relative"><input className={`${inputClass} pr-10`} inputMode="decimal" value={loss} onChange={(e) => setLoss(e.target.value)} /><span className="absolute right-4 top-1/2 -translate-y-1/2 text-caramel">%</span></div></div></div><details className="rounded-2xl border border-nat p-4"><summary className="cursor-pointer font-bold">Ajustar margens</summary><div className="mt-4 grid grid-cols-2 gap-3"><div><label className="field-label">Margem mínima</label><input className={inputClass} inputMode="decimal" value={minimumMargin} onChange={(e) => setMinimumMargin(e.target.value)} /></div><div><label className="field-label">Margem recomendada</label><input className={inputClass} inputMode="decimal" value={targetMargin} onChange={(e) => setTargetMargin(e.target.value)} /></div></div></details>{draft.batchYield > 0 && <div className="rounded-[24px] bg-chocolate p-5 text-white"><p className="text-xs font-bold uppercase tracking-wider text-rose">Resultado da receita</p><div className="mt-3 grid grid-cols-2 gap-3"><div><p className="text-xs text-white/60">Custo por unidade</p><p className="mt-1 font-display text-2xl">{money(metrics.unitCost)}</p></div><div><p className="text-xs text-white/60">Preço recomendado</p><p className="mt-1 font-display text-2xl">{money(metrics.recommendedPrice)}</p></div></div></div>}<button className="primary-button w-full" type="submit">Salvar produto</button></form></SheetShell>;
}

function SaleSheet({ state, onClose, onSave }: { state: NatState; onClose: () => void; onSave: (sale: ReturnType<typeof buildSale>) => void }) {
  const [productId, setProductId] = useState(state.products[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const initialProduct = state.products[0];
  const [total, setTotal] = useState(initialProduct ? String(initialProduct.sellingPrice) : "");
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const product = state.products.find((item) => item.id === productId);
  const qty = Number(quantity.replace(",", ".")) || 0;
  const received = Number(total.replace(",", ".")) || 0;
  const preview = product && qty > 0 ? buildSale({ product, supplies: state.supplies, paymentFeePercent: state.settings.paymentFeePercent, quantity: qty, totalReceived: received, paymentMethod: method, soldAt: new Date(`${date}T12:00:00`).toISOString() }) : null;

  return <SheetShell title="Registrar venda" subtitle="Só precisamos saber o que vendeu, quanto e quanto entrou. O restante é calculado sozinho." onClose={onClose}>{state.products.length === 0 ? <><Empty text="Crie pelo menos um produto antes de registrar uma venda." /></> : <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); if (!product || qty <= 0 || received < 0) return; onSave(buildSale({ product, supplies: state.supplies, paymentFeePercent: state.settings.paymentFeePercent, quantity: qty, totalReceived: received, paymentMethod: method, soldAt: new Date(`${date}T12:00:00`).toISOString() })); }}><div><label className="field-label">O que vendeu?</label><select className={inputClass} value={productId} onChange={(e) => { const selected = state.products.find((item) => item.id === e.target.value); setProductId(e.target.value); if (selected) setTotal(String(selected.sellingPrice * (Number(quantity) || 1))); }}>{state.products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div className="grid grid-cols-2 gap-3"><div><label className="field-label">Quantidade</label><input className={inputClass} inputMode="decimal" value={quantity} onChange={(e) => { setQuantity(e.target.value); if (product) setTotal(String(product.sellingPrice * (Number(e.target.value.replace(",", ".")) || 0))); }} /></div><div><label className="field-label">Valor recebido</label><input className={inputClass} inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} /></div></div><div><label className="field-label">Como recebeu?</label><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{(["pix", "cash", "card", "other"] as PaymentMethod[]).map((item) => <Choice key={item} active={method === item} onClick={() => setMethod(item)} label={paymentLabel[item]} />)}</div></div><div><label className="field-label">Data</label><input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} /></div>{preview && <div className="rounded-2xl bg-rose-soft p-4"><p className="text-xs font-bold uppercase tracking-wider text-caramel">Depois dos custos dessa venda</p><p className="mt-1 font-display text-3xl">Sobram {money(preview.contributionSnapshot)}</p><p className="mt-1 text-xs text-caramel">Antes de descontar os custos fixos do mês.</p></div>}<button className="primary-button w-full" type="submit"><CircleDollarSign size={18} /> Salvar venda</button></form>}</SheetShell>;
}

function SettingsSheet({ value, onClose, onSave, onReset }: { value: Settings; onClose: () => void; onSave: (settings: Settings) => void; onReset: () => void }) {
  const [settings, setSettings] = useState(value);
  const numberField = (key: keyof Pick<Settings, "monthlyFixedCosts" | "paymentFeePercent" | "defaultMinimumMarginPercent" | "defaultTargetMarginPercent">, raw: string) => setSettings((current) => ({ ...current, [key]: Number(raw.replace(",", ".")) || 0 }));
  return <SheetShell title="Configurações" subtitle="Esses valores ajudam a deixar a precificação mais próxima da realidade da NAT." onClose={onClose}><form className="space-y-5" onSubmit={(e) => { e.preventDefault(); onSave(settings); }}><div><label className="field-label">Como quer ser chamada?</label><input className={inputClass} value={settings.ownerName} onChange={(e) => setSettings((current) => ({ ...current, ownerName: e.target.value }))} /></div><div><label className="field-label">Custos fixos por mês</label><input className={inputClass} inputMode="decimal" value={settings.monthlyFixedCosts} onChange={(e) => numberField("monthlyFixedCosts", e.target.value)} /><p className="field-help">Ex.: internet, mensalidades, aluguel ou uma estimativa mensal de gás e energia.</p></div><div><label className="field-label">Taxa média sobre as vendas</label><input className={inputClass} inputMode="decimal" value={settings.paymentFeePercent} onChange={(e) => numberField("paymentFeePercent", e.target.value)} /><p className="field-help">Use 0 se a maior parte for Pix sem taxa. Para cartão, você pode colocar uma média.</p></div><div className="grid grid-cols-2 gap-3"><div><label className="field-label">Margem mínima padrão</label><input className={inputClass} inputMode="decimal" value={settings.defaultMinimumMarginPercent} onChange={(e) => numberField("defaultMinimumMarginPercent", e.target.value)} /></div><div><label className="field-label">Margem recomendada</label><input className={inputClass} inputMode="decimal" value={settings.defaultTargetMarginPercent} onChange={(e) => numberField("defaultTargetMarginPercent", e.target.value)} /></div></div><button className="primary-button w-full" type="submit">Salvar configurações</button><button className="text-button mx-auto text-red-700" type="button" onClick={onReset}><Trash2 size={16} /> Apagar dados deste aparelho</button></form></SheetShell>;
}
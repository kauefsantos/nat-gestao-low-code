import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Box,
  Calculator,
  Check,
  CircleDollarSign,
  Cloud,
  CloudOff,
  Cookie,
  Heart,
  Home,
  Info,
  LogOut,
  Package,
  Pencil,
  Plus,
  ReceiptText,
  Settings,
  ShoppingBag,
  Sparkles,
  Trash2,
  TrendingUp,
  WalletCards,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useNatWorkspace } from "@/hooks/use-nat-workspace";
import {
  PAYMENT_LABELS,
  UNIT_LABELS,
  currentMonthSales,
  money,
  pct,
  productMetrics,
  salesChartData,
  supplyCostPerBaseUnit,
  supplyUsageCost,
  uid,
  type NatSettings,
  type PaymentMethod,
  type Product,
  type RecipeItem,
  type Sale,
  type Supply,
  type SupplyCategory,
  type SupplyUnit,
} from "@/lib/nat-business";

type Section = "home" | "sales" | "products" | "pricing";
type ProductSubsection = "products" | "supplies";

const inputClass =
  "w-full rounded-2xl border border-[#E7CFC5] bg-white px-4 py-3 text-[15px] text-[#35150A] outline-none transition focus:border-[#EAAC93] focus:ring-4 focus:ring-[#EAAC93]/15";
const labelClass = "mb-1.5 block text-sm font-bold text-[#55281B]";
const secondaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[#E7CFC5] bg-white px-4 py-2.5 text-sm font-bold text-[#55281B] transition hover:bg-[#F8EEE9]";
const primaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#35150A] px-5 py-2.5 text-sm font-bold text-[#FFF9F6] shadow-sm transition hover:bg-[#55281B] disabled:cursor-not-allowed disabled:opacity-50";

function preferredUsageUnit(supply?: Supply): SupplyUnit {
  if (!supply) return "un";
  if (supply.purchaseUnit === "kg" || supply.purchaseUnit === "g") return "g";
  if (supply.purchaseUnit === "l" || supply.purchaseUnit === "ml") return "ml";
  return "un";
}

function compatibleUnits(supply?: Supply): SupplyUnit[] {
  if (!supply) return ["un"];
  if (supply.purchaseUnit === "kg" || supply.purchaseUnit === "g") return ["g", "kg"];
  if (supply.purchaseUnit === "l" || supply.purchaseUnit === "ml") return ["ml", "l"];
  return ["un"];
}

export function NatApp() {
  const navigate = useNavigate();
  const { workspace, setWorkspace, isLoading, cloudStatus } = useNatWorkspace();
  const [section, setSection] = useState<Section>("home");
  const [productSubsection, setProductSubsection] = useState<ProductSubsection>("products");
  const [saleModal, setSaleModal] = useState(false);
  const [supplyModal, setSupplyModal] = useState<Supply | null | "new">(null);
  const [productModal, setProductModal] = useState<Product | null | "new">(null);
  const [settingsModal, setSettingsModal] = useState(false);

  useEffect(() => {
    const openSettings = () => setSettingsModal(true);
    window.addEventListener("nat-open-settings", openSettings);
    return () => window.removeEventListener("nat-open-settings", openSettings);
  }, []);

  const monthSales = useMemo(() => currentMonthSales(workspace.sales), [workspace.sales]);
  const revenue = monthSales.reduce((sum, sale) => sum + sale.totalReceived, 0);
  const units = monthSales.reduce((sum, sale) => sum + sale.quantity, 0);
  const contribution = monthSales.reduce((sum, sale) => sum + sale.profitSnapshot, 0);

  const topProduct = useMemo(() => {
    const counter = new Map<string, { name: string; quantity: number }>();
    for (const sale of monthSales) {
      const current = counter.get(sale.productId) ?? { name: sale.productName, quantity: 0 };
      current.quantity += sale.quantity;
      counter.set(sale.productId, current);
    }
    return [...counter.values()].sort((a, b) => b.quantity - a.quantity)[0] ?? null;
  }, [monthSales]);

  const currentProfitPerUnit =
    units > 0
      ? contribution / units
      : workspace.products.length
        ? workspace.products.reduce(
            (sum, product) =>
              sum +
              Math.max(
                0,
                productMetrics(product, workspace.supplies, workspace.settings.paymentFeePercent)
                  .profitAtCurrentPrice,
              ),
            0,
          ) / workspace.products.length
        : 0;

  const breakEvenUnits =
    workspace.settings.monthlyFixedCosts > 0 && currentProfitPerUnit > 0
      ? Math.ceil(workspace.settings.monthlyFixedCosts / currentProfitPerUnit)
      : 0;
  const breakEvenRemaining = Math.max(0, breakEvenUnits - units);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8EEE9]">
        <div className="text-center">
          <BrandMark compact />
          <p className="mt-4 text-sm font-bold text-[#956454]">Preparando sua gestão...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8EEE9] text-[#35150A]">
      <header className="sticky top-0 z-30 border-b border-[#E9D8D1] bg-[#F8EEE9]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <BrandMark />
          <div className="flex items-center gap-1.5">
            <div
              className="hidden items-center gap-1.5 rounded-full bg-white/80 px-3 py-2 text-xs font-bold text-[#956454] sm:flex"
              title={
                cloudStatus === "synced"
                  ? "Dados sincronizados na nuvem"
                  : "Se a nuvem estiver indisponível, seus dados continuam salvos neste aparelho"
              }
            >
              {cloudStatus === "synced" ? <Cloud className="h-3.5 w-3.5" /> : <CloudOff className="h-3.5 w-3.5" />}
              {cloudStatus === "synced" ? "Sincronizado" : "Salvo neste aparelho"}
            </div>
            <button
              type="button"
              onClick={() => setSettingsModal(true)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl text-[#55281B] transition hover:bg-white"
              aria-label="Configurações"
            >
              <Settings className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={signOut}
              className="hidden h-11 w-11 items-center justify-center rounded-2xl text-[#956454] transition hover:bg-white sm:flex"
              aria-label="Sair"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 sm:pb-10">
        {section === "home" && (
          <HomeSection
            workspace={workspace}
            revenue={revenue}
            units={units}
            contribution={contribution}
            topProduct={topProduct}
            breakEvenUnits={breakEvenUnits}
            breakEvenRemaining={breakEvenRemaining}
            onNewSale={() => setSaleModal(true)}
            onGoProducts={() => {
              setProductSubsection("products");
              setSection("products");
            }}
            onGoSupplies={() => {
              setProductSubsection("supplies");
              setSection("products");
            }}
            onGoPricing={() => setSection("pricing")}
          />
        )}

        {section === "sales" && (
          <SalesSection
            sales={workspace.sales}
            onNewSale={() => setSaleModal(true)}
            onDelete={(sale) => {
              if (!window.confirm(`Excluir a venda de ${sale.productName}?`)) return;
              setWorkspace((current) => ({
                ...current,
                sales: current.sales.filter((candidate) => candidate.id !== sale.id),
              }));
              toast.success("Venda excluída");
            }}
          />
        )}

        {section === "products" && (
          <ProductsSection
            workspace={workspace}
            subsection={productSubsection}
            onSubsection={setProductSubsection}
            onNewProduct={() => setProductModal("new")}
            onEditProduct={(product) => setProductModal(product)}
            onDeleteProduct={(product) => {
              if (!window.confirm(`Excluir ${product.name}? As vendas já registradas serão mantidas.`)) return;
              setWorkspace((current) => ({
                ...current,
                products: current.products.filter((candidate) => candidate.id !== product.id),
              }));
              toast.success("Produto excluído");
            }}
            onNewSupply={() => setSupplyModal("new")}
            onEditSupply={(supply) => setSupplyModal(supply)}
            onDeleteSupply={(supply) => {
              const inUse = workspace.products.some((product) =>
                product.recipe.some((item) => item.supplyId === supply.id),
              );
              if (inUse) {
                toast.error("Esse item está sendo usado em uma receita. Retire-o da receita antes de excluir.");
                return;
              }
              if (!window.confirm(`Excluir ${supply.name}?`)) return;
              setWorkspace((current) => ({
                ...current,
                supplies: current.supplies.filter((candidate) => candidate.id !== supply.id),
              }));
              toast.success("Item excluído");
            }}
          />
        )}

        {section === "pricing" && <PricingSection workspace={workspace} onGoSupplies={() => {
          setProductSubsection("supplies");
          setSection("products");
        }} onGoProducts={() => {
          setProductSubsection("products");
          setSection("products");
        }} />}
      </main>

      <BottomNav section={section} onChange={setSection} onNewSale={() => setSaleModal(true)} />

      {saleModal && (
        <SaleModal
          products={workspace.products}
          supplies={workspace.supplies}
          paymentFeePercent={workspace.settings.paymentFeePercent}
          onClose={() => setSaleModal(false)}
          onSave={(sale) => {
            setWorkspace((current) => ({ ...current, sales: [sale, ...current.sales] }));
            setSaleModal(false);
            toast.success("Venda registrada");
          }}
        />
      )}

      {supplyModal && (
        <SupplyModal
          supply={supplyModal === "new" ? null : supplyModal}
          onClose={() => setSupplyModal(null)}
          onSave={(supply) => {
            setWorkspace((current) => ({
              ...current,
              supplies: current.supplies.some((candidate) => candidate.id === supply.id)
                ? current.supplies.map((candidate) => (candidate.id === supply.id ? supply : candidate))
                : [...current.supplies, supply],
            }));
            setSupplyModal(null);
            toast.success(supplyModal === "new" ? "Item cadastrado" : "Compra atualizada");
          }}
        />
      )}

      {productModal && (
        <ProductModal
          product={productModal === "new" ? null : productModal}
          supplies={workspace.supplies}
          settings={workspace.settings}
          onClose={() => setProductModal(null)}
          onSave={(product) => {
            setWorkspace((current) => ({
              ...current,
              products: current.products.some((candidate) => candidate.id === product.id)
                ? current.products.map((candidate) => (candidate.id === product.id ? product : candidate))
                : [...current.products, product],
            }));
            setProductModal(null);
            toast.success(productModal === "new" ? "Produto criado" : "Produto atualizado");
          }}
        />
      )}

      {settingsModal && (
        <SettingsModal
          settings={workspace.settings}
          onClose={() => setSettingsModal(false)}
          onSave={(settings) => {
            setWorkspace((current) => ({ ...current, settings }));
            setSettingsModal(false);
            toast.success("Configurações salvas");
          }}
          onSignOut={signOut}
        />
      )}
    </div>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`${compact ? "h-11 w-11" : "h-10 w-10"} relative flex shrink-0 items-center justify-center rounded-full border border-[#EAAC93] bg-[#35150A]`}>
        <span className="font-display text-xl text-[#F2C5B5]">NAT</span>
        <Heart className="absolute -bottom-1 h-2.5 w-2.5 fill-[#EAAC93] text-[#EAAC93]" />
      </div>
      {!compact && (
        <div>
          <p className="font-display text-[22px] leading-none text-[#35150A]">NAT</p>
          <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.22em] text-[#956454]">Gestão do ateliê</p>
        </div>
      )}
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="mb-2 text-[11px] font-black uppercase tracking-[0.24em] text-[#EAAC93]">{eyebrow}</p>
        <h1 className="font-display text-3xl leading-tight text-[#35150A] sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-[#956454]">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function HomeSection({
  workspace,
  revenue,
  units,
  contribution,
  topProduct,
  breakEvenUnits,
  breakEvenRemaining,
  onNewSale,
  onGoProducts,
  onGoSupplies,
  onGoPricing,
}: {
  workspace: ReturnType<typeof useNatWorkspace>["workspace"];
  revenue: number;
  units: number;
  contribution: number;
  topProduct: { name: string; quantity: number } | null;
  breakEvenUnits: number;
  breakEvenRemaining: number;
  onNewSale: () => void;
  onGoProducts: () => void;
  onGoSupplies: () => void;
  onGoPricing: () => void;
}) {
  const chart = useMemo(() => salesChartData(workspace.sales), [workspace.sales]);
  const hasBasics = workspace.supplies.length > 0 && workspace.products.length > 0;

  return (
    <>
      <div className="mb-7 overflow-hidden rounded-[32px] bg-[#35150A] p-6 text-[#FFF9F6] shadow-[0_18px_50px_rgba(53,21,10,0.14)] sm:p-8">
        <div className="grid gap-7 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#F2C5B5]">
              <Heart className="h-3.5 w-3.5 fill-current" />
              Doces momentos, números claros
            </div>
            <h1 className="font-display text-4xl leading-tight sm:text-5xl">
              Boa tarde, {workspace.settings.ownerName || "Natalia"}.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#F2C5B5]">
              Aqui você vê quanto vendeu, quanto custou e quanto realmente sobrou — sem planilha e sem conta de cabeça.
            </p>
          </div>
          <button type="button" onClick={onNewSale} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#EAAC93] px-6 py-3.5 text-sm font-black text-[#35150A] transition hover:bg-[#F2C5B5]">
            <Plus className="h-5 w-5" />
            Registrar venda
          </button>
        </div>
      </div>

      {!hasBasics && (
        <div className="mb-7 rounded-[28px] border border-[#E7CFC5] bg-white p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-black text-[#55281B]">
                <Sparkles className="h-4 w-4 text-[#EAAC93]" />
                Comece por aqui
              </div>
              <h2 className="font-display text-2xl text-[#35150A]">A NAT fica pronta em três passos simples.</h2>
              <p className="mt-1 text-sm text-[#956454]">Cadastre o que você compra, monte um produto e descubra o preço ideal.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <GuideButton number="1" label="Ingredientes" done={workspace.supplies.length > 0} onClick={onGoSupplies} />
              <GuideButton number="2" label="Produto" done={workspace.products.length > 0} onClick={onGoProducts} />
              <GuideButton number="3" label="Precificar" done={false} onClick={onGoPricing} />
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<CircleDollarSign />} label="Vendeu neste mês" value={money(revenue)} helper="Total recebido nas vendas" />
        <MetricCard icon={<Cookie />} label="Produtos vendidos" value={String(units)} helper="Unidades registradas" />
        <MetricCard icon={<WalletCards />} label="Sobrou das vendas" value={money(contribution)} helper="Antes dos custos fixos" />
        <MetricCard
          icon={<TrendingUp />}
          label="Mais vendido"
          value={topProduct?.name ?? "—"}
          helper={topProduct ? `${topProduct.quantity} un. neste mês` : "Registre vendas para descobrir"}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.45fr_0.8fr]">
        <div className="rounded-[28px] border border-[#E7CFC5] bg-white p-5 sm:p-6">
          <div className="mb-5">
            <p className="text-sm font-black text-[#55281B]">Últimos 14 dias</p>
            <p className="mt-1 text-xs text-[#956454]">Uma visão simples do dinheiro entrando na NAT.</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="natSalesArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EAAC93" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#EAAC93" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#F1E2DC" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#956454", fontSize: 11 }} interval="preserveStartEnd" />
                <Tooltip
                  formatter={(value) => money(Number(value))}
                  contentStyle={{ borderRadius: 16, borderColor: "#E7CFC5", color: "#35150A" }}
                />
                <Area type="monotone" dataKey="vendas" stroke="#55281B" strokeWidth={2.5} fill="url(#natSalesArea)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-[28px] bg-[#F2C5B5] p-5 sm:p-6">
          <div className="flex h-full flex-col">
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#35150A] text-[#F8EEE9]">
              <BarChart3 className="h-5 w-5" />
            </div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#956454]">Meta do mês</p>
            {workspace.settings.monthlyFixedCosts <= 0 ? (
              <>
                <h3 className="mt-2 font-display text-3xl leading-tight text-[#35150A]">Quanto a NAT precisa vender para se pagar?</h3>
                <p className="mt-3 text-sm leading-6 text-[#55281B]">
                  Informe os custos fixos mensais e o sistema calcula uma meta simples de unidades.
                </p>
                <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("nat-open-settings"))} className="mt-auto pt-6 text-left text-sm font-black text-[#35150A]">
                  Configure seus custos no ícone de ajustes.
                </button>
              </>
            ) : breakEvenUnits > 0 ? (
              <>
                <h3 className="mt-2 font-display text-4xl text-[#35150A]">{breakEvenUnits} unidades</h3>
                <p className="mt-2 text-sm leading-6 text-[#55281B]">
                  É a estimativa para cobrir {money(workspace.settings.monthlyFixedCosts)} de custos fixos no ritmo atual.
                </p>
                <div className="mt-auto pt-6">
                  <div className="mb-2 flex justify-between text-xs font-black text-[#55281B]">
                    <span>Já vendeu {units}</span>
                    <span>Faltam {breakEvenRemaining}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-white/60">
                    <div
                      className="h-full rounded-full bg-[#35150A]"
                      style={{ width: `${Math.min(100, breakEvenUnits ? (units / breakEvenUnits) * 100 : 0)}%` }}
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <h3 className="mt-2 font-display text-3xl leading-tight text-[#35150A]">Falta um pouco de informação.</h3>
                <p className="mt-3 text-sm leading-6 text-[#55281B]">
                  Cadastre produtos com preço e custo para calcular a meta mensal.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function GuideButton({ number, label, done, onClick }: { number: string; label: string; done: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex min-w-36 items-center gap-3 rounded-2xl bg-[#F8EEE9] px-4 py-3 text-left transition hover:bg-[#F2C5B5]/40"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${done ? "bg-[#55281B] text-white" : "bg-[#EAAC93] text-[#35150A]"}`}>{done ? <Check className="h-4 w-4" /> : number}</span><span className="text-sm font-black text-[#55281B]">{label}</span></button>;
}

function MetricCard({ icon, label, value, helper }: { icon: React.ReactNode; label: string; value: string; helper: string }) {
  return <div className="rounded-[26px] border border-[#E7CFC5] bg-white p-5"><div className="mb-5 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F8EEE9] text-[#55281B] [&>svg]:h-5 [&>svg]:w-5">{icon}</div><p className="text-xs font-bold text-[#956454]">{label}</p><p className="mt-1 truncate font-display text-3xl text-[#35150A]">{value}</p><p className="mt-2 text-xs text-[#956454]">{helper}</p></div>;
}

function SalesSection({ sales, onNewSale, onDelete }: { sales: Sale[]; onNewSale: () => void; onDelete: (sale: Sale) => void }) {
  return <><SectionHeading eyebrow="Vendas" title="O que saiu da cozinha?" description="Registre cada venda em poucos segundos. O custo e o resultado são calculados automaticamente." action={<button type="button" onClick={onNewSale} className={primaryButton}><Plus className="h-4 w-4" /> Registrar venda</button>} />{sales.length === 0 ? <EmptyState icon={<ReceiptText />} title="Nenhuma venda registrada ainda." text="Quando sair o primeiro pedido, registre aqui. O restante da conta fica por nossa conta." action="Registrar primeira venda" onAction={onNewSale} /> : <div className="space-y-3">{sales.map((sale) => <div key={sale.id} className="flex flex-col gap-4 rounded-[24px] border border-[#E7CFC5] bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div className="flex items-center gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F8EEE9] text-[#55281B]"><ShoppingBag className="h-5 w-5" /></div><div><p className="font-black text-[#35150A]">{sale.productName}</p><p className="mt-1 text-xs text-[#956454]">{sale.quantity} un. · {PAYMENT_LABELS[sale.paymentMethod]} · {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(sale.soldAt))}</p></div></div><div className="flex items-center justify-between gap-5 sm:justify-end"><div className="text-right"><p className="font-display text-2xl text-[#35150A]">{money(sale.totalReceived)}</p><p className={`text-xs font-bold ${sale.profitSnapshot >= 0 ? "text-[#956454]" : "text-red-700"}`}>Sobrou {money(sale.profitSnapshot)}</p></div><button type="button" onClick={() => onDelete(sale)} className="flex h-10 w-10 items-center justify-center rounded-xl text-[#956454] hover:bg-[#F8EEE9]" aria-label="Excluir venda"><Trash2 className="h-4 w-4" /></button></div></div>)}</div>}</>;
}

function ProductsSection({ workspace, subsection, onSubsection, onNewProduct, onEditProduct, onDeleteProduct, onNewSupply, onEditSupply, onDeleteSupply }: { workspace: ReturnType<typeof useNatWorkspace>["workspace"]; subsection: ProductSubsection; onSubsection: (value: ProductSubsection) => void; onNewProduct: () => void; onEditProduct: (product: Product) => void; onDeleteProduct: (product: Product) => void; onNewSupply: () => void; onEditSupply: (supply: Supply) => void; onDeleteSupply: (supply: Supply) => void }) {
  return <><SectionHeading eyebrow="Produtos" title="Sua cozinha organizada." description="Produtos, receitas, ingredientes e embalagens ficam juntos para o custo sempre acompanhar o preço real." /><div className="mb-6 inline-flex w-full rounded-2xl bg-[#EFDCD4] p-1 sm:w-auto"><button type="button" onClick={() => onSubsection("products")} className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-black transition sm:flex-none ${subsection === "products" ? "bg-white text-[#35150A] shadow-sm" : "text-[#956454]"}`}>Meus produtos</button><button type="button" onClick={() => onSubsection("supplies")} className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-black transition sm:flex-none ${subsection === "supplies" ? "bg-white text-[#35150A] shadow-sm" : "text-[#956454]"}`}>Ingredientes e embalagens</button></div>{subsection === "products" ? <div><div className="mb-4 flex justify-end"><button type="button" onClick={onNewProduct} className={primaryButton}><Plus className="h-4 w-4" /> Novo produto</button></div>{workspace.products.length === 0 ? <EmptyState icon={<Cookie />} title="Cadastre o primeiro doce da NAT." text="Informe o rendimento e monte a receita. O sistema transforma tudo em custo por unidade." action="Criar primeiro produto" onAction={onNewProduct} /> : <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{workspace.products.map((product) => { const metrics = productMetrics(product, workspace.supplies, workspace.settings.paymentFeePercent); return <div key={product.id} className="rounded-[28px] border border-[#E7CFC5] bg-white p-5"><div className="mb-5 flex items-start justify-between gap-4"><div><p className="font-display text-2xl text-[#35150A]">{product.name}</p><p className="mt-1 text-xs text-[#956454]">Receita rende {product.batchYield} un.</p></div><div className="flex gap-1"><button type="button" onClick={() => onEditProduct(product)} className="flex h-9 w-9 items-center justify-center rounded-xl text-[#956454] hover:bg-[#F8EEE9]" aria-label="Editar produto"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => onDeleteProduct(product)} className="flex h-9 w-9 items-center justify-center rounded-xl text-[#956454] hover:bg-[#F8EEE9]" aria-label="Excluir produto"><Trash2 className="h-4 w-4" /></button></div></div><div className="grid grid-cols-2 gap-3"><MiniMetric label="Custo unitário" value={money(metrics.unitCost)} /><MiniMetric label="Preço atual" value={money(product.sellingPrice)} /><MiniMetric label="Ganho por un." value={money(metrics.profitAtCurrentPrice)} /><MiniMetric label="Margem atual" value={pct(metrics.marginAtCurrentPrice)} /></div></div>; })}</div>}</div> : <div><div className="mb-4 flex justify-end"><button type="button" onClick={onNewSupply} className={primaryButton}><Plus className="h-4 w-4" /> Novo item</button></div>{workspace.supplies.length === 0 ? <EmptyState icon={<Package />} title="Comece pelo que você compra." text="Exemplo: caixa com 12 ovos por R$ 12,00. A NAT calcula que cada ovo custa R$ 1,00." action="Cadastrar primeiro item" onAction={onNewSupply} /> : <div className="grid gap-4 lg:grid-cols-2">{workspace.supplies.slice().sort((a,b)=>a.category.localeCompare(b.category)||a.name.localeCompare(b.name)).map((supply)=>{const baseCost=supplyCostPerBaseUnit(supply); const baseLabel=supply.purchaseUnit==="kg"||supply.purchaseUnit==="g"?"por g":supply.purchaseUnit==="l"||supply.purchaseUnit==="ml"?"por ml":"por unidade"; return <div key={supply.id} className="flex items-center justify-between gap-4 rounded-[24px] border border-[#E7CFC5] bg-white p-4 sm:p-5"><div className="flex min-w-0 items-center gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F8EEE9] text-[#55281B]">{supply.category==="ingrediente"?<Cookie className="h-5 w-5"/>:<Box className="h-5 w-5"/>}</div><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate font-black text-[#35150A]">{supply.name}</p><span className="rounded-full bg-[#F2C5B5]/50 px-2 py-0.5 text-[10px] font-black uppercase text-[#956454]">{supply.category}</span></div><p className="mt-1 text-xs text-[#956454]">{supply.purchaseQuantity} {UNIT_LABELS[supply.purchaseUnit]} por {money(supply.purchasePrice)}</p><p className="mt-1 text-xs font-bold text-[#55281B]">{money(baseCost)} {baseLabel}</p></div></div><div className="flex shrink-0 gap-1"><button type="button" onClick={()=>onEditSupply(supply)} className="flex h-9 w-9 items-center justify-center rounded-xl text-[#956454] hover:bg-[#F8EEE9]" aria-label="Atualizar compra"><Pencil className="h-4 w-4"/></button><button type="button" onClick={()=>onDeleteSupply(supply)} className="flex h-9 w-9 items-center justify-center rounded-xl text-[#956454] hover:bg-[#F8EEE9]" aria-label="Excluir item"><Trash2 className="h-4 w-4"/></button></div></div>})}</div>}</div>}</>;
}

function MiniMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-[#F8EEE9] p-3"><p className="text-[10px] font-bold text-[#956454]">{label}</p><p className="mt-1 text-sm font-black text-[#55281B]">{value}</p></div>; }

function PricingSection({ workspace, onGoSupplies, onGoProducts }: { workspace: ReturnType<typeof useNatWorkspace>["workspace"]; onGoSupplies: () => void; onGoProducts: () => void }) {
  const [productId, setProductId] = useState(workspace.products[0]?.id ?? ""); const product = workspace.products.find((candidate) => candidate.id === productId) ?? workspace.products[0] ?? null; const metrics = product ? productMetrics(product, workspace.supplies, workspace.settings.paymentFeePercent) : null; const [simulation, setSimulation] = useState<number | "">(""); if (workspace.products.length === 0) return <><SectionHeading eyebrow="Precificar" title="Quanto devo cobrar?" description="Primeiro precisamos de pelo menos um produto com receita."/><EmptyState icon={<Calculator/>} title="Crie um produto para começar a precificar." text={workspace.supplies.length?"Você já tem itens cadastrados. Agora monte uma receita.":"Cadastre ingredientes e embalagens, depois monte a receita."} action={workspace.supplies.length?"Criar produto":"Cadastrar ingredientes"} onAction={workspace.supplies.length?onGoProducts:onGoSupplies}/></>; if(!product||!metrics)return null; const simPrice=simulation===""?product.sellingPrice:Number(simulation); const feeValue=simPrice*(workspace.settings.paymentFeePercent/100); const simProfit=simPrice-metrics.unitCost-feeValue; const simMargin=simPrice>0?(simProfit/simPrice)*100:0; return <><SectionHeading eyebrow="Precificar" title="Quanto custa fazer? Quanto cobrar?" description="A NAT transforma sua receita em custo unitário e mostra preços de referência sem esconder a conta."/><div className="mb-5 max-w-md"><label className={labelClass}>Qual produto você quer analisar?</label><select value={product.id} onChange={(event)=>{setProductId(event.target.value);setSimulation("")}} className={inputClass}>{workspace.products.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div className="grid gap-5 xl:grid-cols-[1fr_1fr]"><div className="rounded-[30px] border border-[#E7CFC5] bg-white p-5 sm:p-7"><p className="text-xs font-black uppercase tracking-[0.2em] text-[#EAAC93]">Custo da receita</p><h2 className="mt-2 font-display text-3xl text-[#35150A]">{product.name}</h2><div className="mt-6 space-y-3"><CostRow label="Ingredientes" value={metrics.ingredientsBatch}/><CostRow label="Embalagens" value={metrics.packagingBatch}/><CostRow label="Produção / outros" value={metrics.extraBatch}/><CostRow label={`Perdas estimadas (${product.lossPercent}%)`} value={metrics.lossesBatch}/><div className="my-4 h-px bg-[#E7CFC5]"/><CostRow label={`Custo do lote (${product.batchYield} un.)`} value={metrics.totalBatch} strong/></div><div className="mt-6 rounded-[24px] bg-[#35150A] p-5 text-[#FFF9F6]"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#F2C5B5]">Custo real por unidade</p><p className="mt-1 font-display text-4xl">{money(metrics.unitCost)}</p></div>{product.recipe.length>0&&<div className="mt-6"><p className="mb-3 text-sm font-black text-[#55281B]">De onde vem esse custo?</p><div className="space-y-2">{product.recipe.map(item=>{const supply=workspace.supplies.find(candidate=>candidate.id===item.supplyId);if(!supply)return null;return <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[#F8EEE9] px-4 py-3"><div><p className="text-sm font-bold text-[#55281B]">{supply.name}</p><p className="text-xs text-[#956454]">{item.quantity} {UNIT_LABELS[item.unit]} usados</p></div><p className="text-sm font-black text-[#35150A]">{money(supplyUsageCost(supply,item.quantity,item.unit))}</p></div>})}</div></div>}</div><div className="space-y-5"><div className="rounded-[30px] bg-[#F2C5B5] p-5 sm:p-7"><p className="text-xs font-black uppercase tracking-[0.2em] text-[#956454]">Referência de preço</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><PriceCard label="Preço mínimo saudável" value={metrics.minPrice} helper={`Meta mínima de ${product.minMarginPercent}%`}/><PriceCard label="Preço recomendado" value={metrics.recommendedPrice} helper={`Meta de ${product.targetMarginPercent}%`} featured/></div><div className="mt-4 flex gap-2 rounded-2xl bg-white/55 p-3 text-xs leading-5 text-[#55281B]"><Info className="mt-0.5 h-4 w-4 shrink-0"/>Esses valores são referências matemáticas com base nos custos e margens configurados. Você continua decidindo o preço final.</div></div><div className="rounded-[30px] border border-[#E7CFC5] bg-white p-5 sm:p-7"><div className="mb-5"><p className="text-xs font-black uppercase tracking-[0.2em] text-[#EAAC93]">Simulador</p><h3 className="mt-2 font-display text-3xl text-[#35150A]">E se eu vender por...</h3></div><label className={labelClass}>Preço de venda</label><div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-[#956454]">R$</span><input type="number" min="0" step="0.01" value={simulation} onChange={(event)=>setSimulation(event.target.value===""?"":Number(event.target.value))} placeholder={String(product.sellingPrice||metrics.recommendedPrice.toFixed(2))} className={`${inputClass} pl-12`}/></div><div className="mt-5 grid grid-cols-2 gap-3"><MiniMetric label="Custo" value={money(metrics.unitCost)}/><MiniMetric label="Taxa de venda" value={money(feeValue)}/><MiniMetric label="Ganho por unidade" value={money(simProfit)}/><MiniMetric label="Margem" value={pct(simMargin)}/></div><div className={`mt-4 rounded-2xl px-4 py-3 text-sm font-bold ${simMargin>=product.minMarginPercent?"bg-[#F8EEE9] text-[#55281B]":"bg-red-50 text-red-800"}`}>{simMargin>=product.minMarginPercent?`Esse preço fica acima da margem mínima definida para ${product.name}.`:`Atenção: esse preço fica abaixo da margem mínima de ${product.minMarginPercent}%.`}</div></div></div></div></>;
}

function CostRow({label,value,strong=false}:{label:string;value:number;strong?:boolean}){return <div className={`flex items-center justify-between gap-4 ${strong?"font-black text-[#35150A]":"text-sm text-[#956454]"}`}><span>{label}</span><span>{money(value)}</span></div>}
function PriceCard({label,value,helper,featured=false}:{label:string;value:number;helper:string;featured?:boolean}){return <div className={`rounded-[22px] p-4 ${featured?"bg-[#35150A] text-[#FFF9F6]":"bg-white/70 text-[#35150A]"}`}><p className={`text-xs font-bold ${featured?"text-[#F2C5B5]":"text-[#956454]"}`}>{label}</p><p className="mt-1 font-display text-3xl">{money(value)}</p><p className={`mt-2 text-xs ${featured?"text-[#F2C5B5]":"text-[#956454]"}`}>{helper}</p></div>}

function BottomNav({section,onChange,onNewSale}:{section:Section;onChange:(section:Section)=>void;onNewSale:()=>void}){const items:{id:Section;label:string;icon:React.ReactNode}[]=[{id:"home",label:"Início",icon:<Home/>},{id:"sales",label:"Vendas",icon:<ReceiptText/>},{id:"products",label:"Produtos",icon:<Cookie/>},{id:"pricing",label:"Precificar",icon:<Calculator/>}];return <><nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E7CFC5] bg-white/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl sm:hidden"><div className="mx-auto grid max-w-md grid-cols-4 gap-1">{items.map(item=><button key={item.id} type="button" onClick={()=>onChange(item.id)} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-black transition [&>svg]:h-4 [&>svg]:w-4 ${section===item.id?"bg-[#F2C5B5]/50 text-[#35150A]":"text-[#956454]"}`}>{item.icon}{item.label}</button>)}</div></nav><nav className="fixed left-4 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-2 rounded-[24px] border border-[#E7CFC5] bg-white p-2 shadow-[0_15px_40px_rgba(53,21,10,0.10)] xl:flex">{items.map(item=><button key={item.id} type="button" onClick={()=>onChange(item.id)} title={item.label} className={`flex h-12 w-12 items-center justify-center rounded-2xl transition [&>svg]:h-5 [&>svg]:w-5 ${section===item.id?"bg-[#35150A] text-white":"text-[#956454] hover:bg-[#F8EEE9]"}`}>{item.icon}</button>)}<div className="my-1 h-px bg-[#E7CFC5]"/><button type="button" onClick={onNewSale} title="Registrar venda" className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EAAC93] text-[#35150A] transition hover:bg-[#F2C5B5]"><Plus className="h-5 w-5"/></button></nav></>}

function EmptyState({icon,title,text,action,onAction}:{icon:React.ReactNode;title:string;text:string;action:string;onAction:()=>void}){return <div className="flex min-h-72 flex-col items-center justify-center rounded-[30px] border border-dashed border-[#DDBEB2] bg-white/55 p-7 text-center"><div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[20px] bg-[#F2C5B5]/50 text-[#55281B] [&>svg]:h-6 [&>svg]:w-6">{icon}</div><h3 className="font-display text-2xl text-[#35150A]">{title}</h3><p className="mt-2 max-w-md text-sm leading-6 text-[#956454]">{text}</p><button type="button" onClick={onAction} className={`${primaryButton} mt-5`}>{action}<ArrowRight className="h-4 w-4"/></button></div>}

function ModalShell({title,eyebrow,children,onClose,maxWidth="max-w-2xl"}:{title:string;eyebrow:string;children:React.ReactNode;onClose:()=>void;maxWidth?:string}){return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#35150A]/45 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose()}}><div className={`max-h-[92vh] w-full overflow-y-auto rounded-t-[32px] bg-[#FFF9F6] p-5 shadow-2xl sm:rounded-[32px] sm:p-7 ${maxWidth}`}><div className="mb-6 flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#EAAC93]">{eyebrow}</p><h2 className="mt-1 font-display text-3xl text-[#35150A]">{title}</h2></div><button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-[#956454] hover:bg-[#F8EEE9]" aria-label="Fechar"><X className="h-5 w-5"/></button></div>{children}</div></div>}

function SaleModal({products,supplies,paymentFeePercent,onClose,onSave}:{products:Product[];supplies:Supply[];paymentFeePercent:number;onClose:()=>void;onSave:(sale:Sale)=>void}){const[productId,setProductId]=useState(products[0]?.id??"");const[quantity,setQuantity]=useState(1);const[totalReceived,setTotalReceived]=useState(products[0]?.sellingPrice??0);const[paymentMethod,setPaymentMethod]=useState<PaymentMethod>("pix");const product=products.find(c=>c.id===productId);function selectProduct(id:string){setProductId(id);const selected=products.find(c=>c.id===id);if(selected)setTotalReceived(selected.sellingPrice*quantity)}function updateQuantity(next:number){setQuantity(next);if(product)setTotalReceived(product.sellingPrice*next)}function submit(event:React.FormEvent){event.preventDefault();if(!product){toast.error("Cadastre um produto antes de registrar uma venda.");return}if(quantity<=0||totalReceived<0)return;const metrics=productMetrics(product,supplies,paymentFeePercent);const fee=totalReceived*(paymentFeePercent/100);const totalCost=metrics.unitCost*quantity;onSave({id:uid("sale"),productId:product.id,productName:product.name,quantity,totalReceived,paymentMethod,soldAt:new Date().toISOString(),unitCostSnapshot:metrics.unitCost,profitSnapshot:totalReceived-totalCost-fee})}if(!products.length)return <ModalShell eyebrow="Venda" title="Antes da primeira venda..." onClose={onClose}><div className="rounded-2xl bg-[#F8EEE9] p-5 text-sm leading-6 text-[#55281B]">Cadastre pelo menos um produto. Depois, registrar uma venda leva poucos segundos.</div></ModalShell>;return <ModalShell eyebrow="Venda rápida" title="O que você vendeu?" onClose={onClose}><form onSubmit={submit} className="space-y-5"><div><label className={labelClass}>Produto</label><select value={productId} onChange={e=>selectProduct(e.target.value)} className={inputClass}>{products.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div className="grid gap-4 sm:grid-cols-2"><div><label className={labelClass}>Quantidade vendida</label><input type="number" min="1" step="1" value={quantity} onChange={e=>updateQuantity(Number(e.target.value))} className={inputClass}/></div><div><label className={labelClass}>Total recebido</label><input type="number" min="0" step="0.01" value={totalReceived} onChange={e=>setTotalReceived(Number(e.target.value))} className={inputClass}/></div></div><div><label className={labelClass}>Como recebeu?</label><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map(method=><button key={method} type="button" onClick={()=>setPaymentMethod(method)} className={`rounded-2xl border px-3 py-3 text-sm font-black transition ${paymentMethod===method?"border-[#55281B] bg-[#55281B] text-white":"border-[#E7CFC5] bg-white text-[#956454]"}`}>{PAYMENT_LABELS[method]}</button>)}</div></div>{product&&<div className="rounded-2xl bg-[#F8EEE9] p-4 text-sm text-[#55281B]">Custo estimado desta venda: <strong>{money(productMetrics(product,supplies,paymentFeePercent).unitCost*quantity)}</strong>. O lucro será salvo com o custo de hoje, mesmo que os ingredientes mudem de preço depois.</div>}<button type="submit" className={`${primaryButton} w-full`}><Check className="h-4 w-4"/> Salvar venda</button></form></ModalShell>}

function SupplyModal({supply,onClose,onSave}:{supply:Supply|null;onClose:()=>void;onSave:(supply:Supply)=>void}){const[name,setName]=useState(supply?.name??"");const[category,setCategory]=useState<SupplyCategory>(supply?.category??"ingrediente");const[purchaseQuantity,setPurchaseQuantity]=useState(supply?.purchaseQuantity??1);const[purchaseUnit,setPurchaseUnit]=useState<SupplyUnit>(supply?.purchaseUnit??"un");const[purchasePrice,setPurchasePrice]=useState(supply?.purchasePrice??0);function submit(event:React.FormEvent){event.preventDefault();if(!name.trim()||purchaseQuantity<=0||purchasePrice<0)return;const now=new Date().toISOString();const changedPurchase=!!supply&&(supply.purchaseQuantity!==purchaseQuantity||supply.purchaseUnit!==purchaseUnit||supply.purchasePrice!==purchasePrice);const history=supply?.history?[...supply.history]:[];if(changedPurchase&&supply)history.unshift({id:uid("history"),purchaseQuantity:supply.purchaseQuantity,purchaseUnit:supply.purchaseUnit,purchasePrice:supply.purchasePrice,purchasedAt:supply.updatedAt});onSave({id:supply?.id??uid("supply"),name:name.trim(),category,purchaseQuantity,purchaseUnit,purchasePrice,updatedAt:now,history})}const preview:Supply={id:supply?.id??"preview",name,category,purchaseQuantity,purchaseUnit,purchasePrice,updatedAt:new Date().toISOString(),history:[]};const baseCost=supplyCostPerBaseUnit(preview);const baseLabel=purchaseUnit==="kg"||purchaseUnit==="g"?"cada 1 g":purchaseUnit==="l"||purchaseUnit==="ml"?"cada 1 ml":"cada unidade";return <ModalShell eyebrow={supply?"Atualizar compra":"Novo item"} title={supply?supply.name:"O que você comprou?"} onClose={onClose}><form onSubmit={submit} className="space-y-5"><div><label className={labelClass}>Nome</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Ovo, chocolate, adesivo..." className={inputClass} autoFocus/></div><div><label className={labelClass}>Isso é...</label><div className="grid grid-cols-2 gap-2"><button type="button" onClick={()=>setCategory("ingrediente")} className={`rounded-2xl border p-4 text-left transition ${category==="ingrediente"?"border-[#55281B] bg-[#55281B] text-white":"border-[#E7CFC5] bg-white text-[#55281B]"}`}><Cookie className="mb-2 h-5 w-5"/><span className="block text-sm font-black">Ingrediente</span><span className={`mt-1 block text-xs ${category==="ingrediente"?"text-[#F2C5B5]":"text-[#956454]"}`}>Ovo, farinha, chocolate...</span></button><button type="button" onClick={()=>setCategory("embalagem")} className={`rounded-2xl border p-4 text-left transition ${category==="embalagem"?"border-[#55281B] bg-[#55281B] text-white":"border-[#E7CFC5] bg-white text-[#55281B]"}`}><Package className="mb-2 h-5 w-5"/><span className="block text-sm font-black">Embalagem</span><span className={`mt-1 block text-xs ${category==="embalagem"?"text-[#F2C5B5]":"text-[#956454]"}`}>Caixa, adesivo, fita...</span></button></div></div><div className="grid gap-4 sm:grid-cols-[1fr_0.8fr_1fr]"><div><label className={labelClass}>Quanto veio?</label><input type="number" min="0.001" step="0.001" value={purchaseQuantity} onChange={e=>setPurchaseQuantity(Number(e.target.value))} className={inputClass}/></div><div><label className={labelClass}>Unidade</label><select value={purchaseUnit} onChange={e=>setPurchaseUnit(e.target.value as SupplyUnit)} className={inputClass}><option value="un">unidades</option><option value="g">gramas</option><option value="kg">quilos</option><option value="ml">ml</option><option value="l">litros</option></select></div><div><label className={labelClass}>Quanto pagou?</label><input type="number" min="0" step="0.01" value={purchasePrice} onChange={e=>setPurchasePrice(Number(e.target.value))} className={inputClass}/></div></div>{purchaseQuantity>0&&<div className="rounded-[22px] bg-[#F2C5B5]/45 p-4"><p className="text-xs font-bold text-[#956454]">A conta fica assim</p><p className="mt-1 text-lg font-black text-[#35150A]">{baseLabel} custa {money(baseCost)}.</p>{purchaseUnit==="un"&&purchaseQuantity>1&&<p className="mt-1 text-xs text-[#956454]">Exemplo: se usar meio item na receita, o custo será {money(baseCost/2)}.</p>}</div>}{supply?.history?.length?<details className="rounded-2xl border border-[#E7CFC5] bg-white p-4"><summary className="cursor-pointer text-sm font-black text-[#55281B]">Ver preços anteriores ({supply.history.length})</summary><div className="mt-3 space-y-2">{supply.history.slice(0,6).map(item=><div key={item.id} className="flex justify-between text-xs text-[#956454]"><span>{item.purchaseQuantity} {UNIT_LABELS[item.purchaseUnit]} · {new Intl.DateTimeFormat("pt-BR").format(new Date(item.purchasedAt))}</span><strong>{money(item.purchasePrice)}</strong></div>)}</div></details>:null}<button type="submit" className={`${primaryButton} w-full`}><Check className="h-4 w-4"/> {supply?"Salvar nova compra":"Cadastrar item"}</button></form></ModalShell>}

function ProductModal({product,supplies,settings,onClose,onSave}:{product:Product|null;supplies:Supply[];settings:NatSettings;onClose:()=>void;onSave:(product:Product)=>void}){const[name,setName]=useState(product?.name??"");const[batchYield,setBatchYield]=useState(product?.batchYield??1);const[sellingPrice,setSellingPrice]=useState(product?.sellingPrice??0);const[lossPercent,setLossPercent]=useState(product?.lossPercent??5);const[extraBatchCost,setExtraBatchCost]=useState(product?.extraBatchCost??0);const[minMarginPercent,setMinMarginPercent]=useState(product?.minMarginPercent??settings.defaultMinMarginPercent);const[targetMarginPercent,setTargetMarginPercent]=useState(product?.targetMarginPercent??settings.defaultTargetMarginPercent);const[recipe,setRecipe]=useState<RecipeItem[]>(product?.recipe??[]);function addRecipeItem(){const first=supplies[0];setRecipe(c=>[...c,{id:uid("recipe"),supplyId:first?.id??"",quantity:1,unit:preferredUsageUnit(first)}])}function updateRecipeItem(id:string,patch:Partial<RecipeItem>){setRecipe(c=>c.map(item=>{if(item.id!==id)return item;if(patch.supplyId){const selected=supplies.find(s=>s.id===patch.supplyId);return{...item,...patch,unit:preferredUsageUnit(selected)}}return{...item,...patch}}))}function submit(event:React.FormEvent){event.preventDefault();if(!name.trim()||batchYield<=0)return;const now=new Date().toISOString();onSave({id:product?.id??uid("product"),name:name.trim(),batchYield,sellingPrice,lossPercent,extraBatchCost,minMarginPercent,targetMarginPercent,recipe:recipe.filter(item=>item.supplyId&&item.quantity>=0),createdAt:product?.createdAt??now,updatedAt:now})}const preview:Product={id:product?.id??"preview",name,batchYield,sellingPrice,lossPercent,extraBatchCost,minMarginPercent,targetMarginPercent,recipe,createdAt:product?.createdAt??new Date().toISOString(),updatedAt:new Date().toISOString()};const metrics=productMetrics(preview,supplies,settings.paymentFeePercent);return <ModalShell eyebrow={product?"Editar produto":"Novo produto"} title={product?product.name:"Monte a receita"} onClose={onClose} maxWidth="max-w-3xl"><form onSubmit={submit} className="space-y-6"><div className="grid gap-4 sm:grid-cols-[1.4fr_0.6fr]"><div><label className={labelClass}>Nome do produto</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Brownie tradicional" className={inputClass} autoFocus/></div><div><label className={labelClass}>Essa receita rende...</label><div className="relative"><input type="number" min="1" step="1" value={batchYield} onChange={e=>setBatchYield(Number(e.target.value))} className={`${inputClass} pr-16`}/><span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[#956454]">un.</span></div></div></div><div className="rounded-[24px] border border-[#E7CFC5] bg-white p-4 sm:p-5"><div className="mb-4 flex items-center justify-between gap-3"><div><p className="font-black text-[#55281B]">O que vai nessa receita?</p><p className="mt-1 text-xs text-[#956454]">Use a quantidade da receita inteira, não de uma unidade.</p></div><button type="button" onClick={addRecipeItem} disabled={!supplies.length} className={secondaryButton}><Plus className="h-4 w-4"/> Adicionar</button></div>{!supplies.length?<div className="rounded-2xl bg-[#F8EEE9] p-4 text-sm leading-6 text-[#55281B]">Ainda não há ingredientes ou embalagens cadastrados. Você pode salvar o produto agora e completar a receita depois.</div>:!recipe.length?<button type="button" onClick={addRecipeItem} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#DDBEB2] p-5 text-sm font-black text-[#956454]"><Plus className="h-4 w-4"/> Adicionar primeiro item da receita</button>:<div className="space-y-3">{recipe.map(item=>{const supply=supplies.find(c=>c.id===item.supplyId);return <div key={item.id} className="grid gap-2 rounded-2xl bg-[#F8EEE9] p-3 sm:grid-cols-[1fr_110px_100px_40px] sm:items-center"><select value={item.supplyId} onChange={e=>updateRecipeItem(item.id,{supplyId:e.target.value})} className={inputClass}><option value="">Escolha...</option>{supplies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><input type="number" min="0" step="0.001" value={item.quantity} onChange={e=>updateRecipeItem(item.id,{quantity:Number(e.target.value)})} className={inputClass}/><select value={item.unit} onChange={e=>updateRecipeItem(item.id,{unit:e.target.value as SupplyUnit})} className={inputClass}>{compatibleUnits(supply).map(unit=><option key={unit} value={unit}>{UNIT_LABELS[unit]}</option>)}</select><button type="button" onClick={()=>setRecipe(c=>c.filter(x=>x.id!==item.id))} className="flex h-10 w-10 items-center justify-center rounded-xl text-[#956454] hover:bg-white" aria-label="Remover item"><Trash2 className="h-4 w-4"/></button></div>})}</div>}</div><div className="grid gap-4 sm:grid-cols-3"><div><label className={labelClass}>Perdas estimadas</label><div className="relative"><input type="number" min="0" max="50" step="0.5" value={lossPercent} onChange={e=>setLossPercent(Number(e.target.value))} className={`${inputClass} pr-10`}/><span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[#956454]">%</span></div></div><div><label className={labelClass}>Gás/energia/outros no lote</label><input type="number" min="0" step="0.01" value={extraBatchCost} onChange={e=>setExtraBatchCost(Number(e.target.value))} className={inputClass}/></div><div><label className={labelClass}>Preço que você cobra hoje</label><input type="number" min="0" step="0.01" value={sellingPrice} onChange={e=>setSellingPrice(Number(e.target.value))} className={inputClass}/></div></div><details className="rounded-[22px] border border-[#E7CFC5] bg-white p-4"><summary className="cursor-pointer text-sm font-black text-[#55281B]">Ajustar margens de referência</summary><div className="mt-4 grid gap-4 sm:grid-cols-2"><div><label className={labelClass}>Margem mínima saudável</label><input type="number" min="0" max="90" step="1" value={minMarginPercent} onChange={e=>setMinMarginPercent(Number(e.target.value))} className={inputClass}/></div><div><label className={labelClass}>Margem desejada</label><input type="number" min="0" max="90" step="1" value={targetMarginPercent} onChange={e=>setTargetMarginPercent(Number(e.target.value))} className={inputClass}/></div></div></details><div className="grid gap-3 rounded-[24px] bg-[#F2C5B5]/45 p-4 sm:grid-cols-3"><MiniMetric label="Custo por unidade" value={money(metrics.unitCost)}/><MiniMetric label="Mínimo saudável" value={money(metrics.minPrice)}/><MiniMetric label="Recomendado" value={money(metrics.recommendedPrice)}/></div><button type="submit" className={`${primaryButton} w-full`}><Check className="h-4 w-4"/> Salvar produto</button></form></ModalShell>}

function SettingsModal({settings,onClose,onSave,onSignOut}:{settings:NatSettings;onClose:()=>void;onSave:(settings:NatSettings)=>void;onSignOut:()=>void}){const[draft,setDraft]=useState(settings);return <ModalShell eyebrow="Configurações" title="Deixe a conta com a cara da NAT" onClose={onClose}><form onSubmit={e=>{e.preventDefault();onSave(draft)}} className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><div><label className={labelClass}>Nome do negócio</label><input value={draft.businessName} onChange={e=>setDraft({...draft,businessName:e.target.value})} className={inputClass}/></div><div><label className={labelClass}>Como quer ser chamada?</label><input value={draft.ownerName} onChange={e=>setDraft({...draft,ownerName:e.target.value})} className={inputClass}/></div></div><div><label className={labelClass}>Custos fixos do mês</label><input type="number" min="0" step="0.01" value={draft.monthlyFixedCosts} onChange={e=>setDraft({...draft,monthlyFixedCosts:Number(e.target.value)})} className={inputClass}/><p className="mt-1.5 text-xs leading-5 text-[#956454]">Ex.: internet, aluguel, mensalidades e outros custos que existem mesmo sem produzir.</p></div><div><label className={labelClass}>Taxa média sobre as vendas</label><div className="relative"><input type="number" min="0" max="30" step="0.1" value={draft.paymentFeePercent} onChange={e=>setDraft({...draft,paymentFeePercent:Number(e.target.value)})} className={`${inputClass} pr-10`}/><span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[#956454]">%</span></div><p className="mt-1.5 text-xs leading-5 text-[#956454]">Use 0% se recebe só por Pix sem taxa. Se costuma vender no cartão, informe uma média aproximada.</p></div><details className="rounded-2xl border border-[#E7CFC5] bg-white p-4"><summary className="cursor-pointer text-sm font-black text-[#55281B]">Padrões de novos produtos</summary><div className="mt-4 grid gap-4 sm:grid-cols-2"><div><label className={labelClass}>Margem mínima padrão</label><input type="number" min="0" max="90" value={draft.defaultMinMarginPercent} onChange={e=>setDraft({...draft,defaultMinMarginPercent:Number(e.target.value)})} className={inputClass}/></div><div><label className={labelClass}>Margem recomendada padrão</label><input type="number" min="0" max="90" value={draft.defaultTargetMarginPercent} onChange={e=>setDraft({...draft,defaultTargetMarginPercent:Number(e.target.value)})} className={inputClass}/></div></div></details><button type="submit" className={`${primaryButton} w-full`}><Check className="h-4 w-4"/> Salvar configurações</button><button type="button" onClick={onSignOut} className={`${secondaryButton} w-full sm:hidden`}><LogOut className="h-4 w-4"/> Sair da conta</button></form></ModalShell>}

import { BarChart3, CalendarDays, DatabaseBackup, Download, Package, Plus, ReceiptText, Settings2, ShoppingBasket } from "lucide-react";
import type { CalendarEvent } from "@/domain/calendar";
import { inventoryQuantity, type InventorySnapshot } from "@/domain/inventory";
import { businessInsights, todaySalesSummary } from "@/domain/insights";
import { money, type NatState } from "@/domain/nat";
import { exportNatBackup, exportNatCsv } from "@/lib/export-data";
import { downloadDiagnostics } from "@/lib/telemetry";

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function ActionButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button type="button" className="secondary-button min-h-12 justify-center" onClick={onClick}>{children}</button>;
}

function ChecklistItem({ done, title, text, onClick }: { done: boolean; title: string; text: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex min-h-16 w-full items-start gap-3 rounded-2xl border border-white/15 bg-white/5 p-4 text-left transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
    <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black ${done ? "bg-rose text-chocolate" : "bg-white/10 text-white"}`}>{done ? "✓" : ""}</span>
    <span><strong className="block">{title}</strong><span className="mt-1 block text-sm text-white/70">{text}</span></span>
  </button>;
}

function formatPercent(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "Sem comparação ainda";
  const signal = value > 0 ? "+" : "";
  return `${signal}${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}% vs. 7 dias anteriores`;
}

export function HomeOperations({
  state,
  events,
  inventory,
  onSale,
  onSupplies,
  onProducts,
  onPricing,
  onCalendar,
  onInventory,
}: {
  state: NatState;
  events: CalendarEvent[];
  inventory: InventorySnapshot;
  onSale: () => void;
  onSupplies: () => void;
  onProducts: () => void;
  onPricing: () => void;
  onCalendar: () => void;
  onInventory: () => void;
}) {
  const activeSales = state.sales.filter((sale) => sale.status !== "cancelled" && (sale.transactionType ?? "sale") === "sale");
  const onboarding = [
    { done: state.supplies.length > 0, title: "1. Cadastre uma compra", text: "Informe o que comprou, quanto veio e quanto pagou.", action: onSupplies },
    { done: state.products.some((product) => product.recipe.length > 0), title: "2. Monte uma receita", text: "Escolha os ingredientes e o rendimento do lote.", action: onProducts },
    { done: state.products.some((product) => product.sellingPrice > 0), title: "3. Confira o preço", text: "Veja custo, preço mínimo e recomendado antes de vender.", action: onPricing },
    { done: activeSales.length > 0, title: "4. Registre a primeira venda", text: "A NAT passa a acompanhar receita, sobra e desempenho.", action: onSale },
  ];
  const completed = onboarding.filter((item) => item.done).length;
  const today = todaySalesSummary(state);
  const todayEvents = events.filter((event) => event.eventDate === todayKey() && event.status !== "cancelled");
  const pendingEvents = todayEvents.filter((event) => event.status === "planned");
  const lowStock = inventory.items.filter((item) => item.tracked && item.lowStock);
  const insights = businessInsights(state);

  return <div className="space-y-5">
    {completed < onboarding.length && <section className="rounded-[28px] bg-chocolate p-5 text-white sm:p-7" aria-labelledby="onboarding-title">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-rose">Comece por aqui</p><h2 id="onboarding-title" className="mt-2 font-display text-3xl">Configuração guiada</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">A NAT mostra o próximo passo sem exigir que você entenda dashboards ou automações.</p></div><span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-sm font-bold">{completed}/4</span></div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">{onboarding.map((item) => <ChecklistItem key={item.title} done={item.done} title={item.title} text={item.text} onClick={item.action}/>)}</div>
    </section>}

    <section className="nat-card" aria-labelledby="today-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Central do dia</p><h2 id="today-title" className="section-title">O que importa hoje</h2><p className="mt-1 text-sm text-caramel">Venda, agenda e estoque em um só lugar.</p></div><button type="button" className="primary-button justify-center" onClick={onSale}><Plus size={18}/> Nova venda</button></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl bg-soft p-4"><ReceiptText size={18}/><p className="mt-3 text-xs font-bold uppercase tracking-wider text-caramel">Vendas hoje</p><p className="mt-1 font-display text-3xl">{money(today.revenue)}</p><p className="text-xs text-caramel">{today.sales.length} pedidos • {today.units} unidades</p></div>
        <div className="rounded-2xl bg-soft p-4"><BarChart3 size={18}/><p className="mt-3 text-xs font-bold uppercase tracking-wider text-caramel">Sobrou hoje</p><p className="mt-1 font-display text-3xl">{money(today.contribution)}</p><p className="text-xs text-caramel">antes de custos fixos e gastos do mês</p></div>
        <button type="button" onClick={onCalendar} className="rounded-2xl bg-soft p-4 text-left"><CalendarDays size={18}/><p className="mt-3 text-xs font-bold uppercase tracking-wider text-caramel">Agenda</p><p className="mt-1 font-display text-3xl">{pendingEvents.length}</p><p className="text-xs text-caramel">pendências de hoje</p></button>
        <button type="button" onClick={onInventory} className={`rounded-2xl p-4 text-left ${lowStock.length ? "bg-rose-soft" : "bg-soft"}`}><Package size={18}/><p className="mt-3 text-xs font-bold uppercase tracking-wider text-caramel">Estoque baixo</p><p className="mt-1 font-display text-3xl">{lowStock.length}</p><p className="text-xs text-caramel">itens que pedem atenção</p></button>
      </div>
      {(pendingEvents.length > 0 || lowStock.length > 0) && <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {pendingEvents.length > 0 && <div className="rounded-2xl border border-nat p-4"><p className="font-bold">Próximos compromissos</p><div className="mt-3 space-y-2">{pendingEvents.slice(0, 3).map((event) => <button key={event.id} type="button" onClick={onCalendar} className="flex w-full items-center justify-between gap-3 rounded-xl bg-soft px-3 py-3 text-left"><span className="min-w-0"><span className="block truncate font-bold">{event.title}</span><span className="text-xs text-caramel">{event.eventTime?.slice(0, 5) ?? "Sem horário"}</span></span><CalendarDays size={16}/></button>)}</div></div>}
        {lowStock.length > 0 && <div className="rounded-2xl border border-nat p-4"><p className="font-bold">Comprar ou produzir em breve</p><div className="mt-3 space-y-2">{lowStock.slice(0, 3).map((item) => <button key={`${item.kind}-${item.itemId}`} type="button" onClick={onInventory} className="flex w-full items-center justify-between gap-3 rounded-xl bg-soft px-3 py-3 text-left"><span className="truncate font-bold">{item.name}</span><span className="shrink-0 text-xs text-caramel">{inventoryQuantity(item.currentQuantity, item.baseUnit)}</span></button>)}</div></div>}
      </div>}
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><ActionButton onClick={onSupplies}><ShoppingBasket size={17}/> Nova compra</ActionButton><ActionButton onClick={onProducts}><Package size={17}/> Produtos</ActionButton><ActionButton onClick={onPricing}><Settings2 size={17}/> Preços</ActionButton><ActionButton onClick={onCalendar}><CalendarDays size={17}/> Agenda</ActionButton></div>
    </section>

    <section className="nat-card" aria-labelledby="insights-title"><div className="flex items-start gap-3"><BarChart3 className="mt-1 shrink-0" size={20}/><div><p className="eyebrow">Relatórios úteis</p><h2 id="insights-title" className="section-title">Desempenho com amostra mínima</h2><p className="mt-1 text-sm text-caramel">A NAT só destaca padrões depois de pelo menos 10 vendas distribuídas por 7 dias, para evitar conclusões frágeis.</p></div></div>
      {!insights.readiness.ready ? <div className="mt-5 rounded-2xl bg-soft p-4"><p className="font-bold">Ainda estamos formando uma base confiável.</p><p className="mt-2 text-sm text-caramel">{insights.readiness.missingSales > 0 ? `Faltam ${insights.readiness.missingSales} venda(s). ` : ""}{insights.readiness.missingDays > 0 ? `Faltam ${insights.readiness.missingDays} dia(s) de histórico.` : ""}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-chocolate" style={{ width: `${Math.min(100, Math.max((insights.readiness.salesCount / insights.readiness.minimumSales) * 100, (insights.readiness.spanDays / insights.readiness.minimumDays) * 100))}%` }}/></div></div> : <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl bg-soft p-4"><p className="text-xs font-bold uppercase tracking-wider text-caramel">Ticket médio</p><p className="mt-2 font-display text-3xl">{money(insights.averageTicket)}</p></div>
        <div className="rounded-2xl bg-soft p-4"><p className="text-xs font-bold uppercase tracking-wider text-caramel">Mais vendido</p><p className="mt-2 font-bold">{insights.topProduct?.name ?? "—"}</p><p className="text-xs text-caramel">{insights.topProduct ? `${insights.topProduct.quantity} unidades` : "Sem dados"}</p></div>
        <div className="rounded-2xl bg-soft p-4"><p className="text-xs font-bold uppercase tracking-wider text-caramel">Últimos 7 dias</p><p className="mt-2 font-display text-3xl">{money(insights.currentRevenue)}</p><p className="text-xs text-caramel">{formatPercent(insights.weeklyChangePercent)}</p></div>
        <div className="rounded-2xl bg-soft p-4"><p className="text-xs font-bold uppercase tracking-wider text-caramel">Melhor dia</p><p className="mt-2 font-display text-3xl">{insights.bestDay ? money(insights.bestDay.revenue) : "—"}</p><p className="text-xs text-caramel">{insights.bestDay ? new Intl.DateTimeFormat("pt-BR").format(new Date(`${insights.bestDay.date}T12:00:00`)) : "Sem dados"}</p></div>
      </div>}
    </section>

    <section className="nat-card" aria-labelledby="backup-title"><div className="flex items-start gap-3"><DatabaseBackup className="mt-1 shrink-0" size={20}/><div><p className="eyebrow">Seus dados</p><h2 id="backup-title" className="section-title">Exportação e diagnóstico</h2><p className="mt-1 text-sm text-caramel">Baixe seus dados quando quiser. O CSV abre normalmente no Excel; o backup JSON preserva a estrutura do sistema.</p></div></div><div className="mt-5 grid gap-2 sm:grid-cols-3"><ActionButton onClick={() => exportNatCsv(state)}><Download size={17}/> CSV / Excel</ActionButton><ActionButton onClick={() => exportNatBackup(state)}><DatabaseBackup size={17}/> Backup completo</ActionButton><ActionButton onClick={downloadDiagnostics}><Download size={17}/> Diagnóstico técnico</ActionButton></div><p className="mt-3 text-xs leading-5 text-caramel">O diagnóstico técnico registra apenas erros do navegador, rota, dispositivo e tamanho da tela. Não inclui receitas, vendas nem valores do negócio.</p></section>
  </div>;
}

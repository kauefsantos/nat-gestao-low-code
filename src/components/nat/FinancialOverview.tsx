import { Plus } from "lucide-react";
import { dashboardNumbers, money, type NatState } from "@/domain/nat";
import type { BusinessIntelligenceSnapshot } from "@/data/business-intelligence-repository";
import { Metric } from "./Views";
import { RoiOverview } from "./RoiOverview";

export function FinancialOverview({state,onCashMovement,intelligence=null}:{state:NatState;onCashMovement:()=>void;intelligence?:BusinessIntelligenceSnapshot|null}){
  const numbers=dashboardNumbers(state);
  return <div className="space-y-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Financeiro</p><h2 className="section-title">Caixa e resultado do mês</h2><p className="mt-1 max-w-2xl text-sm text-caramel">Caixa é o dinheiro que entrou e saiu no mês. Capital inicial fica separado dos novos aportes para não distorcer a operação mensal.</p></div><button type="button" className="secondary-button shrink-0 justify-center" onClick={onCashMovement}><Plus size={16}/> Capital, aporte ou retirada</button></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric label="Capital inicial" value={money(numbers.initialCapital)} hint="base de abertura do negócio"/><Metric label="Entrou no caixa" value={money(numbers.cashIn)} hint="clientes + novos aportes do mês"/><Metric label="Saiu do caixa" value={money(numbers.cashOut)} hint="compras, retiradas e demais saídas"/><Metric label="Fluxo de caixa do mês" value={money(numbers.cashAvailable)} hint="entradas menos saídas do mês" tone={numbers.cashAvailable<0?"attention":"default"}/><Metric label="Resultado do negócio" value={money(numbers.estimatedResult)} hint="após custos, gastos e remuneração" tone={numbers.estimatedResult<0?"attention":"default"}/></div>{intelligence&&<RoiOverview snapshot={intelligence} compact/>}</div>;
}

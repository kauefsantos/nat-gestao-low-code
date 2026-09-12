import { Plus } from "lucide-react";
import { dashboardNumbers, money, type NatState } from "@/domain/nat";
import { Metric } from "./Views";
import { RoiOverview } from "./RoiOverview";

export function FinancialOverview({state,onCashMovement}:{state:NatState;onCashMovement:()=>void}){
  const numbers=dashboardNumbers(state);
  return <div className="space-y-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Financeiro</p><h2 className="section-title">Caixa e resultado do mês</h2><p className="mt-1 max-w-2xl text-sm text-caramel">Caixa é o dinheiro que entrou e saiu. Resultado mostra o que as vendas geraram depois dos custos.</p></div><button type="button" className="secondary-button shrink-0 justify-center" onClick={onCashMovement}><Plus size={16}/> Aporte ou retirada</button></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Entrou no caixa" value={money(numbers.cashIn)} hint="clientes + aportes"/><Metric label="Saiu do caixa" value={money(numbers.cashOut)} hint="compras, retiradas e demais saídas"/><Metric label="Caixa real" value={money(numbers.cashAvailable)} hint="entradas menos saídas" tone={numbers.cashAvailable<0?"attention":"default"}/><Metric label="Resultado do negócio" value={money(numbers.estimatedResult)} hint="após custos, gastos e remuneração" tone={numbers.estimatedResult<0?"attention":"default"}/></div><RoiOverview state={state} compact/></div>;
}

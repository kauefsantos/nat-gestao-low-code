import { businessDate } from "../lib/business-time.js";
import { saleValue } from "./receivables.js";
import type { NatState, OwnerCashMovement, Sale, SaleLine, SporadicExpense } from "./types.js";

export function activeSaleLines(sale: Sale): SaleLine[] {
  return sale.items?.length
    ? sale.items
    : [{
        productId: sale.productId,
        productName: sale.productName,
        portfolioKey: sale.portfolioKey ?? null,
        quantity: sale.quantity,
        unitCostSnapshot: sale.unitCostSnapshot,
        laborCostSnapshot: 0,
        unitPriceSnapshot: sale.quantity > 0 ? saleValue(sale) / sale.quantity : 0,
      }];
}

function businessMonthKey(now: Date) {
  return businessDate(now).slice(0, 7);
}

export function monthSales(sales: Sale[], now = new Date()) {
  const monthKey = businessMonthKey(now);
  return sales.filter((sale) => sale.status !== "cancelled" && businessDate(new Date(sale.soldAt)).slice(0, 7) === monthKey);
}

function monthExpenses(expenses: SporadicExpense[], now = new Date()) {
  const monthKey = businessMonthKey(now);
  return expenses.filter((expense) => expense.spentAt.slice(0, 7) === monthKey);
}

function monthOwnerCashMovements(movements: OwnerCashMovement[], now = new Date()) {
  const monthKey = businessMonthKey(now);
  return movements.filter((movement) => movement.occurredAt.slice(0, 7) === monthKey);
}

export function dashboardNumbers(state: NatState) {
  const movements = monthSales(state.sales);
  const commercialSales = movements.filter((sale) => (sale.transactionType ?? "sale") === "sale");
  const expenses = monthExpenses(state.expenses);
  const ownerCash = monthOwnerCashMovements(state.ownerCashMovements ?? []);
  const ownerContributions = ownerCash.filter((movement) => movement.movementType === "contribution").reduce((sum, movement) => sum + movement.amount, 0);
  const ownerWithdrawals = ownerCash.filter((movement) => movement.movementType === "withdrawal").reduce((sum, movement) => sum + movement.amount, 0);
  const revenue = commercialSales.reduce((sum, sale) => sum + saleValue(sale), 0);
  const receivedCash = commercialSales.reduce((sum, sale) => sum + sale.totalReceived, 0);
  const receivables = commercialSales.filter((sale) => sale.paymentStatus === "pending").reduce((sum, sale) => sum + saleValue(sale), 0);
  const units = commercialSales.reduce((sum, sale) => sum + activeSaleLines(sale).reduce((lineSum, line) => lineSum + line.quantity, 0), 0);
  const contribution = movements.reduce((sum, sale) => sum + sale.contributionSnapshot, 0);
  const ownerRemuneration = movements.reduce((sum, sale) => sum + activeSaleLines(sale).reduce((lineSum, line) => lineSum + (line.laborCostSnapshot ?? 0) * line.quantity, 0), 0);
  const sporadicExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const resultBeforeOwner = contribution + ownerRemuneration - state.settings.monthlyFixedCosts - sporadicExpenses;
  const estimatedResult = contribution - state.settings.monthlyFixedCosts - sporadicExpenses;
  const cashIn = receivedCash + ownerContributions;
  const cashOut = (state.purchaseCashOut ?? 0) + sporadicExpenses + state.settings.monthlyFixedCosts + ownerWithdrawals;
  const cashAvailable = cashIn - cashOut;
  const cashAfterOwner = cashAvailable - ownerRemuneration;

  const byProduct = new Map<string, { name: string; quantity: number }>();
  for (const sale of commercialSales) {
    for (const line of activeSaleLines(sale)) {
      const current = byProduct.get(line.productId) ?? { name: line.productName, quantity: 0 };
      current.quantity += line.quantity;
      byProduct.set(line.productId, current);
    }
  }
  const topProduct = [...byProduct.values()].sort((a, b) => b.quantity - a.quantity)[0] ?? null;

  return {
    sales: commercialSales,
    movements,
    expenses,
    ownerCash,
    revenue,
    receivedCash,
    receivables,
    units,
    contribution,
    ownerRemuneration,
    sporadicExpenses,
    resultBeforeOwner,
    estimatedResult,
    cashIn,
    cashOut,
    cashAvailable,
    cashAfterOwner,
    purchaseCashOut: state.purchaseCashOut ?? 0,
    ownerContributions,
    ownerWithdrawals,
    topProduct,
  };
}

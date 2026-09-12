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
        unitPriceSnapshot: sale.quantity > 0 ? sale.totalReceived / sale.quantity : 0,
      }];
}

export function monthSales(sales: Sale[], now = new Date()) {
  return sales.filter((sale) => {
    if (sale.status === "cancelled") return false;
    const date = new Date(sale.soldAt);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  });
}

function monthExpenses(expenses: SporadicExpense[], now = new Date()) {
  return expenses.filter((expense) => {
    const date = new Date(`${expense.spentAt.slice(0, 10)}T12:00:00`);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  });
}

function monthOwnerCashMovements(movements: OwnerCashMovement[], now = new Date()) {
  return movements.filter((movement) => {
    const date = new Date(`${movement.occurredAt.slice(0, 10)}T12:00:00`);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  });
}

export function dashboardNumbers(state: NatState) {
  const movements = monthSales(state.sales);
  const commercialSales = movements.filter((sale) => (sale.transactionType ?? "sale") === "sale");
  const expenses = monthExpenses(state.expenses);
  const ownerCash = monthOwnerCashMovements(state.ownerCashMovements ?? []);
  const ownerContributions = ownerCash.filter((movement) => movement.movementType === "contribution").reduce((sum, movement) => sum + movement.amount, 0);
  const ownerWithdrawals = ownerCash.filter((movement) => movement.movementType === "withdrawal").reduce((sum, movement) => sum + movement.amount, 0);
  const revenue = commercialSales.reduce((sum, sale) => sum + sale.totalReceived, 0);
  const units = commercialSales.reduce((sum, sale) => sum + activeSaleLines(sale).reduce((lineSum, line) => lineSum + line.quantity, 0), 0);
  const contribution = movements.reduce((sum, sale) => sum + sale.contributionSnapshot, 0);
  const ownerRemuneration = movements.reduce((sum, sale) => sum + activeSaleLines(sale).reduce((lineSum, line) => lineSum + (line.laborCostSnapshot ?? 0) * line.quantity, 0), 0);
  const sporadicExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const resultBeforeOwner = contribution + ownerRemuneration - state.settings.monthlyFixedCosts - sporadicExpenses;
  const estimatedResult = contribution - state.settings.monthlyFixedCosts - sporadicExpenses;
  const cashIn = revenue + ownerContributions;
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

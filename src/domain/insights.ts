import { activeSaleLines, type NatState, type Sale } from "./nat.js";

function localDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function activeMovements(state: NatState) {
  return state.sales.filter((sale) => sale.status !== "cancelled");
}

function activeSales(state: NatState) {
  return activeMovements(state).filter((sale) => (sale.transactionType ?? "sale") === "sale");
}

export function todaySalesSummary(state: NatState, now = new Date()) {
  const key = localDateKey(now);
  const movements = activeMovements(state).filter((sale) => localDateKey(sale.soldAt) === key);
  const sales = movements.filter((sale) => (sale.transactionType ?? "sale") === "sale");
  return {
    sales,
    movements,
    revenue: sales.reduce((sum, sale) => sum + sale.totalReceived, 0),
    contribution: movements.reduce((sum, sale) => sum + sale.contributionSnapshot, 0),
    units: sales.reduce((sum, sale) => sum + activeSaleLines(sale).reduce((lineSum, line) => lineSum + line.quantity, 0), 0),
  };
}

function salesBetween(sales: Sale[], start: Date, end: Date) {
  return sales.filter((sale) => {
    const date = new Date(sale.soldAt);
    return date >= start && date < end;
  });
}

export function insightReadiness(state: NatState) {
  const sales = activeSales(state);
  const distinctSalesDays = new Set(sales.map((sale) => localDateKey(sale.soldAt))).size;
  const minimumSales = 10;
  const minimumDays = 7;
  return {
    ready: sales.length >= minimumSales && distinctSalesDays >= minimumDays,
    salesCount: sales.length,
    spanDays: distinctSalesDays,
    distinctSalesDays,
    minimumSales,
    minimumDays,
    missingSales: Math.max(0, minimumSales - sales.length),
    missingDays: Math.max(0, minimumDays - distinctSalesDays),
  };
}

export function businessInsights(state: NatState, now = new Date()) {
  const sales = activeSales(state);
  const readiness = insightReadiness(state);
  const revenue = sales.reduce((sum, sale) => sum + sale.totalReceived, 0);
  const averageTicket = sales.length ? revenue / sales.length : 0;
  const productMap = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const sale of sales) {
    for (const line of activeSaleLines(sale)) {
      const key = line.productId || line.productName;
      const current = productMap.get(key) ?? { name: line.productName, quantity: 0, revenue: 0 };
      current.quantity += line.quantity;
      current.revenue += line.unitPriceSnapshot * line.quantity;
      productMap.set(key, current);
    }
  }
  const topProduct = [...productMap.values()].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)[0] ?? null;
  const dayMap = new Map<string, number>();
  for (const sale of sales) { const key = localDateKey(sale.soldAt); dayMap.set(key, (dayMap.get(key) ?? 0) + sale.totalReceived); }
  const bestDayEntry = [...dayMap.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  const end = new Date(now); end.setHours(24, 0, 0, 0);
  const currentStart = new Date(end); currentStart.setDate(currentStart.getDate() - 7);
  const previousStart = new Date(currentStart); previousStart.setDate(previousStart.getDate() - 7);
  const currentRevenue = salesBetween(sales, currentStart, end).reduce((sum, sale) => sum + sale.totalReceived, 0);
  const previousRevenue = salesBetween(sales, previousStart, currentStart).reduce((sum, sale) => sum + sale.totalReceived, 0);
  const weeklyChangePercent = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : null;
  return { readiness,averageTicket,topProduct,bestDay:bestDayEntry?{date:bestDayEntry[0],revenue:bestDayEntry[1]}:null,currentRevenue,previousRevenue,weeklyChangePercent };
}

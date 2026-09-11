import { activeSaleLines, type NatState, type Sale } from "./nat";

function localDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function activeSales(state: NatState) {
  return state.sales.filter((sale) => sale.status !== "cancelled");
}

export function todaySalesSummary(state: NatState, now = new Date()) {
  const key = localDateKey(now);
  const sales = activeSales(state).filter((sale) => localDateKey(sale.soldAt) === key);
  return {
    sales,
    revenue: sales.reduce((sum, sale) => sum + sale.totalReceived, 0),
    contribution: sales.reduce((sum, sale) => sum + sale.contributionSnapshot, 0),
    units: sales.reduce((sum, sale) => sum + activeSaleLines(sale).reduce((lineSum, line) => lineSum + line.quantity, 0), 0),
  };
}

function differenceInCalendarDays(a: Date, b: Date) {
  const start = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((end - start) / 86_400_000);
}

function salesBetween(sales: Sale[], start: Date, end: Date) {
  return sales.filter((sale) => {
    const date = new Date(sale.soldAt);
    return date >= start && date < end;
  });
}

export function insightReadiness(state: NatState, now = new Date()) {
  const sales = activeSales(state).sort((a, b) => new Date(a.soldAt).getTime() - new Date(b.soldAt).getTime());
  const first = sales[0] ? new Date(sales[0].soldAt) : now;
  const spanDays = sales.length ? differenceInCalendarDays(first, now) + 1 : 0;
  const minimumSales = 10;
  const minimumDays = 7;
  return {
    ready: sales.length >= minimumSales && spanDays >= minimumDays,
    salesCount: sales.length,
    spanDays,
    minimumSales,
    minimumDays,
    missingSales: Math.max(0, minimumSales - sales.length),
    missingDays: Math.max(0, minimumDays - spanDays),
  };
}

export function businessInsights(state: NatState, now = new Date()) {
  const sales = activeSales(state);
  const readiness = insightReadiness(state, now);
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
  for (const sale of sales) {
    const key = localDateKey(sale.soldAt);
    dayMap.set(key, (dayMap.get(key) ?? 0) + sale.totalReceived);
  }
  const bestDayEntry = [...dayMap.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  const currentStart = new Date(end);
  currentStart.setDate(currentStart.getDate() - 7);
  const previousStart = new Date(currentStart);
  previousStart.setDate(previousStart.getDate() - 7);
  const currentRevenue = salesBetween(sales, currentStart, end).reduce((sum, sale) => sum + sale.totalReceived, 0);
  const previousRevenue = salesBetween(sales, previousStart, currentStart).reduce((sum, sale) => sum + sale.totalReceived, 0);
  const weeklyChangePercent = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : null;

  return {
    readiness,
    averageTicket,
    topProduct,
    bestDay: bestDayEntry ? { date: bestDayEntry[0], revenue: bestDayEntry[1] } : null,
    currentRevenue,
    previousRevenue,
    weeklyChangePercent,
  };
}

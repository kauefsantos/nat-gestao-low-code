import { activeSaleLines, type NatState, type Sale } from "./nat.js";

export const BUSINESS_TIME_ZONE = "America/Sao_Paulo";
const BUSINESS_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

export function businessDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = Object.fromEntries(BUSINESS_DATE_FORMATTER.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftDateKey(key: string, days: number) {
  const [year,month,day] = key.split("-").map(Number);
  const shifted = new Date(Date.UTC(year,month-1,day+days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth()+1).padStart(2,"0")}-${String(shifted.getUTCDate()).padStart(2,"0")}`;
}

function activeMovements(state: NatState) {
  return state.sales.filter((sale) => sale.status !== "cancelled");
}

function activeSales(state: NatState) {
  return activeMovements(state).filter((sale) => (sale.transactionType ?? "sale") === "sale");
}

export function todaySalesSummary(state: NatState, now = new Date()) {
  const key = businessDateKey(now);
  const movements = activeMovements(state).filter((sale) => businessDateKey(sale.soldAt) === key);
  const sales = movements.filter((sale) => (sale.transactionType ?? "sale") === "sale");
  return {
    sales,
    movements,
    revenue: sales.reduce((sum, sale) => sum + sale.totalReceived, 0),
    contribution: movements.reduce((sum, sale) => sum + sale.contributionSnapshot, 0),
    units: sales.reduce((sum, sale) => sum + activeSaleLines(sale).reduce((lineSum, line) => lineSum + line.quantity, 0), 0),
  };
}

function salesBetweenDateKeys(sales: Sale[], startKey: string, endKey: string) {
  return sales.filter((sale) => {
    const key = businessDateKey(sale.soldAt);
    return key >= startKey && key <= endKey;
  });
}

export function insightReadiness(state: NatState) {
  const sales = activeSales(state);
  const distinctSalesDays = new Set(sales.map((sale) => businessDateKey(sale.soldAt))).size;
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
  for (const sale of sales) { const key = businessDateKey(sale.soldAt); dayMap.set(key, (dayMap.get(key) ?? 0) + sale.totalReceived); }
  const bestDayEntry = [...dayMap.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  const todayKey = businessDateKey(now);
  const currentStartKey = shiftDateKey(todayKey,-6);
  const previousEndKey = shiftDateKey(todayKey,-7);
  const previousStartKey = shiftDateKey(todayKey,-13);
  const currentRevenue = salesBetweenDateKeys(sales,currentStartKey,todayKey).reduce((sum, sale) => sum + sale.totalReceived, 0);
  const previousRevenue = salesBetweenDateKeys(sales,previousStartKey,previousEndKey).reduce((sum, sale) => sum + sale.totalReceived, 0);
  const weeklyChangePercent = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : null;
  return { readiness,averageTicket,topProduct,bestDay:bestDayEntry?{date:bestDayEntry[0],revenue:bestDayEntry[1]}:null,currentRevenue,previousRevenue,weeklyChangePercent };
}

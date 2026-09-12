import { activeSaleLines } from "./finance.js";
import type { NatState, Sale, SaleChannel } from "./types.js";

export type ProductProfitability = {
  productId: string;
  name: string;
  units: number;
  orders: number;
  revenue: number;
  productCost: number;
  labor: number;
  allocatedFee: number;
  allocatedDelivery: number;
  contribution: number;
  marginPercent: number;
  averageOrderTicket: number;
};

export function productProfitability(state: NatState): ProductProfitability[] {
  const map = new Map<string, ProductProfitability & { orderIds: Set<string> }>();
  const sales = state.sales.filter((sale) => sale.status !== "cancelled" && (sale.transactionType ?? "sale") === "sale");

  for (const sale of sales) {
    const lines = activeSaleLines(sale);
    const revenueBase = lines.reduce((sum, line) => sum + line.unitPriceSnapshot * line.quantity, 0) || sale.totalReceived || 1;
    for (const line of lines) {
      const lineRevenue = line.unitPriceSnapshot * line.quantity;
      const share = revenueBase > 0 ? lineRevenue / revenueBase : 1 / lines.length;
      const cost = line.unitCostSnapshot * line.quantity;
      const fee = (sale.variableFeeSnapshot ?? 0) * share;
      const delivery = (sale.deliveryCostSnapshot ?? 0) * share;
      const contribution = lineRevenue - cost - fee - delivery;
      const current = map.get(line.productId) ?? {
        productId: line.productId,
        name: line.productName,
        units: 0,
        orders: 0,
        revenue: 0,
        productCost: 0,
        labor: 0,
        allocatedFee: 0,
        allocatedDelivery: 0,
        contribution: 0,
        marginPercent: 0,
        averageOrderTicket: 0,
        orderIds: new Set<string>(),
      };
      current.units += line.quantity;
      current.revenue += lineRevenue;
      current.productCost += cost;
      current.labor += (line.laborCostSnapshot ?? 0) * line.quantity;
      current.allocatedFee += fee;
      current.allocatedDelivery += delivery;
      current.contribution += contribution;
      current.orderIds.add(sale.id);
      map.set(line.productId, current);
    }
  }

  return [...map.values()].map(({ orderIds, ...row }) => ({
    ...row,
    orders: orderIds.size,
    marginPercent: row.revenue > 0 ? row.contribution / row.revenue * 100 : 0,
    averageOrderTicket: orderIds.size ? row.revenue / orderIds.size : 0,
  })).sort((a, b) => b.contribution - a.contribution);
}

export function channelAnalytics(state: NatState) {
  const map = new Map<SaleChannel, { channel: SaleChannel; orders: number; revenue: number; contribution: number }>();
  for (const sale of state.sales.filter((row) => row.status !== "cancelled" && (row.transactionType ?? "sale") === "sale")) {
    const channel = sale.saleChannel ?? "other";
    const current = map.get(channel) ?? { channel, orders: 0, revenue: 0, contribution: 0 };
    current.orders += 1;
    current.revenue += sale.totalReceived;
    current.contribution += sale.contributionSnapshot;
    map.set(channel, current);
  }
  return [...map.values()].map((row) => ({ ...row, ticket: row.orders ? row.revenue / row.orders : 0 })).sort((a, b) => b.revenue - a.revenue);
}

export function productPairs(state: NatState) {
  const map = new Map<string, { a: string; b: string; count: number }>();
  for (const sale of state.sales.filter((row) => row.status !== "cancelled" && (row.transactionType ?? "sale") === "sale")) {
    const names = [...new Set(activeSaleLines(sale).map((line) => line.productName))].sort();
    for (let i = 0; i < names.length; i += 1) {
      for (let j = i + 1; j < names.length; j += 1) {
        const key = `${names[i]}|${names[j]}`;
        const row = map.get(key) ?? { a: names[i], b: names[j], count: 0 };
        row.count += 1;
        map.set(key, row);
      }
    }
  }
  return [...map.values()].filter((row) => row.count >= 2).sort((a, b) => b.count - a.count);
}

function paidCustomerSales(state: NatState) {
  return state.sales.filter((sale) => sale.status !== "cancelled" && (sale.transactionType ?? "sale") === "sale" && sale.customerId);
}

function customerSaleMap(sales: Sale[]) {
  const byCustomer = new Map<string, Sale[]>();
  for (const sale of sales) {
    const list = byCustomer.get(sale.customerId!) ?? [];
    list.push(sale);
    byCustomer.set(sale.customerId!, list);
  }
  return byCustomer;
}

export function cohortAnalytics(state: NatState) {
  const cohorts = new Map<string, { cohort: string; customers: number; repurchased: number }>();
  for (const sales of customerSaleMap(paidCustomerSales(state)).values()) {
    sales.sort((a, b) => +new Date(a.soldAt) - +new Date(b.soldAt));
    const date = new Date(sales[0].soldAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const row = cohorts.get(key) ?? { cohort: key, customers: 0, repurchased: 0 };
    row.customers += 1;
    if (sales.length >= 2) row.repurchased += 1;
    cohorts.set(key, row);
  }
  return [...cohorts.values()].map((row) => ({ ...row, repurchaseRate: row.customers ? row.repurchased / row.customers * 100 : 0 })).sort((a, b) => a.cohort.localeCompare(b.cohort));
}

export function averageSecondPurchaseDays(state: NatState) {
  const days: number[] = [];
  for (const sales of customerSaleMap(paidCustomerSales(state)).values()) {
    if (sales.length < 2) continue;
    sales.sort((a, b) => +new Date(a.soldAt) - +new Date(b.soldAt));
    days.push((+new Date(sales[1].soldAt) - +new Date(sales[0].soldAt)) / 86_400_000);
  }
  return { sample: days.length, days: days.length ? days.reduce((a, b) => a + b, 0) / days.length : null, baseSmall: days.length < 5 };
}

export function promotionAnalytics(state: NatState) {
  const sales = state.sales.filter((sale) => sale.status !== "cancelled" && (sale.transactionType ?? "sale") === "sale");
  let discountedOrders = 0;
  let discountValue = 0;
  let contribution = 0;
  for (const sale of sales) {
    const list = activeSaleLines(sale).reduce((sum, line) => {
      const product = state.products.find((candidate) => candidate.id === line.productId);
      return sum + (product?.sellingPrice ?? line.unitPriceSnapshot) * line.quantity;
    }, 0);
    if (sale.totalReceived + 0.005 < list) {
      discountedOrders += 1;
      discountValue += list - sale.totalReceived;
      contribution += sale.contributionSnapshot;
    }
  }
  return { discountedOrders, discountValue, contribution };
}

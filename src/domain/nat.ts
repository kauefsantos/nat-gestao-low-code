export type SupplyCategory = "ingredient" | "packaging" | "other";
export type Unit = "g" | "kg" | "ml" | "l" | "unit";
export type PaymentMethod = "pix" | "cash" | "card" | "other";
export type SaleStatus = "completed" | "cancelled";

export type Supply = { id: string; name: string; category: SupplyCategory; packageQuantity: number; packageUnit: Unit; packagePrice: number; purchasedAt: string };
export type RecipeItem = { id: string; supplyId: string; quantity: number; unit: Unit };
export type Product = { id: string; name: string; portfolioKey?: string | null; available?: boolean; batchYield: number; sellingPrice: number; lossPercent: number; productionCostPerBatch: number; minimumMarginPercent: number; targetMarginPercent: number; recipe: RecipeItem[] };
export type SaleLine = { id?: string; productId: string; productName: string; portfolioKey?: string | null; quantity: number; unitCostSnapshot: number; unitPriceSnapshot: number };
export type Sale = {
  id: string;
  productId: string;
  productName: string;
  portfolioKey?: string | null;
  quantity: number;
  totalReceived: number;
  paymentMethod: PaymentMethod;
  soldAt: string;
  unitCostSnapshot: number;
  variableFeeSnapshot: number;
  contributionSnapshot: number;
  items: SaleLine[];
  status: SaleStatus;
  cancelledAt?: string | null;
  cancelReason?: string | null;
};
export type SporadicExpense = { id: string; name: string; amount: number; spentAt: string };
export type Settings = { ownerName: string; monthlyFixedCosts: number; paymentFeePercent: number; defaultMinimumMarginPercent: number; defaultTargetMarginPercent: number };
export type NatState = { version: 3; supplies: Supply[]; products: Product[]; sales: Sale[]; expenses: SporadicExpense[]; settings: Settings };

export const initialState: NatState = { version: 3, supplies: [], products: [], sales: [], expenses: [], settings: { ownerName: "NAT", monthlyFixedCosts: 0, paymentFeePercent: 0, defaultMinimumMarginPercent: 35, defaultTargetMarginPercent: 50 } };
export const unitLabel: Record<Unit, string> = { g: "g", kg: "kg", ml: "ml", l: "L", unit: "un" };
export const paymentLabel: Record<PaymentMethod, string> = { pix: "Pix", cash: "Dinheiro", card: "Cartão", other: "Outro" };

export function id(_prefix: string) { return crypto.randomUUID(); }
export function money(value: number) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
export function percent(value: number) {
  if (!Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}%`;
}

type Dimension = "mass" | "volume" | "unit";
function baseQuantity(quantity: number, unit: Unit): { value: number; dimension: Dimension } {
  switch (unit) {
    case "kg": return { value: quantity * 1000, dimension: "mass" };
    case "g": return { value: quantity, dimension: "mass" };
    case "l": return { value: quantity * 1000, dimension: "volume" };
    case "ml": return { value: quantity, dimension: "volume" };
    case "unit": return { value: quantity, dimension: "unit" };
  }
}
export function compatibleUnits(unit: Unit): Unit[] {
  if (unit === "kg" || unit === "g") return ["g", "kg"];
  if (unit === "l" || unit === "ml") return ["ml", "l"];
  return ["unit"];
}
export function preferredUsageUnit(unit: Unit): Unit {
  if (unit === "kg" || unit === "g") return "g";
  if (unit === "l" || unit === "ml") return "ml";
  return "unit";
}
export function supplyUnitCost(supply: Supply) {
  const base = baseQuantity(supply.packageQuantity, supply.packageUnit);
  return base.value > 0 ? supply.packagePrice / base.value : Number.NaN;
}
export function supplyUsageCost(supply: Supply, quantity: number, unit: Unit) {
  const packageBase = baseQuantity(supply.packageQuantity, supply.packageUnit);
  const usageBase = baseQuantity(quantity, unit);
  if (packageBase.dimension !== usageBase.dimension || packageBase.value <= 0 || usageBase.value <= 0) return Number.NaN;
  return (supply.packagePrice / packageBase.value) * usageBase.value;
}

export type ProductCost = {
  ingredientBatch: number; packagingBatch: number; productionBatch: number; lossBatch: number; totalBatch: number; unitCost: number;
  minimumPrice: number; recommendedPrice: number; contributionAtCurrentPrice: number; marginAtCurrentPrice: number;
  recipeValid: boolean; pricingValid: boolean;
};
export function productCost(product: Product, supplies: Supply[], paymentFeePercent: number): ProductCost {
  let ingredientBatch = 0; let packagingBatch = 0; let recipeValid = true;
  for (const item of product.recipe) {
    const supply = supplies.find((candidate) => candidate.id === item.supplyId);
    if (!supply) { recipeValid = false; continue; }
    const cost = supplyUsageCost(supply, item.quantity, item.unit);
    if (!Number.isFinite(cost)) { recipeValid = false; continue; }
    if (supply.category === "packaging") packagingBatch += cost; else ingredientBatch += cost;
  }
  const productionBatch = Math.max(0, product.productionCostPerBatch);
  const beforeLoss = recipeValid ? ingredientBatch + packagingBatch + productionBatch : Number.NaN;
  const lossBatch = Number.isFinite(beforeLoss) ? beforeLoss * Math.max(0, product.lossPercent) / 100 : Number.NaN;
  const totalBatch = beforeLoss + lossBatch;
  const unitCost = product.batchYield > 0 && Number.isFinite(totalBatch) ? totalBatch / product.batchYield : Number.NaN;
  const fee = Math.max(0, paymentFeePercent) / 100;
  const minimumMargin = Math.max(0, product.minimumMarginPercent) / 100;
  const targetMargin = Math.max(0, product.targetMarginPercent) / 100;
  const minimumDenominator = 1 - minimumMargin - fee;
  const targetDenominator = 1 - targetMargin - fee;
  const pricingValid = minimumDenominator > 0 && targetDenominator > 0;
  const minimumPrice = pricingValid && Number.isFinite(unitCost) ? unitCost / minimumDenominator : Number.NaN;
  const recommendedPrice = pricingValid && Number.isFinite(unitCost) ? unitCost / targetDenominator : Number.NaN;
  const variableFee = product.sellingPrice * fee;
  const contributionAtCurrentPrice = Number.isFinite(unitCost) ? product.sellingPrice - unitCost - variableFee : Number.NaN;
  const marginAtCurrentPrice = product.sellingPrice > 0 && Number.isFinite(contributionAtCurrentPrice) ? contributionAtCurrentPrice / product.sellingPrice * 100 : Number.NaN;
  return { ingredientBatch, packagingBatch, productionBatch, lossBatch, totalBatch, unitCost, minimumPrice, recommendedPrice, contributionAtCurrentPrice, marginAtCurrentPrice, recipeValid, pricingValid };
}

export function activeSaleLines(sale: Sale): SaleLine[] {
  return sale.items?.length ? sale.items : [{ productId: sale.productId, productName: sale.productName, portfolioKey: sale.portfolioKey ?? null, quantity: sale.quantity, unitCostSnapshot: sale.unitCostSnapshot, unitPriceSnapshot: sale.quantity > 0 ? sale.totalReceived / sale.quantity : 0 }];
}

export function monthSales(sales: Sale[], now = new Date()) {
  return sales.filter((sale) => {
    if (sale.status === "cancelled") return false;
    const date = new Date(sale.soldAt);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  });
}
function monthExpenses(expenses: SporadicExpense[], now = new Date()) {
  return expenses.filter((expense) => { const date = new Date(`${expense.spentAt.slice(0,10)}T12:00:00`); return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth(); });
}
export function dashboardNumbers(state: NatState) {
  const sales = monthSales(state.sales);
  const expenses = monthExpenses(state.expenses);
  const revenue = sales.reduce((sum, sale) => sum + sale.totalReceived, 0);
  const units = sales.reduce((sum, sale) => sum + activeSaleLines(sale).reduce((lineSum,line) => lineSum + line.quantity,0), 0);
  const contribution = sales.reduce((sum, sale) => sum + sale.contributionSnapshot, 0);
  const sporadicExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const estimatedResult = contribution - state.settings.monthlyFixedCosts - sporadicExpenses;
  const byProduct = new Map<string, { name: string; quantity: number }>();
  for (const sale of sales) {
    for (const line of activeSaleLines(sale)) {
      const current = byProduct.get(line.productId) ?? { name: line.productName, quantity: 0 };
      current.quantity += line.quantity;
      byProduct.set(line.productId, current);
    }
  }
  const topProduct = [...byProduct.values()].sort((a,b) => b.quantity - a.quantity)[0] ?? null;
  return { sales, expenses, revenue, units, contribution, sporadicExpenses, estimatedResult, topProduct };
}

export function buildSaleOrder(args: { items: Array<{ product: Product; quantity: number }>; supplies: Supply[]; paymentFeePercent: number; totalReceived: number; paymentMethod: PaymentMethod; soldAt: string }): Sale {
  if (!args.items.length) throw new Error("Adicione pelo menos um produto à venda.");
  const seen = new Set<string>();
  let totalCost = 0;
  let totalQuantity = 0;
  let listTotal = 0;
  const prepared = args.items.map(({ product, quantity }) => {
    if (product.available === false) throw new Error(`${product.name} está pausado e não pode entrar em uma nova venda.`);
    if (seen.has(product.id)) throw new Error("O mesmo produto não pode aparecer duas vezes na venda.");
    seen.add(product.id);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("A quantidade precisa ser maior que zero.");
    const metrics = productCost(product,args.supplies,args.paymentFeePercent);
    if (!metrics.recipeValid || !Number.isFinite(metrics.unitCost)) throw new Error("Não foi possível calcular o custo desta venda.");
    totalCost += metrics.unitCost * quantity;
    totalQuantity += quantity;
    listTotal += product.sellingPrice * quantity;
    return { product, quantity, unitCost: metrics.unitCost, listValue: product.sellingPrice * quantity };
  });
  const variableFeeSnapshot = args.totalReceived * Math.max(0,args.paymentFeePercent) / 100;
  const contributionSnapshot = args.totalReceived - totalCost - variableFeeSnapshot;
  const items: SaleLine[] = prepared.map(({ product,quantity,unitCost,listValue }) => {
    const lineRevenue = listTotal > 0 ? args.totalReceived * listValue / listTotal : args.totalReceived * quantity / totalQuantity;
    return { productId: product.id, productName: product.name, portfolioKey: product.portfolioKey ?? null, quantity, unitCostSnapshot: unitCost, unitPriceSnapshot: lineRevenue / quantity };
  });
  const first = items[0];
  return {
    id: id("sale"),
    productId: first.productId,
    productName: items.length === 1 ? first.productName : `${items.length} produtos`,
    portfolioKey: items.length === 1 ? first.portfolioKey ?? null : null,
    quantity: totalQuantity,
    totalReceived: args.totalReceived,
    paymentMethod: args.paymentMethod,
    soldAt: args.soldAt,
    unitCostSnapshot: totalQuantity > 0 ? totalCost / totalQuantity : 0,
    variableFeeSnapshot,
    contributionSnapshot,
    items,
    status: "completed",
    cancelledAt: null,
    cancelReason: null,
  };
}

export function buildSale(args: { product: Product; supplies: Supply[]; paymentFeePercent: number; quantity: number; totalReceived: number; paymentMethod: PaymentMethod; soldAt: string }): Sale {
  return buildSaleOrder({ items:[{ product:args.product,quantity:args.quantity }], supplies:args.supplies, paymentFeePercent:args.paymentFeePercent, totalReceived:args.totalReceived, paymentMethod:args.paymentMethod, soldAt:args.soldAt });
}
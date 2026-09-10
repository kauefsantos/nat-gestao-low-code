export type SupplyCategory = "ingredient" | "packaging";
export type Unit = "g" | "kg" | "ml" | "l" | "unit";
export type PaymentMethod = "pix" | "cash" | "card" | "other";

export type Supply = { id: string; name: string; category: SupplyCategory; packageQuantity: number; packageUnit: Unit; packagePrice: number; purchasedAt: string };
export type RecipeItem = { id: string; supplyId: string; quantity: number; unit: Unit };
export type Product = { id: string; name: string; portfolioKey?: string | null; batchYield: number; sellingPrice: number; lossPercent: number; productionCostPerBatch: number; minimumMarginPercent: number; targetMarginPercent: number; recipe: RecipeItem[] };
export type Sale = { id: string; productId: string; productName: string; portfolioKey?: string | null; quantity: number; totalReceived: number; paymentMethod: PaymentMethod; soldAt: string; unitCostSnapshot: number; variableFeeSnapshot: number; contributionSnapshot: number };
export type SporadicExpense = { id: string; name: string; amount: number; spentAt: string };
export type Settings = { ownerName: string; monthlyFixedCosts: number; paymentFeePercent: number; defaultMinimumMarginPercent: number; defaultTargetMarginPercent: number };
export type NatState = { version: 3; supplies: Supply[]; products: Product[]; sales: Sale[]; expenses: SporadicExpense[]; settings: Settings };

export const initialState: NatState = { version: 3, supplies: [], products: [], sales: [], expenses: [], settings: { ownerName: "Natalia", monthlyFixedCosts: 0, paymentFeePercent: 0, defaultMinimumMarginPercent: 35, defaultTargetMarginPercent: 50 } };
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

export function monthSales(sales: Sale[], now = new Date()) {
  return sales.filter((sale) => { const date = new Date(sale.soldAt); return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth(); });
}
export function monthExpenses(expenses: SporadicExpense[], now = new Date()) {
  return expenses.filter((expense) => { const date = new Date(`${expense.spentAt.slice(0,10)}T12:00:00`); return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth(); });
}
export function dashboardNumbers(state: NatState) {
  const sales = monthSales(state.sales);
  const expenses = monthExpenses(state.expenses);
  const revenue = sales.reduce((sum, sale) => sum + sale.totalReceived, 0);
  const units = sales.reduce((sum, sale) => sum + sale.quantity, 0);
  const contribution = sales.reduce((sum, sale) => sum + sale.contributionSnapshot, 0);
  const sporadicExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const estimatedResult = contribution - state.settings.monthlyFixedCosts - sporadicExpenses;
  const byProduct = new Map<string, { name: string; quantity: number }>();
  for (const sale of sales) { const current = byProduct.get(sale.productId) ?? { name: sale.productName, quantity: 0 }; current.quantity += sale.quantity; byProduct.set(sale.productId, current); }
  const topProduct = [...byProduct.values()].sort((a,b) => b.quantity - a.quantity)[0] ?? null;
  return { sales, expenses, revenue, units, contribution, sporadicExpenses, estimatedResult, topProduct };
}

export function buildSale(args: { product: Product; supplies: Supply[]; paymentFeePercent: number; quantity: number; totalReceived: number; paymentMethod: PaymentMethod; soldAt: string }): Sale {
  const metrics = productCost(args.product,args.supplies,args.paymentFeePercent);
  if (!metrics.recipeValid || !Number.isFinite(metrics.unitCost)) throw new Error("Não foi possível calcular o custo desta venda.");
  const variableFeeSnapshot = args.totalReceived * Math.max(0,args.paymentFeePercent) / 100;
  const contributionSnapshot = args.totalReceived - metrics.unitCost * args.quantity - variableFeeSnapshot;
  return { id: id("sale"), productId: args.product.id, productName: args.product.name, portfolioKey: args.product.portfolioKey ?? null, quantity: args.quantity, totalReceived: args.totalReceived, paymentMethod: args.paymentMethod, soldAt: args.soldAt, unitCostSnapshot: metrics.unitCost, variableFeeSnapshot, contributionSnapshot };
}

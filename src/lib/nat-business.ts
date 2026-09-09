export type SupplyCategory = "ingrediente" | "embalagem";
export type SupplyUnit = "g" | "kg" | "ml" | "l" | "un";

export type SupplyHistoryItem = {
  id: string;
  purchaseQuantity: number;
  purchaseUnit: SupplyUnit;
  purchasePrice: number;
  purchasedAt: string;
};

export type Supply = {
  id: string;
  name: string;
  category: SupplyCategory;
  purchaseQuantity: number;
  purchaseUnit: SupplyUnit;
  purchasePrice: number;
  updatedAt: string;
  history: SupplyHistoryItem[];
};

export type RecipeItem = {
  id: string;
  supplyId: string;
  quantity: number;
  unit: SupplyUnit;
};

export type Product = {
  id: string;
  name: string;
  batchYield: number;
  sellingPrice: number;
  lossPercent: number;
  extraBatchCost: number;
  minMarginPercent: number;
  targetMarginPercent: number;
  recipe: RecipeItem[];
  createdAt: string;
  updatedAt: string;
};

export type PaymentMethod = "pix" | "dinheiro" | "cartao" | "outro";

export type Sale = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  totalReceived: number;
  paymentMethod: PaymentMethod;
  soldAt: string;
  unitCostSnapshot: number;
  profitSnapshot: number;
};

export type NatSettings = {
  businessName: string;
  ownerName: string;
  monthlyFixedCosts: number;
  paymentFeePercent: number;
  defaultMinMarginPercent: number;
  defaultTargetMarginPercent: number;
};

export type NatWorkspace = {
  version: 1;
  supplies: Supply[];
  products: Product[];
  sales: Sale[];
  settings: NatSettings;
};

export const EMPTY_WORKSPACE: NatWorkspace = {
  version: 1,
  supplies: [],
  products: [],
  sales: [],
  settings: {
    businessName: "NAT",
    ownerName: "Natalia",
    monthlyFixedCosts: 0,
    paymentFeePercent: 0,
    defaultMinMarginPercent: 35,
    defaultTargetMarginPercent: 50,
  },
};

export const UNIT_LABELS: Record<SupplyUnit, string> = {
  g: "g",
  kg: "kg",
  ml: "ml",
  l: "L",
  un: "un",
};

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  cartao: "Cartão",
  outro: "Outro",
};

export const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number.isFinite(value) ? value : 0,
  );

export const pct = (value: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(
    Number.isFinite(value) ? value : 0,
  ) + "%";

export function uid(prefix = "nat") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

type Dimension = "mass" | "volume" | "unit";

function toBase(quantity: number, unit: SupplyUnit): { quantity: number; dimension: Dimension } {
  switch (unit) {
    case "kg":
      return { quantity: quantity * 1000, dimension: "mass" };
    case "g":
      return { quantity, dimension: "mass" };
    case "l":
      return { quantity: quantity * 1000, dimension: "volume" };
    case "ml":
      return { quantity, dimension: "volume" };
    case "un":
      return { quantity, dimension: "unit" };
  }
}

export function supplyCostPerBaseUnit(supply: Supply) {
  const purchase = toBase(supply.purchaseQuantity, supply.purchaseUnit);
  if (purchase.quantity <= 0) return 0;
  return supply.purchasePrice / purchase.quantity;
}

export function supplyUsageCost(supply: Supply, quantity: number, unit: SupplyUnit) {
  const purchase = toBase(supply.purchaseQuantity, supply.purchaseUnit);
  const usage = toBase(quantity, unit);
  if (purchase.dimension !== usage.dimension || purchase.quantity <= 0) return 0;
  return (supply.purchasePrice / purchase.quantity) * usage.quantity;
}

export type ProductMetrics = {
  ingredientsBatch: number;
  packagingBatch: number;
  recipeBatch: number;
  extraBatch: number;
  lossesBatch: number;
  totalBatch: number;
  unitCost: number;
  minPrice: number;
  recommendedPrice: number;
  profitAtCurrentPrice: number;
  marginAtCurrentPrice: number;
};

export function productMetrics(
  product: Product,
  supplies: Supply[],
  paymentFeePercent = 0,
): ProductMetrics {
  let ingredientsBatch = 0;
  let packagingBatch = 0;

  for (const item of product.recipe) {
    const supply = supplies.find((candidate) => candidate.id === item.supplyId);
    if (!supply) continue;
    const cost = supplyUsageCost(supply, item.quantity, item.unit);
    if (supply.category === "embalagem") packagingBatch += cost;
    else ingredientsBatch += cost;
  }

  const recipeBatch = ingredientsBatch + packagingBatch;
  const extraBatch = Math.max(0, product.extraBatchCost || 0);
  const baseBatch = recipeBatch + extraBatch;
  const lossesBatch = baseBatch * Math.max(0, product.lossPercent || 0) / 100;
  const totalBatch = baseBatch + lossesBatch;
  const unitCost = product.batchYield > 0 ? totalBatch / product.batchYield : 0;

  const fee = Math.max(0, paymentFeePercent || 0) / 100;
  const minMargin = Math.max(0, product.minMarginPercent || 0) / 100;
  const targetMargin = Math.max(0, product.targetMarginPercent || 0) / 100;
  const minDenominator = Math.max(0.05, 1 - minMargin - fee);
  const targetDenominator = Math.max(0.05, 1 - targetMargin - fee);

  const minPrice = unitCost / minDenominator;
  const recommendedPrice = unitCost / targetDenominator;
  const feeAtCurrent = product.sellingPrice * fee;
  const profitAtCurrentPrice = product.sellingPrice - unitCost - feeAtCurrent;
  const marginAtCurrentPrice =
    product.sellingPrice > 0 ? (profitAtCurrentPrice / product.sellingPrice) * 100 : 0;

  return {
    ingredientsBatch,
    packagingBatch,
    recipeBatch,
    extraBatch,
    lossesBatch,
    totalBatch,
    unitCost,
    minPrice,
    recommendedPrice,
    profitAtCurrentPrice,
    marginAtCurrentPrice,
  };
}

export function currentMonthSales(sales: Sale[], now = new Date()) {
  return sales.filter((sale) => {
    const date = new Date(sale.soldAt);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  });
}

export function dayKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function salesChartData(sales: Sale[], days = 14) {
  const now = new Date();
  const points: { key: string; label: string; vendas: number; lucro: number }[] = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - offset);
    const key = dayKey(date);
    const daily = sales.filter((sale) => dayKey(sale.soldAt) === key);
    points.push({
      key,
      label: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date),
      vendas: daily.reduce((sum, sale) => sum + sale.totalReceived, 0),
      lucro: daily.reduce((sum, sale) => sum + sale.profitSnapshot, 0),
    });
  }

  return points;
}
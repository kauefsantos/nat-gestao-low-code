export type SupplyCategory = "ingredient" | "packaging";
export type Unit = "g" | "kg" | "ml" | "l" | "unit";
export type PaymentMethod = "pix" | "cash" | "card" | "other";

export type Supply = {
  id: string;
  name: string;
  category: SupplyCategory;
  packageQuantity: number;
  packageUnit: Unit;
  packagePrice: number;
  purchasedAt: string;
};

export type RecipeItem = {
  id: string;
  supplyId: string;
  quantity: number;
  unit: Unit;
};

export type Product = {
  id: string;
  name: string;
  batchYield: number;
  sellingPrice: number;
  lossPercent: number;
  productionCostPerBatch: number;
  minimumMarginPercent: number;
  targetMarginPercent: number;
  recipe: RecipeItem[];
};

export type Sale = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  totalReceived: number;
  paymentMethod: PaymentMethod;
  soldAt: string;
  unitCostSnapshot: number;
  variableFeeSnapshot: number;
  contributionSnapshot: number;
};

export type Settings = {
  ownerName: string;
  monthlyFixedCosts: number;
  paymentFeePercent: number;
  defaultMinimumMarginPercent: number;
  defaultTargetMarginPercent: number;
};

export type NatState = {
  version: 2;
  supplies: Supply[];
  products: Product[];
  sales: Sale[];
  settings: Settings;
};

export const initialState: NatState = {
  version: 2,
  supplies: [],
  products: [],
  sales: [],
  settings: {
    ownerName: "Natalia",
    monthlyFixedCosts: 0,
    paymentFeePercent: 0,
    defaultMinimumMarginPercent: 35,
    defaultTargetMarginPercent: 50,
  },
};

export const unitLabel: Record<Unit, string> = {
  g: "g",
  kg: "kg",
  ml: "ml",
  l: "L",
  unit: "un",
};

export const paymentLabel: Record<PaymentMethod, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  card: "Cartão",
  other: "Outro",
};

// IDs are persisted in PostgreSQL uuid columns, so the app must use bare UUIDs.
export function id(_prefix: string) {
  return crypto.randomUUID();
}

export function money(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(value) ? value : 0);
}

export function percent(value: number) {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}%`;
}

type Dimension = "mass" | "volume" | "unit";

function baseQuantity(
  quantity: number,
  unit: Unit,
): { value: number; dimension: Dimension } {
  switch (unit) {
    case "kg":
      return { value: quantity * 1000, dimension: "mass" };
    case "g":
      return { value: quantity, dimension: "mass" };
    case "l":
      return { value: quantity * 1000, dimension: "volume" };
    case "ml":
      return { value: quantity, dimension: "volume" };
    case "unit":
      return { value: quantity, dimension: "unit" };
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
  return base.value > 0 ? supply.packagePrice / base.value : 0;
}

export function supplyUsageCost(
  supply: Supply,
  quantity: number,
  unit: Unit,
) {
  const packageBase = baseQuantity(supply.packageQuantity, supply.packageUnit);
  const usageBase = baseQuantity(quantity, unit);
  if (
    packageBase.dimension !== usageBase.dimension ||
    packageBase.value <= 0
  ) {
    return 0;
  }
  return (supply.packagePrice / packageBase.value) * usageBase.value;
}

export type ProductCost = {
  ingredientBatch: number;
  packagingBatch: number;
  productionBatch: number;
  lossBatch: number;
  totalBatch: number;
  unitCost: number;
  minimumPrice: number;
  recommendedPrice: number;
  contributionAtCurrentPrice: number;
  marginAtCurrentPrice: number;
};

export function productCost(
  product: Product,
  supplies: Supply[],
  paymentFeePercent: number,
): ProductCost {
  let ingredientBatch = 0;
  let packagingBatch = 0;

  for (const item of product.recipe) {
    const supply = supplies.find(
      (candidate) => candidate.id === item.supplyId,
    );
    if (!supply) continue;
    const cost = supplyUsageCost(supply, item.quantity, item.unit);
    if (supply.category === "packaging") packagingBatch += cost;
    else ingredientBatch += cost;
  }

  const productionBatch = Math.max(0, product.productionCostPerBatch);
  const beforeLoss = ingredientBatch + packagingBatch + productionBatch;
  const lossBatch = (beforeLoss * Math.max(0, product.lossPercent)) / 100;
  const totalBatch = beforeLoss + lossBatch;
  const unitCost = product.batchYield > 0 ? totalBatch / product.batchYield : 0;
  const fee = Math.max(0, paymentFeePercent) / 100;
  const minimumMargin = Math.max(0, product.minimumMarginPercent) / 100;
  const targetMargin = Math.max(0, product.targetMarginPercent) / 100;
  const minimumPrice = unitCost / Math.max(0.05, 1 - minimumMargin - fee);
  const recommendedPrice = unitCost / Math.max(0.05, 1 - targetMargin - fee);
  const variableFee = product.sellingPrice * fee;
  const contributionAtCurrentPrice =
    product.sellingPrice - unitCost - variableFee;
  const marginAtCurrentPrice =
    product.sellingPrice > 0
      ? (contributionAtCurrentPrice / product.sellingPrice) * 100
      : 0;

  return {
    ingredientBatch,
    packagingBatch,
    productionBatch,
    lossBatch,
    totalBatch,
    unitCost,
    minimumPrice,
    recommendedPrice,
    contributionAtCurrentPrice,
    marginAtCurrentPrice,
  };
}

export function monthSales(sales: Sale[], now = new Date()) {
  return sales.filter((sale) => {
    const date = new Date(sale.soldAt);
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth()
    );
  });
}

export function dashboardNumbers(state: NatState) {
  const sales = monthSales(state.sales);
  const revenue = sales.reduce((sum, sale) => sum + sale.totalReceived, 0);
  const units = sales.reduce((sum, sale) => sum + sale.quantity, 0);
  const contribution = sales.reduce(
    (sum, sale) => sum + sale.contributionSnapshot,
    0,
  );
  const estimatedResult = contribution - state.settings.monthlyFixedCosts;

  const byProduct = new Map<string, { name: string; quantity: number }>();
  for (const sale of sales) {
    const current = byProduct.get(sale.productId) ?? {
      name: sale.productName,
      quantity: 0,
    };
    current.quantity += sale.quantity;
    byProduct.set(sale.productId, current);
  }
  const topProduct =
    [...byProduct.values()].sort((a, b) => b.quantity - a.quantity)[0] ?? null;

  return { sales, revenue, units, contribution, estimatedResult, topProduct };
}

export function buildSale(args: {
  product: Product;
  supplies: Supply[];
  paymentFeePercent: number;
  quantity: number;
  totalReceived: number;
  paymentMethod: PaymentMethod;
  soldAt: string;
}): Sale {
  const metrics = productCost(
    args.product,
    args.supplies,
    args.paymentFeePercent,
  );
  const variableFeeSnapshot =
    (args.totalReceived * Math.max(0, args.paymentFeePercent)) / 100;
  const contributionSnapshot =
    args.totalReceived - metrics.unitCost * args.quantity - variableFeeSnapshot;

  return {
    id: id("sale"),
    productId: args.product.id,
    productName: args.product.name,
    quantity: args.quantity,
    totalReceived: args.totalReceived,
    paymentMethod: args.paymentMethod,
    soldAt: args.soldAt,
    unitCostSnapshot: metrics.unitCost,
    variableFeeSnapshot,
    contributionSnapshot,
  };
}

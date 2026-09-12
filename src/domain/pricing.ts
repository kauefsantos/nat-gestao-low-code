import type { PaymentMethod, Product, Settings, Supply, Unit } from "./types.js";

export function paymentFeeForMethod(settings: Settings, method: PaymentMethod) {
  if (method === "pix") return Math.max(0, settings.pixFeePercent ?? 0);
  if (method === "cash") return Math.max(0, settings.cashFeePercent ?? 0);
  if (method === "card") return Math.max(0, settings.cardFeePercent ?? 0);
  return Math.max(0, settings.paymentFeePercent ?? 0);
}

export function pricingFeePercent(settings: Settings) {
  return Math.max(
    paymentFeeForMethod(settings, "pix"),
    paymentFeeForMethod(settings, "cash"),
    paymentFeeForMethod(settings, "card"),
    Math.max(0, settings.paymentFeePercent ?? 0),
  );
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
  ingredientBatch: number;
  packagingBatch: number;
  laborBatch: number;
  productionBatch: number;
  lossBatch: number;
  totalBatch: number;
  unitCost: number;
  minimumPrice: number;
  recommendedPrice: number;
  contributionAtCurrentPrice: number;
  marginAtCurrentPrice: number;
  recipeValid: boolean;
  pricingValid: boolean;
};

export function productCost(product: Product, supplies: Supply[], paymentFeePercent: number): ProductCost {
  let ingredientBatch = 0;
  let lossEligibleBatch = 0;
  let packagingBatch = 0;
  let recipeValid = true;

  for (const item of product.recipe) {
    const supply = supplies.find((candidate) => candidate.id === item.supplyId);
    if (!supply) { recipeValid = false; continue; }
    const cost = supplyUsageCost(supply, item.quantity, item.unit);
    if (!Number.isFinite(cost)) { recipeValid = false; continue; }
    if (supply.category === "packaging") packagingBatch += cost;
    else {
      ingredientBatch += cost;
      if (supply.category === "ingredient") lossEligibleBatch += cost;
    }
  }

  const laborBatch = Math.max(0, product.laborCostPerBatch ?? 0);
  const productionBatch = Math.max(0, product.productionCostPerBatch);
  const lossBatch = recipeValid ? lossEligibleBatch * Math.max(0, product.lossPercent) / 100 : Number.NaN;
  const totalBatch = recipeValid ? ingredientBatch + lossBatch + packagingBatch + laborBatch + productionBatch : Number.NaN;
  const unitCost = product.batchYield > 0 && Number.isFinite(totalBatch) ? totalBatch / product.batchYield : Number.NaN;
  const fee = Math.max(0, paymentFeePercent) / 100;
  const minimumMargin = Math.max(0, product.minimumMarginPercent) / 100;
  const targetMargin = Math.max(0, product.targetMarginPercent) / 100;
  const minimumDenominator = 1 - minimumMargin - fee;
  const targetDenominator = 1 - targetMargin - fee;
  const pricingValid = targetMargin >= minimumMargin && minimumDenominator > 0 && targetDenominator > 0;
  const minimumPrice = pricingValid && Number.isFinite(unitCost) ? unitCost / minimumDenominator : Number.NaN;
  const recommendedPrice = pricingValid && Number.isFinite(unitCost) ? unitCost / targetDenominator : Number.NaN;
  const variableFee = product.sellingPrice * fee;
  const contributionAtCurrentPrice = Number.isFinite(unitCost) ? product.sellingPrice - unitCost - variableFee : Number.NaN;
  const marginAtCurrentPrice = product.sellingPrice > 0 && Number.isFinite(contributionAtCurrentPrice) ? contributionAtCurrentPrice / product.sellingPrice * 100 : Number.NaN;

  return { ingredientBatch, packagingBatch, laborBatch, productionBatch, lossBatch, totalBatch, unitCost, minimumPrice, recommendedPrice, contributionAtCurrentPrice, marginAtCurrentPrice, recipeValid, pricingValid };
}

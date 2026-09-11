import test from "node:test";
import assert from "node:assert/strict";
import { productCost, type Product, type Supply } from "../src/domain/nat.js";

const ingredient: Supply = {
  id: "00000000-0000-4000-8000-000000000101",
  name: "Ingrediente",
  category: "ingredient",
  packageQuantity: 100,
  packageUnit: "g",
  packagePrice: 100,
  purchasedAt: "2026-09-11",
};

const packaging: Supply = {
  id: "00000000-0000-4000-8000-000000000102",
  name: "Embalagem",
  category: "packaging",
  packageQuantity: 10,
  packageUnit: "unit",
  packagePrice: 10,
  purchasedAt: "2026-09-11",
};

test("perda percentual incide somente sobre ingredientes", () => {
  const product: Product = {
    id: "p",
    name: "Teste",
    batchYield: 1,
    sellingPrice: 20,
    lossPercent: 10,
    productionCostPerBatch: 5,
    minimumMarginPercent: 10,
    targetMarginPercent: 15,
    recipe: [
      { id: "r1", supplyId: ingredient.id, quantity: 10, unit: "g" },
      { id: "r2", supplyId: packaging.id, quantity: 1, unit: "unit" },
    ],
  };

  const result = productCost(product, [ingredient, packaging], 0);

  assert.equal(result.ingredientBatch, 10);
  assert.equal(result.packagingBatch, 1);
  assert.equal(result.productionBatch, 5);
  assert.equal(result.lossBatch, 1);
  assert.equal(result.totalBatch, 17);
  assert.equal(result.unitCost, 17);
});

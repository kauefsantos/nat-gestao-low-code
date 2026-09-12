import assert from "node:assert/strict";
import test from "node:test";
import { monthSales } from "../src/domain/finance.js";
import type { Sale } from "../src/domain/types.js";

const boundarySale: Sale = {
  id: "sale-boundary",
  productId: "product-1",
  productName: "Produto",
  quantity: 1,
  totalReceived: 10,
  saleValueSnapshot: 10,
  paymentStatus: "paid",
  paymentMethod: "pix",
  soldAt: "2026-10-01T02:30:00.000Z",
  unitCostSnapshot: 5,
  variableFeeSnapshot: 0,
  contributionSnapshot: 5,
  items: [{
    productId: "product-1",
    productName: "Produto",
    quantity: 1,
    unitCostSnapshot: 5,
    unitPriceSnapshot: 10,
  }],
  status: "completed",
};

test("financeiro usa America/Sao_Paulo na virada do mês", () => {
  assert.equal(monthSales([boundarySale], new Date("2026-09-30T15:00:00.000Z")).length, 1);
  assert.equal(monthSales([boundarySale], new Date("2026-10-01T15:00:00.000Z")).length, 0);
});

import test from "node:test";
import assert from "node:assert/strict";
import { purchasePaymentState } from "../src/domain/receivables.js";

const base={status:"completed" as const,transactionType:"sale" as const,paymentDueAt:"2026-09-14T12:00:00.000Z",paymentCriticalAt:null};

test("compra paga aparece como paga",()=>{
  assert.equal(purchasePaymentState({...base,paymentStatus:"paid"},new Date("2026-09-15T12:00:00.000Z")),"paid");
});

test("compra pendente dentro da janela aparece em dia",()=>{
  assert.equal(purchasePaymentState({...base,paymentStatus:"pending"},new Date("2026-09-14T16:59:59.000Z")),"pending");
});

test("compra pendente após cinco horas aparece atrasada",()=>{
  assert.equal(purchasePaymentState({...base,paymentStatus:"pending"},new Date("2026-09-14T17:00:00.000Z")),"overdue");
});

test("advertência crítica mantém compra pendente como atrasada",()=>{
  assert.equal(purchasePaymentState({...base,paymentStatus:"pending",paymentCriticalAt:"2026-09-14T13:00:00.000Z"},new Date("2026-09-14T13:01:00.000Z")),"overdue");
});

import assert from "node:assert/strict";
import test from "node:test";
import { dashboardNumbers, initialState, type NatState } from "../src/domain/nat.js";

test("capital inicial fica separado dos novos aportes do mês",()=>{
  const state:NatState={...initialState,ownerCashMovements:[
    {id:"capital",movementType:"initial_capital",amount:341.37,occurredAt:"2026-09-12"},
    {id:"aporte",movementType:"contribution",amount:20,occurredAt:"2026-09-12"},
  ]};
  const numbers=dashboardNumbers(state);
  assert.equal(numbers.initialCapital,341.37);
  assert.equal(numbers.ownerContributions,20);
  assert.equal(numbers.cashIn,20);
});

test("capital inicial não vira faturamento nem resultado",()=>{
  const state:NatState={...initialState,ownerCashMovements:[
    {id:"capital",movementType:"initial_capital",amount:341.37,occurredAt:"2026-09-12"},
  ]};
  const numbers=dashboardNumbers(state);
  assert.equal(numbers.revenue,0);
  assert.equal(numbers.contribution,0);
  assert.equal(numbers.initialCapital,341.37);
});

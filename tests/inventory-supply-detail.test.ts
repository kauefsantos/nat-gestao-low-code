import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const edge=readFileSync("supabase/functions/nat-inventory-production/index.ts","utf8");
const migration=readFileSync("supabase/migrations/20260913021500_inventory_supply_detail.sql","utf8");

test("edge function preserva contrato e identifica falta de estoque",()=>{
  assert.match(edge,/error:"PRODUCTION_REJECTED"/);
  assert.match(edge,/reason:"INSUFFICIENT_STOCK"/);
  assert.match(edge,/estoque insuficiente/i);
});

test("backend informa qual supply da receita está insuficiente",()=>{
  assert.match(migration,/s\.name as supply_name/);
  assert.match(migration,/Estoque insuficiente de %: necessário % %, disponível % %\./);
  assert.match(migration,/r\.supply_id/);
});

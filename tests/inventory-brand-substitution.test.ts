import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=(path:string)=>readFileSync(path,"utf8");

test("estoque: chocolate Nestlé é registrado separadamente e assume as receitas atuais",()=>{
  const migration=read("supabase/migrations/20260913082000_nestle_chocolate_inventory.sql");
  assert.match(migration,/Chocolate em Pó Solúvel 50% Cacau Nestlé Dois Frades/);
  assert.match(migration,/Chocolate em pó Garoto/);
  assert.match(migration,/package_price = 32\.80/);
  assert.match(migration,/funding_source = 'business'/);
  assert.match(migration,/update public\.recipe_items/);
  assert.match(migration,/set supply_id = v_nestle_id/);
});

test("edge de produção resolve o insumo pela receita, sem whitelist de marca",()=>{
  const edge=read("supabase/functions/nat-inventory-production/index.ts");
  assert.match(edge,/record_inventory_production_v2/);
  assert.doesNotMatch(edge,/Chocolate em pó Garoto/i);
  assert.doesNotMatch(edge,/Nestlé Dois Frades/i);
  assert.doesNotMatch(edge,/Garoto|Nestle|Nestlé/i);
});

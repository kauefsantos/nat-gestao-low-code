import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=(path:string)=>readFileSync(path,"utf8");

test("desempenho: gravação incremental não recarrega todo estado após sucesso",()=>{
  const store=read("src/hooks/use-nat-store.ts");
  assert.match(store,/apply_nat_transition_v3|persistNatTransition/);
  assert.match(store,/if\(result\.inventoryChanged\)setInventoryRevision/);
  assert.match(store,/loadNatHistoryPage\(businessId,historyCursorRef\.current,100\)/);
  assert.doesNotMatch(store,/loadNatHistoryPageV3/);
});

test("desempenho: telas pesadas usam lazy loading e histórico é progressivo",()=>{
  const app=read("src/app/NatApp.tsx");
  assert.match(app,/const SalesHistoryView=lazy/);
  assert.match(app,/const IntelligenceWorkbench=lazy/);
  assert.match(app,/Carregar mais histórico/);
});

test("desempenho: agenda tem janela operacional e queries principais não usam select estrela",()=>{
  const calendar=read("src/hooks/use-calendar.ts");
  const operational=read("src/data/nat-operational-v2.ts");
  assert.match(calendar,/addCalendarDays\(today,-90\)/);
  assert.match(calendar,/addCalendarDays\(today,365\)/);
  assert.doesNotMatch(operational,/\.select\("\*"\)/);
});

test("desempenho: CI aplica orçamento de bundle",()=>{
  const pkg=JSON.parse(read("package.json")) as {scripts:Record<string,string>};
  const ci=read(".github/workflows/ci.yml");
  assert.equal(pkg.scripts["perf:budget"],"node scripts/performance-budget.mjs");
  assert.match(ci,/Enforce performance budget/);
});

test("escala: análise de clientes agrega vendas em uma única passagem",()=>{
  const domain=read("src/domain/customers.ts");
  const body=domain.slice(domain.indexOf("export function customerInsights"),domain.indexOf("export function customerOverview"));
  assert.match(body,/for \(const sale of state\.sales\)/);
  assert.doesNotMatch(body,/state\.sales\.filter/);
});

test("financeiro: aporte e reinvestimento são dimensões distintas da saída",()=>{
  const migration=read("supabase/migrations/20260912110000_performance_scalability_finance.sql");
  const supply=read("src/components/nat/SupplySheet.tsx");
  const expense=read("src/components/nat/ExpenseEditorSheet.tsx");
  assert.match(migration,/funding_source text not null default 'owner'/);
  assert.match(migration,/funding_source in \('owner','business'\)/);
  assert.match(supply,/Dinheiro da NAT/);
  assert.match(supply,/Dinheiro pessoal/);
  assert.match(expense,/Dinheiro da NAT/);
});

test("financeiro: edição preserva a origem e cache é invalidado após alteração",()=>{
  const supply=read("src/components/nat/SupplySheet.tsx");
  const expense=read("src/components/nat/ExpenseEditorSheet.tsx");
  const store=read("src/hooks/use-nat-store.ts");
  assert.match(supply,/value\?\.fundingSource\?\?"business"/);
  assert.match(expense,/value\?\.fundingSource\?\?"business"/);
  assert.match(store,/invalidateFundingSummary\(businessId\)/);
});

test("backend: snapshot de estoque agrega movimentos antes de montar itens",()=>{
  const migration=read("supabase/migrations/20260912110000_performance_scalability_finance.sql");
  assert.match(migration,/with balances as \(/i);
  assert.match(migration,/sum\(quantity_delta\)/i);
});

test("estoque: contagem maior de produto pronto passa por alvo atômico e consome a receita ligada",()=>{
  const repository=read("src/data/inventory-repository.ts");
  const edge=read("supabase/functions/nat-inventory-production/index.ts");
  const migration=read("supabase/migrations/20260913150000_purchase_inventory_integrity.sql");
  assert.match(repository,/args\.kind==="product"/);
  assert.match(repository,/mode:"set_product_stock"/);
  assert.match(repository,/nat-inventory-production/);
  assert.match(edge,/set_product_stock_v2/);
  assert.doesNotMatch(edge,/targetQuantity-current/);
  assert.match(migration,/pg_advisory_xact_lock/);
  assert.match(migration,/v_delta:=p_target_quantity-v_previous/);
  assert.match(migration,/record_inventory_production\(p_business_id,p_product_id,v_batches/);
});

test("estoque: redução por contagem física não devolve ingredientes e aumento direto fica bloqueado",()=>{
  const repository=read("src/data/inventory-repository.ts");
  const edge=read("supabase/functions/nat-inventory-production/index.ts");
  const migration=read("supabase/migrations/20260913150000_purchase_inventory_integrity.sql");
  assert.match(edge,/set_product_stock_v2/);
  assert.match(migration,/if v_delta>0 then/);
  assert.match(migration,/perform public\.set_inventory_balance\(p_business_id,'product',p_product_id,p_target_quantity/);
  assert.match(migration,/if p_item_kind='product' and p_quantity>v_current then/);
  assert.match(repository,/p_item_kind:args\.kind/);
});

test("estoque: Edge Function de produção entra no typecheck do CI",()=>{
  const ci=read(".github/workflows/ci.yml");
  assert.match(ci,/nat-inventory-production\/index\.ts/);
});

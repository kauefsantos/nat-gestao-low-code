import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read=(path:string)=>readFileSync(path,"utf8");

test("arquitetura: loader operacional legado duplicado foi removido",()=>{
  assert.equal(existsSync("src/data/nat-operational-repository.ts"),false);
  const store=read("src/hooks/use-nat-store.ts");
  assert.match(store,/loadNatOperationalStateV3/);
  assert.match(store,/loadNatHistoryPageV3/);
});

test("arquitetura: Inteligência acessa compras pela camada data",()=>{
  const view=read("src/components/nat/IntelligenceView.tsx");
  const repository=read("src/data/intelligence-repository.ts");
  assert.doesNotMatch(view,/@\/integrations\/supabase\/client/);
  assert.match(view,/loadSupplyPurchaseInsights/);
  assert.match(repository,/supply_purchases/);
});

test("arquitetura: CI possui gate explícito de boundaries",()=>{
  const pkg=JSON.parse(read("package.json")) as {scripts:Record<string,string>};
  const ci=read(".github/workflows/ci.yml");
  const gate=read("scripts/architecture-check.mjs");
  assert.equal(pkg.scripts["architecture:check"],"node scripts/architecture-check.mjs");
  assert.match(ci,/Check architecture boundaries/);
  assert.match(gate,/src\/domain\//);
  assert.match(gate,/src\/data\//);
  assert.match(gate,/componentIntegrationExceptions/);
});

test("arquitetura: ROI usa fuso de negócio e oferece ajuda contextual",()=>{
  const roi=read("src/domain/roi.ts");
  const panel=read("src/components/nat/RoiOverview.tsx");
  assert.match(roi,/businessDate/);
  assert.doesNotMatch(roi,/getMonth\(/);
  assert.match(panel,/symbol="i"/);
  assert.match(panel,/Margem responde quanto da receita sobrou/);
});

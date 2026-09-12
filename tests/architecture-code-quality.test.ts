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

test("arquitetura: telas usam adaptadores sem acessar Lovable Cloud diretamente",()=>{
  const cases:[string,string][]=[
    ["src/components/nat/IntelligenceView.tsx","loadSupplyPurchaseInsights"],
    ["src/components/nat/SaleOrderSheet.tsx","quoteSale"],
    ["src/components/nat/IntegrationHealthPanel.tsx","loadIntegrationHealth"],
    ["src/components/nat/CustomersView.tsx","loadLatestCustomerConsent"],
    ["src/components/nat/ContentStudio.tsx","loadContentAiStatus"],
  ];
  for(const [path,adapter] of cases){
    const source=read(path);
    assert.doesNotMatch(source,/@\/integrations\/supabase\/client/,`${path} não deve conhecer o cliente de infraestrutura`);
    assert.match(source,new RegExp(adapter),`${path} deve usar ${adapter}`);
  }
  assert.doesNotMatch(read("src/app/NatApp.tsx"),/@\/integrations\/supabase\/client/);
});

test("arquitetura: domínio NAT foi dividido mantendo fachada pública",()=>{
  const facade=read("src/domain/nat.ts");
  for(const module of ["types","format","pricing","finance","customers","analytics","sales"]){
    assert.equal(existsSync(`src/domain/${module}.ts`),true);
    assert.match(facade,new RegExp(`export \\* from \\\"\\./${module}\\.js\\\"`));
  }
  assert.doesNotMatch(facade,/\bfunction\s+/);
});

test("arquitetura: CI possui gate estrito de boundaries",()=>{
  const pkg=JSON.parse(read("package.json")) as {scripts:Record<string,string>};
  const ci=read(".github/workflows/ci.yml");
  const gate=read("scripts/architecture-check.mjs");
  assert.equal(pkg.scripts["architecture:check"],"node scripts/architecture-check.mjs");
  assert.match(ci,/Check architecture boundaries/);
  assert.match(gate,/src\/domain\//);
  assert.match(gate,/src\/data\//);
  assert.doesNotMatch(gate,/componentIntegrationExceptions/);
  assert.match(gate,/sem exceções de UI para Lovable Cloud/);
});

test("arquitetura: schema efetivo documenta drift do Lovable Cloud sem editar snapshot gerado",()=>{
  const effective=read("src/integrations/lovable-cloud/database.ts");
  const client=read("src/integrations/supabase/client.ts");
  assert.match(effective,/timezone/);
  assert.match(effective,/funding_source/);
  assert.match(effective,/quote_sale_v1/);
  assert.match(effective,/get_financial_funding_snapshot/);
  assert.match(client,/@\/integrations\/lovable-cloud\/database/);
  assert.match(client,/Lovable Cloud não está configurado/);
});

test("arquitetura: ROI usa fuso de negócio e oferece ajuda contextual",()=>{
  const roi=read("src/domain/roi.ts");
  const panel=read("src/components/nat/RoiOverview.tsx");
  assert.match(roi,/businessDate/);
  assert.doesNotMatch(roi,/getMonth\(/);
  assert.match(panel,/symbol="i"/);
  assert.match(panel,/Margem responde quanto da receita sobrou/);
});

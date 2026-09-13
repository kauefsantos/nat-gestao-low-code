import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=(path:string)=>fs.readFileSync(path,"utf8");

test("Análises usa linguagem amigável e remove ajudas gigantes",()=>{
  const workbench=read("src/components/nat/IntelligenceWorkbench.tsx");
  const roi=read("src/components/nat/RoiOverview.tsx");
  assert.match(workbench,/Um resumo simples do que vale acompanhar agora/);
  assert.match(workbench,/itens precisam|item precisa/);
  assert.doesNotMatch(workbench,/HelpTip/);
  assert.doesNotMatch(roi,/HelpTip/);
  assert.match(roi,/Total investido no mês/);
  assert.match(roi,/Custo acumulado/);
  assert.match(roi,/Venda acumulada/);
});

test("Inteligência reorganiza saúde, produtos, clientes e compras",()=>{
  const source=read("src/components/nat/IntelligenceView.tsx");
  assert.match(source,/grid gap-3 md:grid-cols-2/);
  assert.match(source,/Resultado das vendas/);
  assert.match(source,/Total de clientes/);
  assert.match(source,/Não compraram mais/);
  assert.match(source,/Compras e variação de preço/);
  assert.doesNotMatch(source,/Quanto ainda dá para produzir/);
  assert.doesNotMatch(source,/Fonte: \{bi\.metricContext/);
  assert.doesNotMatch(source,/customers\]\.sort|customers\.map/);
});

test("ROI e compras são alimentados pela Edge Function ligada ao Portfólio",()=>{
  const repository=read("src/data/business-intelligence-repository.ts");
  const purchaseRepository=read("src/data/intelligence-repository.ts");
  const edge=read("supabase/functions/nat-analysis-insights/index.ts");
  const config=read("supabase/config.toml");
  assert.match(repository,/functions\.invoke\("nat-analysis-insights"/);
  assert.match(purchaseRepository,/mode:"purchases"/);
  assert.match(edge,/from\("products"\).*eq\("active",true\)/s);
  assert.match(edge,/get_analysis_supply_groups_v1/);
  assert.match(config,/\[functions\.nat-analysis-insights\][\s\S]*verify_jwt = true/);
});

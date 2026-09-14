import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=(path:string)=>fs.readFileSync(path,"utf8");

test("Análises usa linguagem amigável e reposição em colunas de até quatro itens",()=>{
  const workbench=read("src/components/nat/IntelligenceWorkbench.tsx");
  const roi=read("src/components/nat/RoiOverview.tsx");
  assert.match(workbench,/Um resumo simples do que vale acompanhar agora/);
  assert.match(workbench,/itens precisam|item precisa/);
  assert.match(workbench,/Math\.ceil\(lowStock\.length\/4\)/);
  assert.match(workbench,/lowStock\.slice\(index\*4,index\*4\+4\)/);
  assert.match(workbench,/repeat\(auto-fit,minmax\(11rem,1fr\)\)/);
  assert.doesNotMatch(workbench,/lowStock\.slice\(0,8\)/);
  assert.doesNotMatch(workbench,/HelpTip/);
  assert.doesNotMatch(roi,/HelpTip/);
  assert.match(roi,/Total investido no mês/);
  assert.match(roi,/Custo acumulado/);
  assert.match(roi,/Venda acumulada/);
});

test("Inteligência mantém saúde em duas colunas e coloca Clientes e Canais em linhas próprias",()=>{
  const source=read("src/components/nat/IntelligenceView.tsx");
  assert.match(source,/grid gap-3 md:grid-cols-2/);
  assert.match(source,/Resultado das vendas/);
  assert.match(source,/Total de clientes/);
  assert.match(source,/Não compraram mais/);
  assert.match(source,/Compras e variação de preço/);
  assert.doesNotMatch(source,/grid gap-6 lg:grid-cols-2/);
  assert.doesNotMatch(source,/Quanto ainda dá para produzir/);
  assert.doesNotMatch(source,/Fonte: \{bi\.metricContext/);
  assert.doesNotMatch(source,/customers\]\.sort|customers\.map/);
});

test("Relacionamento apresenta Fichas de clientes com subtítulo amigável",()=>{
  const customers=read("src/components/nat/CustomersView.tsx");
  assert.match(customers,/Veja de forma simples quem já comprou, quem voltou e quem merece atenção/);
  assert.match(customers,/As fichas ajudam a acompanhar cada relação sem perder o histórico/);
  assert.doesNotMatch(customers,/Totais, recompra e RFM usam todo o histórico do Lovable Cloud/);
});

test("ROI e compras usam interfaces do Lovable Cloud e Portfólio ativo",()=>{
  const repository=read("src/data/business-intelligence-repository.ts");
  const purchaseRepository=read("src/data/intelligence-repository.ts");
  const purchaseMigration=read("supabase/migrations/20260913230000_analysis_relationship_ux.sql");
  assert.match(repository,/get_business_intelligence_snapshot_v2/);
  assert.match(repository,/from\("products"\).*eq\("active",true\)/s);
  assert.match(repository,/shapePortfolioProducts/);
  assert.doesNotMatch(repository,/functions\.invoke\("nat-analysis-insights"/);
  assert.match(purchaseRepository,/get_analysis_supply_groups_v1/);
  assert.doesNotMatch(purchaseRepository,/functions\.invoke\("nat-analysis-insights"/);
  assert.match(purchaseMigration,/private\.is_business_member\(p_business_id\)/);
});
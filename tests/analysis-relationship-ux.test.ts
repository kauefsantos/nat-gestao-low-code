import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=(path:string)=>fs.readFileSync(path,"utf8");

test("Análises usa linguagem amigável e agrupa reposição em até cinco itens por linha",()=>{
  const workbench=read("src/components/nat/IntelligenceWorkbench.tsx");
  const roi=read("src/components/nat/RoiOverview.tsx");
  assert.match(workbench,/Um resumo simples do que vale acompanhar agora/);
  assert.match(workbench,/itens precisam|item precisa/);
  assert.match(workbench,/label:"Massas"/);
  assert.match(workbench,/label:"Insumos"/);
  assert.match(workbench,/label:"Sabores"/);
  assert.match(workbench,/item\.kind==="supply"/);
  assert.match(workbench,/startsWith\("massa"\)/);
  assert.match(workbench,/lg:grid-cols-5/);
  assert.doesNotMatch(workbench,/lowStockColumns/);
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

test("Fichas expandem compras completas e mantêm edição por duplo clique",()=>{
  const customers=read("src/components/nat/CustomersView.tsx");
  const repository=read("src/data/customer-history-repository.ts");
  assert.match(customers,/aria-expanded=\{expanded\}/);
  assert.match(customers,/onDoubleClick=\{\(\)=>editCustomer\(row\.customer\)\}/);
  assert.match(customers,/>Data<\/th>/);
  assert.match(customers,/>Pedido<\/th>/);
  assert.match(customers,/>Valor<\/th>/);
  assert.match(customers,/>Status<\/th>/);
  assert.match(customers,/Não pago · em dia/);
  assert.match(customers,/Não pago · atrasado/);
  assert.doesNotMatch(customers,/Histórico recente carregado/);
  assert.match(repository,/from\("sales"\)/);
  assert.match(repository,/from\("sale_items"\)/);
  assert.match(repository,/purchasePaymentState/);
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
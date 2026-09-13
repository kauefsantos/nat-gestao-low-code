import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { NatState } from "../src/domain/nat.js";
import { businessRoi, productRoiAnalytics } from "../src/domain/roi.js";

const read=(path:string)=>readFileSync(path,"utf8");

function roiState():NatState{
  return {
    version:6,
    supplies:[],
    products:[],
    customers:[],
    sales:[{
      id:"sale-1",
      productId:"mixed",
      productName:"2 produtos",
      quantity:8,
      totalReceived:24,
      paymentMethod:"pix",
      soldAt:"2026-09-12T12:00:00-03:00",
      unitCostSnapshot:1.5,
      variableFeeSnapshot:2.4,
      deliveryCostSnapshot:1.6,
      contributionSnapshot:8,
      items:[
        {productId:"p1",productName:"Brigadeiro • 2 Amores",quantity:4,unitCostSnapshot:1,unitPriceSnapshot:3},
        {productId:"p2",productName:"Brigadeiro • Ninho",quantity:4,unitCostSnapshot:2,unitPriceSnapshot:3},
      ],
      status:"completed",
    }],
    expenses:[{id:"expense-1",name:"Gasto extra",amount:4,spentAt:"2026-09-12",fundingSource:"business"}],
    ownerCashMovements:[{id:"owner-1",movementType:"contribution",amount:100,occurredAt:"2026-09-12"}],
    purchaseCashOut:44.65,
    settings:{
      ownerName:"NAT",
      monthlyFixedCosts:3,
      paymentFeePercent:0,
      defaultMinimumMarginPercent:35,
      defaultTargetMarginPercent:50,
      fixedCostFundingSource:"business",
    },
  };
}

test("ROI por sabor usa receita e custos congelados da venda e rateia taxa/entrega",()=>{
  const products=productRoiAnalytics(roiState());
  const twoLoves=products.find((item)=>item.productId==="p1");
  const ninho=products.find((item)=>item.productId==="p2");

  assert.ok(twoLoves);
  assert.equal(twoLoves.revenue,12);
  assert.equal(twoLoves.investedCost,6);
  assert.equal(twoLoves.netReturn,6);
  assert.equal(twoLoves.roiPercent,100);

  assert.ok(ninho);
  assert.equal(ninho.revenue,12);
  assert.equal(ninho.investedCost,10);
  assert.equal(ninho.netReturn,2);
  assert.equal(ninho.roiPercent,20);
});

test("ROI financeiro mensal não conta aporte nem reinvestimento novamente como custo",()=>{
  const result=businessRoi(roiState(),new Date("2026-09-12T12:00:00-03:00"));

  assert.equal(result.revenue,24);
  assert.equal(result.investedCost,23);
  assert.equal(result.netReturn,1);
  assert.ok(Math.abs(result.roiPercent-(100/23))<1e-9);
});

test("ROI mensal usa o mês da NAT em America/Sao_Paulo, não o mês UTC do navegador",()=>{
  const state=roiState();
  state.expenses=[];
  state.settings.monthlyFixedCosts=0;
  state.sales[0]={...state.sales[0],soldAt:"2026-10-01T01:30:00Z",totalReceived:24,variableFeeSnapshot:0,deliveryCostSnapshot:0};
  const september=businessRoi(state,new Date("2026-10-01T02:30:00Z"));
  assert.equal(september.revenue,24);
  assert.equal(september.investedCost,12);
  assert.equal(september.netReturn,12);
  assert.equal(september.roiPercent,100);
});

test("ROI ignora venda cancelada",()=>{
  const state=roiState();
  state.sales[0]={...state.sales[0],status:"cancelled"};

  assert.deepEqual(productRoiAnalytics(state),[]);
  const result=businessRoi(state,new Date("2026-09-12T12:00:00-03:00"));
  assert.equal(result.revenue,0);
  assert.equal(result.investedCost,7);
  assert.equal(result.netReturn,-7);
  assert.equal(result.roiPercent,-100);
});

test("UI de ROI usa snapshot autoritativo e explica o indicador sem ajuda intrusiva",()=>{
  const financial=read("src/components/nat/FinancialOverview.tsx");
  const intelligence=read("src/components/nat/IntelligenceWorkbench.tsx");
  const panel=read("src/components/nat/RoiOverview.tsx");
  const repository=read("src/data/business-intelligence-repository.ts");

  assert.match(financial,/<RoiOverview snapshot=\{intelligence\} compact\/>/);
  assert.match(intelligence,/<RoiOverview snapshot=\{bi\}\/>/);
  assert.match(panel,/BusinessIntelligenceSnapshot/);
  assert.doesNotMatch(panel,/productRoiAnalytics|businessRoi\(/);
  assert.match(panel,/ROI por sabor/);
  assert.match(panel,/ROI do mês/);
  assert.doesNotMatch(panel,/HelpTip|symbol="i"/);
  assert.match(panel,/ROI mostra, de forma simples/);
  assert.match(panel,/Total investido no mês/);
  assert.match(panel,/Custo acumulado/);
  assert.match(panel,/Venda acumulada/);
  assert.match(repository,/get_business_intelligence_snapshot_v2/);
  assert.match(repository,/shapePortfolioProducts/);
  assert.match(repository,/from\("products"\).*eq\("active",true\)/s);
});

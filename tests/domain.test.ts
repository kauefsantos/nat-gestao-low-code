import test from "node:test";
import assert from "node:assert/strict";
import { buildSale, buildSaleOrder, dashboardNumbers, productCost, supplyUsageCost, supplyUnitCost, type NatState, type Product, type Supply } from "../src/domain/nat.js";
import { familyPricingSummary, portfolioAnalytics, roundUpToHalf } from "../src/domain/catalog.js";
import { parseRecipeCsv } from "../src/domain/recipe-csv.js";

const eggs: Supply = { id: "00000000-0000-4000-8000-000000000001", name: "Ovos", category: "ingredient", packageQuantity: 12, packageUnit: "unit", packagePrice: 12, purchasedAt: "2026-09-09" };
const chocolate: Supply = { id: "00000000-0000-4000-8000-000000000002", name: "Chocolate", category: "ingredient", packageQuantity: 1, packageUnit: "kg", packagePrice: 30, purchasedAt: "2026-09-09" };

test("normaliza custo por unidade e fração", () => { assert.equal(supplyUnitCost(eggs),1); assert.equal(supplyUsageCost(eggs,0.5,"unit"),0.5); });
test("converte kg para g", () => { assert.equal(supplyUnitCost(chocolate),0.03); assert.equal(supplyUsageCost(chocolate,100,"g"),3); });
test("unidade incompatível falha fechada", () => { assert.ok(Number.isNaN(supplyUsageCost(chocolate,100,"ml"))); });
test("margem impossível não produz preço falso", () => { const product: Product = { id:"p",name:"Teste",batchYield:10,sellingPrice:5,lossPercent:0,productionCostPerBatch:0,minimumMarginPercent:90,targetMarginPercent:90,recipe:[{ id:"r",supplyId:chocolate.id,quantity:100,unit:"g" }] }; const result=productCost(product,[chocolate],20); assert.equal(result.pricingValid,false); assert.ok(Number.isNaN(result.recommendedPrice)); });
test("snapshot de venda usa custo vigente", () => { const product: Product = { id:"p",name:"Brownie",portfolioKey:"brownie-tradicional",batchYield:10,sellingPrice:5,lossPercent:0,productionCostPerBatch:1,minimumMarginPercent:35,targetMarginPercent:50,recipe:[{ id:"r",supplyId:chocolate.id,quantity:100,unit:"g" }] }; const sale=buildSale({ product,supplies:[chocolate],paymentFeePercent:5,quantity:2,totalReceived:10,paymentMethod:"pix",soldAt:"2026-09-09T12:00:00Z" }); assert.equal(Number(sale.unitCostSnapshot.toFixed(2)),0.4); assert.equal(Number(sale.contributionSnapshot.toFixed(2)),8.7); assert.equal(sale.portfolioKey,"brownie-tradicional"); assert.equal(sale.items.length,1); });
test("CSV importa receita por nome, quantidade e unidade", () => { const parsed=parseRecipeCsv("Ingrediente;Quantidade;Unidade\nChocolate;100;g\nOvos;0,5;un",[chocolate,eggs]); assert.deepEqual(parsed.errors,[]); assert.equal(parsed.items.length,2); assert.equal(parsed.items.find((item)=>item.supplyId===eggs.id)?.quantity,0.5); });
test("CSV rejeita ingrediente desconhecido", () => { const parsed=parseRecipeCsv("Ingrediente;Quantidade;Unidade\nFarinha;100;g",[chocolate]); assert.equal(parsed.items.length,0); assert.equal(parsed.errors.length,1); });
test("preço comum usa o sabor mais caro e arredonda para R$ 0,50", () => {
  const products: Product[] = [
    { id:"p1",name:"Brigadeiro • Tradicional",portfolioKey:"brigadeiro-tradicional",batchYield:10,sellingPrice:1,lossPercent:0,productionCostPerBatch:0,minimumMarginPercent:35,targetMarginPercent:50,recipe:[{id:"r1",supplyId:chocolate.id,quantity:100,unit:"g"}] },
    { id:"p2",name:"Brigadeiro • Ninho",portfolioKey:"brigadeiro-ninho",batchYield:10,sellingPrice:2,lossPercent:0,productionCostPerBatch:0,minimumMarginPercent:35,targetMarginPercent:50,recipe:[{id:"r2",supplyId:chocolate.id,quantity:200,unit:"g"}] },
  ];
  const state:NatState={version:3,supplies:[chocolate],products,sales:[],expenses:[],settings:{ownerName:"NAT",monthlyFixedCosts:0,paymentFeePercent:0,defaultMinimumMarginPercent:35,defaultTargetMarginPercent:50}};
  const summary=familyPricingSummary(state,"brigadeiro");
  assert.equal(summary.readyCount,2);
  assert.equal(summary.commonRecommendedPrice,1.5);
  assert.equal(roundUpToHalf(8.01),8.5);
});
test("gasto esporádico reduz o resultado do mês sem alterar contribuição da venda", () => {
  const now=new Date(); const date=now.toISOString().slice(0,10);
  const state:NatState={version:3,supplies:[],products:[],sales:[{id:"s",productId:"p",productName:"Teste",quantity:1,totalReceived:20,paymentMethod:"pix",soldAt:`${date}T12:00:00Z`,unitCostSnapshot:5,variableFeeSnapshot:0,contributionSnapshot:15,items:[{productId:"p",productName:"Teste",quantity:1,unitCostSnapshot:5,unitPriceSnapshot:20}],status:"completed",cancelledAt:null,cancelReason:null}],expenses:[{id:"e",name:"Cortador",amount:4,spentAt:date}],settings:{ownerName:"NAT",monthlyFixedCosts:3,paymentFeePercent:0,defaultMinimumMarginPercent:35,defaultTargetMarginPercent:50}};
  const numbers=dashboardNumbers(state);
  assert.equal(numbers.contribution,15);
  assert.equal(numbers.sporadicExpenses,4);
  assert.equal(numbers.estimatedResult,8);
});
test("pedido com vários produtos distribui itens e soma unidades", () => {
  const p1:Product={id:"p1",name:"Brownie • Tradicional",portfolioKey:"brownie-tradicional",batchYield:10,sellingPrice:5,lossPercent:0,productionCostPerBatch:1,minimumMarginPercent:35,targetMarginPercent:50,recipe:[{id:"r1",supplyId:chocolate.id,quantity:100,unit:"g"}]};
  const p2:Product={id:"p2",name:"Brownie • Ninho",portfolioKey:"brownie-ninho",batchYield:10,sellingPrice:8,lossPercent:0,productionCostPerBatch:0,minimumMarginPercent:35,targetMarginPercent:50,recipe:[{id:"r2",supplyId:chocolate.id,quantity:200,unit:"g"}]};
  const sale=buildSaleOrder({items:[{product:p1,quantity:2},{product:p2,quantity:3}],supplies:[chocolate],paymentFeePercent:5,totalReceived:30,paymentMethod:"pix",soldAt:"2026-09-10T12:00:00Z",discountReason:"Promoção de teste"});
  assert.equal(sale.items.length,2); assert.equal(sale.quantity,5); assert.equal(Number(sale.contributionSnapshot.toFixed(2)),25.9);
});
test("venda cancelada permanece no histórico mas sai dos indicadores", () => {
  const now=new Date(); const date=now.toISOString().slice(0,10);
  const sale=buildSale({product:{id:"p",name:"Brownie",batchYield:10,sellingPrice:5,lossPercent:0,productionCostPerBatch:0,minimumMarginPercent:35,targetMarginPercent:50,recipe:[{id:"r",supplyId:chocolate.id,quantity:100,unit:"g"}]},supplies:[chocolate],paymentFeePercent:0,quantity:1,totalReceived:5,paymentMethod:"pix",soldAt:`${date}T12:00:00Z`});
  sale.status="cancelled"; sale.cancelledAt=new Date().toISOString(); sale.cancelReason="Cliente desistiu";
  const state:NatState={version:3,supplies:[chocolate],products:[],sales:[sale],expenses:[],settings:{ownerName:"NAT",monthlyFixedCosts:0,paymentFeePercent:0,defaultMinimumMarginPercent:35,defaultTargetMarginPercent:50}};
  const numbers=dashboardNumbers(state); assert.equal(numbers.revenue,0); assert.equal(numbers.units,0); assert.equal(state.sales.length,1);
});
test("analytics de portfólio distribui pedido por linha", () => {
  const p1:Product={id:"p1",name:"Brownie • Tradicional",portfolioKey:"brownie-tradicional",batchYield:10,sellingPrice:5,lossPercent:0,productionCostPerBatch:1,minimumMarginPercent:35,targetMarginPercent:50,recipe:[{id:"r1",supplyId:chocolate.id,quantity:100,unit:"g"}]};
  const p2:Product={id:"p2",name:"Brownie • Ninho",portfolioKey:"brownie-ninho",batchYield:10,sellingPrice:8,lossPercent:0,productionCostPerBatch:0,minimumMarginPercent:35,targetMarginPercent:50,recipe:[{id:"r2",supplyId:chocolate.id,quantity:200,unit:"g"}]};
  const sale=buildSaleOrder({items:[{product:p1,quantity:2},{product:p2,quantity:3}],supplies:[chocolate],paymentFeePercent:0,totalReceived:34,paymentMethod:"pix",soldAt:new Date().toISOString()});
  const state:NatState={version:3,supplies:[chocolate],products:[p1,p2],sales:[sale],expenses:[],settings:{ownerName:"NAT",monthlyFixedCosts:0,paymentFeePercent:0,defaultMinimumMarginPercent:35,defaultTargetMarginPercent:50}};
  const analytics=portfolioAnalytics(state); assert.equal(analytics.month.length,2); assert.equal(analytics.month.find((row)=>row.key==="brownie-ninho")?.quantity,3);
});

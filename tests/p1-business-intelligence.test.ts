import test from "node:test";
import assert from "node:assert/strict";
import { buildSaleOrder, customerInsights, dashboardNumbers, paymentFeeForMethod, pricingFeePercent, productCost, type Customer, type NatState, type Product, type Supply } from "../src/domain/nat.js";
import { BRIGADEIRO_CATALOG, portfolioAnalytics } from "../src/domain/catalog.js";

const ingredient:Supply={id:"ingredient",name:"Ingrediente teste",category:"ingredient",packageQuantity:100,packageUnit:"g",packagePrice:10,purchasedAt:"2026-09-11"};
const other:Supply={id:"other",name:"Insumo auxiliar",category:"other",packageQuantity:100,packageUnit:"g",packagePrice:10,purchasedAt:"2026-09-11"};
const packaging:Supply={id:"packaging",name:"Embalagem teste",category:"packaging",packageQuantity:10,packageUnit:"unit",packagePrice:5,purchasedAt:"2026-09-11"};
const product:Product={id:"prod",name:"Produto teste",portfolioKey:"brigadeiro-oreo",batchYield:10,sellingPrice:6,lossPercent:10,laborCostPerBatch:20,productionCostPerBatch:10,minimumMarginPercent:10,targetMarginPercent:15,recipe:[{id:"r1",supplyId:"ingredient",quantity:100,unit:"g"},{id:"r2",supplyId:"other",quantity:100,unit:"g"},{id:"r3",supplyId:"packaging",quantity:10,unit:"unit"}]};
const settings={ownerName:"NAT",monthlyFixedCosts:0,paymentFeePercent:0,pixFeePercent:0,cashFeePercent:0,cardFeePercent:3,defaultMinimumMarginPercent:10,defaultTargetMarginPercent:15,ownerHourlyRate:20,ownerDailyHours:3};
function stateOf(overrides:Partial<NatState>={}):NatState{return {version:5,supplies:[ingredient,other,packaging],products:[product],customers:[],sales:[],expenses:[],ownerCashMovements:[],settings,purchaseCashOut:0,...overrides};}

test("perda física incide somente em ingrediente, não embalagem ou insumo auxiliar",()=>{
  const cost=productCost(product,[ingredient,other,packaging],0);
  assert.equal(cost.ingredientBatch,20);
  assert.equal(cost.lossBatch,1);
  assert.equal(cost.packagingBatch,5);
  assert.equal(cost.totalBatch,56);
});

test("aporte e retirada alteram caixa, mas não resultado econômico",()=>{
  const base=dashboardNumbers(stateOf({ownerCashMovements:[{id:"a",movementType:"contribution",amount:100,occurredAt:"2026-09-11"},{id:"b",movementType:"withdrawal",amount:20,occurredAt:"2026-09-11"}]}));
  assert.equal(base.cashAvailable,80);
  assert.equal(base.estimatedResult,0);
  assert.equal(base.ownerContributions,100);
  assert.equal(base.ownerWithdrawals,20);
});

test("taxa é escolhida pela forma de pagamento e preço usa maior taxa configurada",()=>{
  assert.equal(paymentFeeForMethod(settings,"pix"),0);
  assert.equal(paymentFeeForMethod(settings,"cash"),0);
  assert.equal(paymentFeeForMethod(settings,"card"),3);
  assert.equal(pricingFeePercent(settings),3);
  const card=buildSaleOrder({items:[{product,quantity:1}],supplies:[ingredient,other,packaging],paymentFeePercent:paymentFeeForMethod(settings,"card"),totalReceived:10,paymentMethod:"card",soldAt:"2026-09-11T12:00:00Z"});
  assert.equal(card.variableFeeSnapshot,0.3);
});

test("cortesia aparece como interação, mas não altera RFM ou recompra",()=>{
  const customer:Customer={id:"cliente-exemplo",name:"Cliente Exemplo",marketingConsent:false,active:true,createdAt:"2026-09-01T00:00:00Z",updatedAt:"2026-09-01T00:00:00Z"};
  const courtesy={...buildSaleOrder({items:[{product,quantity:1}],supplies:[ingredient,other,packaging],paymentFeePercent:0,totalReceived:0,paymentMethod:"other",soldAt:"2026-09-10T12:00:00Z",customerId:customer.id,transactionType:"courtesy"}),id:"cortesia"};
  const first={...buildSaleOrder({items:[{product,quantity:1}],supplies:[ingredient,other,packaging],paymentFeePercent:0,totalReceived:10,paymentMethod:"pix",soldAt:"2026-09-11T12:00:00Z",customerId:customer.id}),id:"venda-1"};
  let insight=customerInsights(stateOf({customers:[customer],sales:[courtesy,first]}),new Date("2026-09-12T12:00:00Z"))[0];
  assert.equal(insight.orders,1);
  assert.equal(insight.recurring,false);
  assert.equal(insight.nonCommercialInteractions,1);
  const second={...first,id:"venda-2",soldAt:"2026-09-12T13:00:00Z"};
  insight=customerInsights(stateOf({customers:[customer],sales:[courtesy,first,second]}),new Date("2026-09-13T12:00:00Z"))[0];
  assert.equal(insight.orders,2);
  assert.equal(insight.recurring,true);
  assert.ok(insight.rfmTotal>0);
});

test("Oreo e Tradicional com Disqueti fazem parte do catálogo oficial e dos relatórios comerciais",()=>{
  assert.ok(BRIGADEIRO_CATALOG.some((item)=>item.key==="brigadeiro-oreo"));
  assert.ok(BRIGADEIRO_CATALOG.some((item)=>item.key==="brigadeiro-tradicional-disqueti"));
  const sale=buildSaleOrder({items:[{product,quantity:2}],supplies:[ingredient,other,packaging],paymentFeePercent:0,totalReceived:12,paymentMethod:"pix",soldAt:"2026-09-11T12:00:00Z"});
  const courtesy={...sale,id:"courtesy",transactionType:"courtesy" as const,totalReceived:0,contributionSnapshot:-sale.unitCostSnapshot};
  const analytics=portfolioAnalytics(stateOf({sales:[sale,courtesy]}));
  assert.equal(analytics.allTime.find((row)=>row.key==="brigadeiro-oreo")?.quantity,2);
});

import test from "node:test";
import assert from "node:assert/strict";
import { buildSaleOrder, customerInsights, dashboardNumbers, productCost, type Customer, type NatState, type Product, type Supply } from "../src/domain/nat.js";

const ingredient:Supply={id:"i",name:"Ingrediente",category:"ingredient",packageQuantity:100,packageUnit:"g",packagePrice:10,purchasedAt:"2026-09-11"};
const packaging:Supply={id:"p",name:"Embalagem",category:"packaging",packageQuantity:10,packageUnit:"unit",packagePrice:5,purchasedAt:"2026-09-11"};
const product:Product={id:"prod",name:"Teste",batchYield:10,sellingPrice:6,lossPercent:10,laborCostPerBatch:20,productionCostPerBatch:10,minimumMarginPercent:10,targetMarginPercent:15,recipe:[{id:"r1",supplyId:"i",quantity:100,unit:"g"},{id:"r2",supplyId:"p",quantity:10,unit:"unit"}]};
const settings={ownerName:"NAT",monthlyFixedCosts:0,paymentFeePercent:0,defaultMinimumMarginPercent:10,defaultTargetMarginPercent:15,ownerHourlyRate:20,ownerDailyHours:3};

function stateOf(sales:NatState["sales"],customers:Customer[]=[]):NatState{return {version:4,supplies:[ingredient,packaging],products:[product],customers,sales,expenses:[],settings,purchaseCashOut:0};}

test("perda incide somente sobre ingredientes e mão de obra fica separada",()=>{
  const cost=productCost(product,[ingredient,packaging],0);
  assert.equal(cost.ingredientBatch,10);
  assert.equal(cost.lossBatch,1);
  assert.equal(cost.packagingBatch,5);
  assert.equal(cost.laborBatch,20);
  assert.equal(cost.productionBatch,10);
  assert.equal(cost.totalBatch,46);
  assert.equal(cost.unitCost,4.6);
});

test("margem recomendada menor que a mínima invalida precificação",()=>{
  const cost=productCost({...product,minimumMarginPercent:20,targetMarginPercent:10},[ingredient,packaging],0);
  assert.equal(cost.pricingValid,false);
});

test("cortesia preserva custo mas não vira faturamento ou unidade vendida",()=>{
  const courtesy=buildSaleOrder({items:[{product,quantity:1}],supplies:[ingredient,packaging],paymentFeePercent:0,totalReceived:99,paymentMethod:"other",soldAt:"2026-09-11T12:00:00Z",transactionType:"courtesy"});
  assert.equal(courtesy.totalReceived,0);
  assert.equal(courtesy.contributionSnapshot,-4.6);
  const numbers=dashboardNumbers(stateOf([courtesy]));
  assert.equal(numbers.revenue,0);
  assert.equal(numbers.units,0);
  assert.equal(numbers.contribution,-4.6);
});

test("venda paga conta para faturamento e remuneração fica identificada",()=>{
  const sale=buildSaleOrder({items:[{product,quantity:2}],supplies:[ingredient,packaging],paymentFeePercent:0,totalReceived:12,paymentMethod:"pix",soldAt:"2026-09-11T12:00:00Z",transactionType:"sale"});
  const numbers=dashboardNumbers(stateOf([sale]));
  assert.equal(numbers.revenue,12);
  assert.equal(numbers.units,2);
  assert.equal(numbers.ownerRemuneration,4);
});

test("cliente é opcional, mas vendas identificadas geram recompra e preferência",()=>{
  const customer:Customer={id:"c1",name:"Maria",marketingConsent:false,active:true,createdAt:"2026-09-11T00:00:00Z",updatedAt:"2026-09-11T00:00:00Z"};
  const unidentified=buildSaleOrder({items:[{product,quantity:1}],supplies:[ingredient,packaging],paymentFeePercent:0,totalReceived:6,paymentMethod:"pix",soldAt:"2026-09-10T12:00:00Z"});
  assert.equal(unidentified.customerId,null);
  const first={...buildSaleOrder({items:[{product,quantity:1}],supplies:[ingredient,packaging],paymentFeePercent:0,totalReceived:6,paymentMethod:"pix",soldAt:"2026-09-11T12:00:00Z",customerId:"c1"}),id:"s1"};
  const second={...buildSaleOrder({items:[{product,quantity:2}],supplies:[ingredient,packaging],paymentFeePercent:0,totalReceived:12,paymentMethod:"pix",soldAt:"2026-09-12T12:00:00Z",customerId:"c1"}),id:"s2"};
  const insight=customerInsights(stateOf([first,second],[customer]),new Date("2026-09-13T12:00:00Z"))[0];
  assert.equal(insight.orders,2);
  assert.equal(insight.totalSpent,18);
  assert.equal(insight.units,3);
  assert.equal(insight.recurring,true);
  assert.equal(insight.favoriteProduct,"Teste");
});

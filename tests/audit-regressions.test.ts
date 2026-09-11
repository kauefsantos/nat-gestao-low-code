import test from "node:test";
import assert from "node:assert/strict";
import { buildSaleOrder, type NatState, type Product, type Supply } from "../src/domain/nat.js";
import { businessInsights, todaySalesSummary } from "../src/domain/insights.js";

const ingredient:Supply={id:"i",name:"Ingrediente",category:"ingredient",packageQuantity:100,packageUnit:"g",packagePrice:10,purchasedAt:"2026-09-01"};
const product:Product={id:"p",name:"Produto",available:false,batchYield:10,sellingPrice:6,lossPercent:0,laborCostPerBatch:0,productionCostPerBatch:0,minimumMarginPercent:10,targetMarginPercent:20,recipe:[{id:"r",supplyId:"i",quantity:100,unit:"g"}]};
const settings={ownerName:"NAT",monthlyFixedCosts:0,paymentFeePercent:0,pixFeePercent:0,cashFeePercent:0,cardFeePercent:0,defaultMinimumMarginPercent:10,defaultTargetMarginPercent:20,ownerHourlyRate:20,ownerDailyHours:3};
function state(sales:NatState["sales"]):NatState{return{version:6,supplies:[ingredient],products:[product],customers:[],sales,expenses:[],ownerCashMovements:[],settings,purchaseCashOut:0};}
function saleAt(date:string,id:string,totalReceived=6){return{...buildSaleOrder({items:[{product:{...product,available:true},quantity:1}],supplies:[ingredient],paymentFeePercent:0,totalReceived,paymentMethod:"pix",soldAt:`${date}T12:00:00Z`}),id};}

test("produto pausado segue bloqueado para venda, mas pode registrar saída não comercial",()=>{
  assert.throws(()=>buildSaleOrder({items:[{product,quantity:1}],supplies:[ingredient],paymentFeePercent:0,totalReceived:6,paymentMethod:"pix",soldAt:"2026-09-11T12:00:00Z",transactionType:"sale"}),/pausado/);
  const courtesy=buildSaleOrder({items:[{product,quantity:1}],supplies:[ingredient],paymentFeePercent:0,totalReceived:0,paymentMethod:"other",soldAt:"2026-09-11T12:00:00Z",transactionType:"courtesy"});
  assert.equal(courtesy.totalReceived,0);
  assert.ok(courtesy.contributionSnapshot<0);
});

test("resumo diário preserva receita paga e desconta perdas/cortesias da contribuição",()=>{
  const paid=saleAt("2026-09-11","paid",6);
  const courtesy={...buildSaleOrder({items:[{product,quantity:1}],supplies:[ingredient],paymentFeePercent:0,totalReceived:0,paymentMethod:"other",soldAt:"2026-09-11T15:00:00Z",transactionType:"courtesy"}),id:"courtesy"};
  const summary=todaySalesSummary(state([paid,courtesy]),new Date("2026-09-11T18:00:00Z"));
  assert.equal(summary.revenue,6);
  assert.equal(summary.units,1);
  assert.equal(summary.sales.length,1);
  assert.equal(summary.movements.length,2);
  assert.equal(summary.contribution,paid.contributionSnapshot+courtesy.contributionSnapshot);
});

test("amostra mínima exige dez vendas distribuídas por sete datas distintas",()=>{
  const sameDay=Array.from({length:10},(_,index)=>saleAt("2026-09-01",`same-${index}`));
  assert.equal(businessInsights(state(sameDay),new Date("2026-09-20T12:00:00Z")).readiness.ready,false);
  const sevenDays=Array.from({length:10},(_,index)=>saleAt(`2026-09-${String((index%7)+1).padStart(2,"0")}`,`spread-${index}`));
  const readiness=businessInsights(state(sevenDays),new Date("2026-09-20T12:00:00Z")).readiness;
  assert.equal(readiness.ready,true);
  assert.equal(readiness.distinctSalesDays,7);
});

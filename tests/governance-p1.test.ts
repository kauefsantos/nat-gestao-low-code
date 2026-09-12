import test from "node:test";
import assert from "node:assert/strict";
import { BUSINESS_TIME_ZONE, businessDateKey, businessInsights, todaySalesSummary } from "../src/domain/insights.js";
import type { NatState, Sale } from "../src/domain/nat.js";

const settings={ownerName:"NAT",monthlyFixedCosts:0,paymentFeePercent:0,pixFeePercent:0,cashFeePercent:0,cardFeePercent:0,defaultMinimumMarginPercent:35,defaultTargetMarginPercent:50,ownerHourlyRate:20,ownerDailyHours:3};

function sale(id:string,soldAt:string,totalReceived=10):Sale{return {id,productId:"p1",productName:"Produto",portfolioKey:null,customerId:null,transactionType:"sale",saleChannel:"other",deliveryCostSnapshot:0,discountReason:null,belowCostOverride:false,quantity:1,totalReceived,paymentMethod:"pix",soldAt,unitCostSnapshot:2,variableFeeSnapshot:0,contributionSnapshot:8,items:[{id:`${id}-line`,productId:"p1",productName:"Produto",portfolioKey:null,quantity:1,unitCostSnapshot:2,laborCostSnapshot:0,unitPriceSnapshot:totalReceived}],status:"completed",cancelledAt:null,cancelReason:null};}
function stateOf(sales:Sale[]):NatState{return {version:6,supplies:[],products:[],customers:[],sales,expenses:[],ownerCashMovements:[],settings,purchaseCashOut:0};}

test("indicadores usam America/Sao_Paulo como fuso operacional",()=>{
  assert.equal(BUSINESS_TIME_ZONE,"America/Sao_Paulo");
  assert.equal(businessDateKey("2026-09-12T02:30:00Z"),"2026-09-11");
  assert.equal(businessDateKey("2026-09-12T03:30:00Z"),"2026-09-12");
});

test("venda perto da meia-noite pertence ao mesmo dia do backend",()=>{
  const state=stateOf([sale("late","2026-09-12T02:30:00Z")]);
  const summary=todaySalesSummary(state,new Date("2026-09-12T01:00:00Z"));
  assert.equal(summary.sales.length,1);
  assert.equal(summary.revenue,10);
});

test("janela de sete dias é calculada por datas de Sao Paulo",()=>{
  const state=stateOf([
    sale("current-boundary","2026-09-05T03:30:00Z",20),
    sale("current-late","2026-09-12T02:30:00Z",30),
    sale("previous","2026-09-05T02:30:00Z",40),
  ]);
  const insights=businessInsights(state,new Date("2026-09-12T01:00:00Z"));
  assert.equal(insights.currentRevenue,50);
  assert.equal(insights.previousRevenue,40);
});

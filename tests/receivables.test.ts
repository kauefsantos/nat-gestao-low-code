import assert from "node:assert/strict";
import test from "node:test";
import { customerPaymentProfile, dashboardNumbers, receivableStage, saleValue, type Customer, type NatState, type Sale } from "../src/domain/nat.js";

const customer:Customer={id:"c1",name:"Cliente Teste",phone:"11999999999",marketingConsent:false,active:true,creditStatus:"normal",createdAt:"2026-09-01T12:00:00Z",updatedAt:"2026-09-01T12:00:00Z"};
function sale(overrides:Partial<Sale>={}):Sale{return{id:"s1",productId:"p1",productName:"Produto",customerId:"c1",transactionType:"sale",saleChannel:"whatsapp",quantity:2,totalReceived:0,saleValueSnapshot:20,paymentStatus:"pending",paymentPromisedDate:"2026-09-12",paymentPromisedTime:"10:00",paymentDueAt:"2026-09-12T13:00:00Z",paidAt:null,paymentCriticalAt:null,paymentMethod:"pix",soldAt:"2026-09-12T12:00:00Z",unitCostSnapshot:4,variableFeeSnapshot:0,contributionSnapshot:12,items:[{productId:"p1",productName:"Produto",quantity:2,unitCostSnapshot:4,unitPriceSnapshot:10}],status:"completed",...overrides};}
function state(sales:Sale[]):NatState{return{version:6,supplies:[],products:[],customers:[customer],sales,expenses:[],ownerCashMovements:[],purchaseCashOut:0,settings:{ownerName:"NAT",monthlyFixedCosts:0,paymentFeePercent:0,defaultMinimumMarginPercent:35,defaultTargetMarginPercent:50}};}

test("venda pendente separa faturamento de caixa",()=>{const current=state([sale()]);const numbers=dashboardNumbers(current);assert.equal(saleValue(current.sales[0]),20);assert.equal(numbers.revenue,20);assert.equal(numbers.receivedCash,0);assert.equal(numbers.receivables,20);assert.equal(numbers.cashIn,0);assert.equal(numbers.contribution,12);});

test("SLA muda de pendente para atraso em 5h e crítico em 48h",()=>{const pending=sale();assert.equal(receivableStage(pending,new Date("2026-09-12T17:59:59Z")),"pending");assert.equal(receivableStage(pending,new Date("2026-09-12T18:00:00Z")),"overdue");assert.equal(receivableStage(pending,new Date("2026-09-14T13:00:00Z")),"critical");});

test("marcação crítica do backend prevalece",()=>{assert.equal(receivableStage(sale({paymentCriticalAt:"2026-09-13T10:00:00Z"}),new Date("2026-09-13T10:01:00Z")),"critical");});

test("perfil reconhece bom pagador depois da quitação",()=>{const paid=sale({paymentStatus:"paid",totalReceived:20,paidAt:"2026-09-12T15:00:00Z"});const profile=customerPaymentProfile(state([paid]),"c1",new Date("2026-09-13T00:00:00Z"));assert.equal(profile.status,"good");assert.equal(profile.pendingAmount,0);});

test("perfil crítico permanece como histórico de advertência após quitação",()=>{const paid=sale({paymentStatus:"paid",totalReceived:20,paidAt:"2026-09-15T15:00:00Z",paymentCriticalAt:"2026-09-14T13:00:00Z"});const profile=customerPaymentProfile(state([paid]),"c1",new Date("2026-09-16T00:00:00Z"));assert.equal(profile.status,"warning_history");assert.equal(profile.warningHistory,1);});

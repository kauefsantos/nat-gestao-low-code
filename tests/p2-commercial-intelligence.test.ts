import test from "node:test";
import assert from "node:assert/strict";
import { buildSaleOrder, channelAnalytics, cohortAnalytics, customerInsights, productPairs, productProfitability, promotionAnalytics, type NatState, type Product, type Supply } from "../src/domain/nat.js";

const ingredient:Supply={id:"i",name:"Ingrediente",category:"ingredient",packageQuantity:100,packageUnit:"g",packagePrice:10,purchasedAt:"2026-09-11"};
const packaging:Supply={id:"p",name:"Embalagem",category:"packaging",packageQuantity:10,packageUnit:"unit",packagePrice:5,purchasedAt:"2026-09-11"};
const product:Product={id:"prod",name:"Produto A",batchYield:10,sellingPrice:6,lossPercent:0,laborCostPerBatch:10,productionCostPerBatch:0,minimumMarginPercent:10,targetMarginPercent:15,recipe:[{id:"r1",supplyId:"i",quantity:100,unit:"g"},{id:"r2",supplyId:"p",quantity:10,unit:"unit"}]};
const productB:Product={...product,id:"prod-b",name:"Produto B"};
const settings={ownerName:"NAT",monthlyFixedCosts:0,paymentFeePercent:0,pixFeePercent:0,cashFeePercent:0,cardFeePercent:0,defaultMinimumMarginPercent:10,defaultTargetMarginPercent:15,ownerHourlyRate:20,ownerDailyHours:3};
function state(sales:NatState["sales"]):NatState{return{version:6,supplies:[ingredient,packaging],products:[product,productB],customers:[{id:"c1",name:"Cliente fictício",marketingConsent:false,active:true,createdAt:"2026-09-01",updatedAt:"2026-09-01"}],sales,expenses:[],ownerCashMovements:[],settings,purchaseCashOut:0};}

test("entrega reduz contribuição sem alterar custo unitário",()=>{
 const noDelivery=buildSaleOrder({items:[{product,quantity:2}],supplies:[ingredient,packaging],paymentFeePercent:0,totalReceived:12,paymentMethod:"pix",soldAt:"2026-09-11T12:00:00Z"});
 const withDelivery=buildSaleOrder({items:[{product,quantity:2}],supplies:[ingredient,packaging],paymentFeePercent:0,totalReceived:12,paymentMethod:"pix",soldAt:"2026-09-11T12:00:00Z",deliveryCost:2});
 assert.equal(withDelivery.unitCostSnapshot,noDelivery.unitCostSnapshot);
 assert.equal(withDelivery.contributionSnapshot,noDelivery.contributionSnapshot-2);
});

test("venda abaixo do custo exige override e motivo",()=>{
 assert.throws(()=>buildSaleOrder({items:[{product,quantity:2}],supplies:[ingredient,packaging],paymentFeePercent:0,totalReceived:1,paymentMethod:"pix",soldAt:"2026-09-11T12:00:00Z",discountReason:"Promo"}),/abaixo do custo/);
 const sale=buildSaleOrder({items:[{product,quantity:2}],supplies:[ingredient,packaging],paymentFeePercent:0,totalReceived:1,paymentMethod:"pix",soldAt:"2026-09-11T12:00:00Z",discountReason:"Promo consciente",belowCostOverride:true});
 assert.ok(sale.contributionSnapshot<0);
});

test("quantidade fracionada de produto acabado é rejeitada",()=>{
 assert.throws(()=>buildSaleOrder({items:[{product,quantity:1.5}],supplies:[ingredient,packaging],paymentFeePercent:0,totalReceived:9,paymentMethod:"pix",soldAt:"2026-09-11T12:00:00Z"}),/inteiro/);
});

test("analytics preserva soma de contribuição ao ratear entrega e taxa",()=>{
 const sale=buildSaleOrder({items:[{product,quantity:1},{product:productB,quantity:1}],supplies:[ingredient,packaging],paymentFeePercent:5,totalReceived:12,paymentMethod:"card",soldAt:"2026-09-11T12:00:00Z",deliveryCost:1,saleChannel:"street",customerId:"c1"});
 const rows=productProfitability(state([sale]));
 assert.equal(Math.round(rows.reduce((s,x)=>s+x.contribution,0)*100)/100,Math.round(sale.contributionSnapshot*100)/100);
 assert.equal(channelAnalytics(state([sale]))[0].channel,"street");
});

test("mix exige duas ocorrências e coorte/recompra são determinísticos",()=>{
 const first=buildSaleOrder({items:[{product,quantity:1},{product:productB,quantity:1}],supplies:[ingredient,packaging],paymentFeePercent:0,totalReceived:12,paymentMethod:"pix",soldAt:"2026-09-01T12:00:00Z",customerId:"c1"});
 const second=buildSaleOrder({items:[{product,quantity:1},{product:productB,quantity:1}],supplies:[ingredient,packaging],paymentFeePercent:0,totalReceived:12,paymentMethod:"pix",soldAt:"2026-09-10T12:00:00Z",customerId:"c1"});
 const s=state([first,second]);
 assert.equal(productPairs(s)[0].count,2);
 assert.equal(cohortAnalytics(s)[0].repurchased,1);
 assert.equal(customerInsights(s,new Date("2026-09-11T12:00:00Z"))[0].segment,"Recorrente");
});

test("promoções usam preço de tabela congelado sem reprecificar contribuição histórica",()=>{
 const built=buildSaleOrder({items:[{product,quantity:2}],supplies:[ingredient,packaging],paymentFeePercent:0,totalReceived:10,paymentMethod:"pix",soldAt:"2026-09-11T12:00:00Z",discountReason:"Promo"});
 const sale={...built,items:built.items.map((line)=>({...line,listUnitPriceSnapshot:product.sellingPrice}))};
 const p=promotionAnalytics(state([sale]));
 assert.equal(p.discountedOrders,1);
 assert.equal(p.discountValue,2);
 assert.equal(p.contribution,sale.contributionSnapshot);
});

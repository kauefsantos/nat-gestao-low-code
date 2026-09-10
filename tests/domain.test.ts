import test from "node:test";
import assert from "node:assert/strict";
import { buildSale, productCost, supplyUsageCost, supplyUnitCost, type Product, type Supply } from "../src/domain/nat.js";
import { parseRecipeCsv } from "../src/domain/recipe-csv.js";

const eggs: Supply = { id: "00000000-0000-4000-8000-000000000001", name: "Ovos", category: "ingredient", packageQuantity: 12, packageUnit: "unit", packagePrice: 12, purchasedAt: "2026-09-09" };
const chocolate: Supply = { id: "00000000-0000-4000-8000-000000000002", name: "Chocolate", category: "ingredient", packageQuantity: 1, packageUnit: "kg", packagePrice: 30, purchasedAt: "2026-09-09" };

test("normaliza custo por unidade e fração", () => { assert.equal(supplyUnitCost(eggs),1); assert.equal(supplyUsageCost(eggs,0.5,"unit"),0.5); });
test("converte kg para g", () => { assert.equal(supplyUnitCost(chocolate),0.03); assert.equal(supplyUsageCost(chocolate,100,"g"),3); });
test("unidade incompatível falha fechada", () => { assert.ok(Number.isNaN(supplyUsageCost(chocolate,100,"ml"))); });
test("margem impossível não produz preço falso", () => { const product: Product = { id:"p",name:"Teste",batchYield:10,sellingPrice:5,lossPercent:0,productionCostPerBatch:0,minimumMarginPercent:90,targetMarginPercent:90,recipe:[{ id:"r",supplyId:chocolate.id,quantity:100,unit:"g" }] }; const result=productCost(product,[chocolate],20); assert.equal(result.pricingValid,false); assert.ok(Number.isNaN(result.recommendedPrice)); });
test("snapshot de venda usa custo vigente", () => { const product: Product = { id:"p",name:"Brownie",batchYield:10,sellingPrice:5,lossPercent:0,productionCostPerBatch:1,minimumMarginPercent:35,targetMarginPercent:50,recipe:[{ id:"r",supplyId:chocolate.id,quantity:100,unit:"g" }] }; const sale=buildSale({ product,supplies:[chocolate],paymentFeePercent:5,quantity:2,totalReceived:10,paymentMethod:"pix",soldAt:"2026-09-09T12:00:00Z" }); assert.equal(Number(sale.unitCostSnapshot.toFixed(2)),0.4); assert.equal(Number(sale.contributionSnapshot.toFixed(2)),8.7); });
test("CSV importa receita por nome, quantidade e unidade", () => { const parsed=parseRecipeCsv("Ingrediente;Quantidade;Unidade\nChocolate;100;g\nOvos;0,5;un",[chocolate,eggs]); assert.deepEqual(parsed.errors,[]); assert.equal(parsed.items.length,2); assert.equal(parsed.items.find((item)=>item.supplyId===eggs.id)?.quantity,0.5); });
test("CSV rejeita ingrediente desconhecido", () => { const parsed=parseRecipeCsv("Ingrediente;Quantidade;Unidade\nFarinha;100;g",[chocolate]); assert.equal(parsed.items.length,0); assert.equal(parsed.errors.length,1); });

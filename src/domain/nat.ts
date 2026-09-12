import type { FundingSource } from "./funding.js";

export type SupplyCategory = "ingredient" | "packaging" | "other";
export type Unit = "g" | "kg" | "ml" | "l" | "unit";
export type PaymentMethod = "pix" | "cash" | "card" | "other";
export type SaleStatus = "completed" | "cancelled";
export type TransactionType = "sale" | "courtesy" | "personal_consumption" | "loss";
export type OwnerCashMovementType = "contribution" | "withdrawal";
export type SaleChannel = "whatsapp" | "instagram" | "street" | "referral" | "in_person" | "other";

export type Supply = { id: string; name: string; category: SupplyCategory; packageQuantity: number; packageUnit: Unit; packagePrice: number; purchasedAt: string; fundingSource?:FundingSource };
export type RecipeItem = { id: string; supplyId: string; quantity: number; unit: Unit };
export type Product = { id: string; name: string; portfolioKey?: string | null; available?: boolean; batchYield: number; sellingPrice: number; lossPercent: number; laborCostPerBatch?: number; productionCostPerBatch: number; minimumMarginPercent: number; targetMarginPercent: number; recipe: RecipeItem[] };
export type Customer = { id:string; name:string; phone?:string|null; instagram?:string|null; source?:string|null; marketingConsent:boolean; notes?:string|null; active:boolean; createdAt:string; updatedAt:string };
export type SaleLine = { id?: string; productId: string; productName: string; portfolioKey?: string | null; quantity: number; unitCostSnapshot: number; laborCostSnapshot?: number; unitPriceSnapshot: number };
export type Sale = {
  id: string;
  productId: string;
  productName: string;
  portfolioKey?: string | null;
  customerId?: string | null;
  transactionType?: TransactionType;
  saleChannel?: SaleChannel;
  deliveryCostSnapshot?: number;
  discountReason?: string | null;
  belowCostOverride?: boolean;
  quantity: number;
  totalReceived: number;
  paymentMethod: PaymentMethod;
  soldAt: string;
  unitCostSnapshot: number;
  variableFeeSnapshot: number;
  contributionSnapshot: number;
  items: SaleLine[];
  status: SaleStatus;
  cancelledAt?: string | null;
  cancelReason?: string | null;
};
export type SporadicExpense = { id: string; name: string; amount: number; spentAt: string; fundingSource?:FundingSource };
export type OwnerCashMovement = { id:string; movementType:OwnerCashMovementType; amount:number; occurredAt:string; note?:string|null; createdAt?:string; updatedAt?:string };
export type Settings = {
  ownerName: string;
  monthlyFixedCosts: number;
  paymentFeePercent: number;
  pixFeePercent?: number;
  cashFeePercent?: number;
  cardFeePercent?: number;
  defaultMinimumMarginPercent: number;
  defaultTargetMarginPercent: number;
  ownerHourlyRate?:number;
  ownerDailyHours?:number;
  fixedCostFundingSource?:FundingSource;
};
export type NatState = { version: 3|4|5|6; supplies: Supply[]; products: Product[]; customers?:Customer[]; sales: Sale[]; expenses: SporadicExpense[]; ownerCashMovements?:OwnerCashMovement[]; settings: Settings; purchaseCashOut?:number };

export const initialState: NatState = {
  version: 6,
  supplies: [], products: [], customers:[], sales: [], expenses: [], ownerCashMovements:[], purchaseCashOut:0,
  settings: { ownerName: "NAT", monthlyFixedCosts: 0, paymentFeePercent: 0, pixFeePercent:0, cashFeePercent:0, cardFeePercent:0, defaultMinimumMarginPercent: 35, defaultTargetMarginPercent: 50, ownerHourlyRate:20, ownerDailyHours:3,fixedCostFundingSource:"owner" }
};
export const unitLabel: Record<Unit, string> = { g: "g", kg: "kg", ml: "ml", l: "L", unit: "un" };
export const paymentLabel: Record<PaymentMethod, string> = { pix: "Pix", cash: "Dinheiro", card: "Cartão", other: "Outro" };
export const transactionTypeLabel:Record<TransactionType,string>={ sale:"Venda",courtesy:"Cortesia",personal_consumption:"Consumo próprio",loss:"Perda" };
export const ownerCashMovementLabel:Record<OwnerCashMovementType,string>={ contribution:"Dinheiro colocado no negócio",withdrawal:"Retirada dos donos" };
export const saleChannelLabel:Record<SaleChannel,string>={ whatsapp:"WhatsApp",instagram:"Instagram",street:"Rua",referral:"Indicação",in_person:"Presencial",other:"Não informado" };

export function id(_prefix: string) { return crypto.randomUUID(); }
export function money(value: number) { if (!Number.isFinite(value)) return "—"; return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value); }
export function percent(value: number) { if (!Number.isFinite(value)) return "—"; return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}%`; }

export function paymentFeeForMethod(settings:Settings,method:PaymentMethod){
  if(method==="pix") return Math.max(0,settings.pixFeePercent??0);
  if(method==="cash") return Math.max(0,settings.cashFeePercent??0);
  if(method==="card") return Math.max(0,settings.cardFeePercent??0);
  return Math.max(0,settings.paymentFeePercent??0);
}
export function pricingFeePercent(settings:Settings){ return Math.max(paymentFeeForMethod(settings,"pix"),paymentFeeForMethod(settings,"cash"),paymentFeeForMethod(settings,"card"),Math.max(0,settings.paymentFeePercent??0)); }

type Dimension = "mass" | "volume" | "unit";
function baseQuantity(quantity: number, unit: Unit): { value: number; dimension: Dimension } {
  switch (unit) { case "kg": return { value: quantity * 1000, dimension: "mass" }; case "g": return { value: quantity, dimension: "mass" }; case "l": return { value: quantity * 1000, dimension: "volume" }; case "ml": return { value: quantity, dimension: "volume" }; case "unit": return { value: quantity, dimension: "unit" }; }
}
export function compatibleUnits(unit: Unit): Unit[] { if (unit === "kg" || unit === "g") return ["g", "kg"]; if (unit === "l" || unit === "ml") return ["ml", "l"]; return ["unit"]; }
export function preferredUsageUnit(unit: Unit): Unit { if (unit === "kg" || unit === "g") return "g"; if (unit === "l" || unit === "ml") return "ml"; return "unit"; }
export function supplyUnitCost(supply: Supply) { const base = baseQuantity(supply.packageQuantity, supply.packageUnit); return base.value > 0 ? supply.packagePrice / base.value : Number.NaN; }
export function supplyUsageCost(supply: Supply, quantity: number, unit: Unit) { const packageBase = baseQuantity(supply.packageQuantity, supply.packageUnit); const usageBase = baseQuantity(quantity, unit); if (packageBase.dimension !== usageBase.dimension || packageBase.value <= 0 || usageBase.value <= 0) return Number.NaN; return (supply.packagePrice / packageBase.value) * usageBase.value; }

export type ProductCost = { ingredientBatch: number; packagingBatch: number; laborBatch:number; productionBatch: number; lossBatch: number; totalBatch: number; unitCost: number; minimumPrice: number; recommendedPrice: number; contributionAtCurrentPrice: number; marginAtCurrentPrice: number; recipeValid: boolean; pricingValid: boolean; };
export function productCost(product: Product, supplies: Supply[], paymentFeePercent: number): ProductCost {
  let ingredientBatch = 0; let lossEligibleBatch=0; let packagingBatch = 0; let recipeValid = true;
  for (const item of product.recipe) { const supply = supplies.find((candidate) => candidate.id === item.supplyId); if (!supply) { recipeValid = false; continue; } const cost = supplyUsageCost(supply, item.quantity, item.unit); if (!Number.isFinite(cost)) { recipeValid = false; continue; } if (supply.category === "packaging") packagingBatch += cost; else { ingredientBatch += cost; if(supply.category==="ingredient") lossEligibleBatch += cost; } }
  const laborBatch=Math.max(0,product.laborCostPerBatch??0); const productionBatch = Math.max(0, product.productionCostPerBatch); const lossBatch = recipeValid ? lossEligibleBatch * Math.max(0, product.lossPercent) / 100 : Number.NaN; const totalBatch = recipeValid ? ingredientBatch + lossBatch + packagingBatch + laborBatch + productionBatch : Number.NaN; const unitCost = product.batchYield > 0 && Number.isFinite(totalBatch) ? totalBatch / product.batchYield : Number.NaN;
  const fee = Math.max(0, paymentFeePercent) / 100; const minimumMargin = Math.max(0, product.minimumMarginPercent) / 100; const targetMargin = Math.max(0, product.targetMarginPercent) / 100; const minimumDenominator = 1 - minimumMargin - fee; const targetDenominator = 1 - targetMargin - fee; const pricingValid = targetMargin>=minimumMargin && minimumDenominator > 0 && targetDenominator > 0; const minimumPrice = pricingValid && Number.isFinite(unitCost) ? unitCost / minimumDenominator : Number.NaN; const recommendedPrice = pricingValid && Number.isFinite(unitCost) ? unitCost / targetDenominator : Number.NaN; const variableFee = product.sellingPrice * fee; const contributionAtCurrentPrice = Number.isFinite(unitCost) ? product.sellingPrice - unitCost - variableFee : Number.NaN; const marginAtCurrentPrice = product.sellingPrice > 0 && Number.isFinite(contributionAtCurrentPrice) ? contributionAtCurrentPrice / product.sellingPrice * 100 : Number.NaN;
  return { ingredientBatch, packagingBatch, laborBatch, productionBatch, lossBatch, totalBatch, unitCost, minimumPrice, recommendedPrice, contributionAtCurrentPrice, marginAtCurrentPrice, recipeValid, pricingValid };
}

export function activeSaleLines(sale: Sale): SaleLine[] { return sale.items?.length ? sale.items : [{ productId: sale.productId, productName: sale.productName, portfolioKey: sale.portfolioKey ?? null, quantity: sale.quantity, unitCostSnapshot: sale.unitCostSnapshot, laborCostSnapshot:0, unitPriceSnapshot: sale.quantity > 0 ? sale.totalReceived / sale.quantity : 0 }]; }
export function monthSales(sales: Sale[], now = new Date()) { return sales.filter((sale) => { if (sale.status === "cancelled") return false; const date = new Date(sale.soldAt); return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth(); }); }
function monthExpenses(expenses: SporadicExpense[], now = new Date()) { return expenses.filter((expense) => { const date = new Date(`${expense.spentAt.slice(0,10)}T12:00:00`); return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth(); }); }
function monthOwnerCashMovements(movements:OwnerCashMovement[],now=new Date()){ return movements.filter((movement)=>{const date=new Date(`${movement.occurredAt.slice(0,10)}T12:00:00`);return date.getFullYear()===now.getFullYear()&&date.getMonth()===now.getMonth();}); }
export function dashboardNumbers(state: NatState) {
  const movements = monthSales(state.sales); const commercialSales=movements.filter((sale)=>(sale.transactionType??"sale")==="sale"); const expenses = monthExpenses(state.expenses); const ownerCash=monthOwnerCashMovements(state.ownerCashMovements??[]); const ownerContributions=ownerCash.filter((m)=>m.movementType==="contribution").reduce((sum,m)=>sum+m.amount,0); const ownerWithdrawals=ownerCash.filter((m)=>m.movementType==="withdrawal").reduce((sum,m)=>sum+m.amount,0); const revenue = commercialSales.reduce((sum, sale) => sum + sale.totalReceived, 0); const units = commercialSales.reduce((sum, sale) => sum + activeSaleLines(sale).reduce((lineSum,line) => lineSum + line.quantity,0), 0); const contribution = movements.reduce((sum, sale) => sum + sale.contributionSnapshot, 0); const ownerRemuneration=movements.reduce((sum,sale)=>sum+activeSaleLines(sale).reduce((lineSum,line)=>lineSum+(line.laborCostSnapshot??0)*line.quantity,0),0); const sporadicExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0); const resultBeforeOwner=contribution+ownerRemuneration-state.settings.monthlyFixedCosts-sporadicExpenses; const estimatedResult = contribution-state.settings.monthlyFixedCosts-sporadicExpenses; const cashIn=revenue+ownerContributions; const cashOut=(state.purchaseCashOut??0)+sporadicExpenses+state.settings.monthlyFixedCosts+ownerWithdrawals; const cashAvailable=cashIn-cashOut; const cashAfterOwner=cashAvailable-ownerRemuneration;
  const byProduct = new Map<string, { name: string; quantity: number }>(); for (const sale of commercialSales) for (const line of activeSaleLines(sale)) { const current = byProduct.get(line.productId) ?? { name: line.productName, quantity: 0 }; current.quantity += line.quantity; byProduct.set(line.productId, current); }
  const topProduct = [...byProduct.values()].sort((a,b) => b.quantity - a.quantity)[0] ?? null; return { sales:commercialSales,movements, expenses, ownerCash, revenue, units, contribution, ownerRemuneration, sporadicExpenses, resultBeforeOwner, estimatedResult, cashIn,cashOut,cashAvailable,cashAfterOwner,purchaseCashOut:state.purchaseCashOut??0,ownerContributions,ownerWithdrawals,topProduct };
}

function recencyScore(days:number|null,orders:number){ if(!orders||days===null)return 0;if(days<=7)return 5;if(days<=14)return 4;if(days<=30)return 3;if(days<=60)return 2;return 1; }
function frequencyScore(orders:number){if(orders>=8)return 5;if(orders>=5)return 4;if(orders>=3)return 3;if(orders>=2)return 2;if(orders>=1)return 1;return 0;}
function valueScore(value:number){if(value>=500)return 5;if(value>=250)return 4;if(value>=100)return 3;if(value>=50)return 2;if(value>0)return 1;return 0;}
export type CustomerSegment="Novo"|"Recorrente"|"VIP"|"Em risco"|"Inativo"|"Sem compra paga";
export type CustomerInsight={customer:Customer;firstPurchase:string|null;lastPurchase:string|null;orders:number;totalSpent:number;averageTicket:number;units:number;daysSinceLast:number|null;recurring:boolean;favoriteProduct:string|null;nonCommercialInteractions:number;recencyScore:number;frequencyScore:number;valueScore:number;rfmTotal:number;contribution:number;marginPercent:number;segment:CustomerSegment};
function customerSegment(orders:number,totalSpent:number,days:number|null):CustomerSegment{ if(!orders)return "Sem compra paga"; if(days!==null&&days>=60)return "Inativo"; if(days!==null&&days>=30)return "Em risco"; if(orders>=4&&totalSpent>=100)return "VIP"; if(orders>=2)return "Recorrente"; return "Novo"; }
export function customerInsights(state:NatState,now=new Date()):CustomerInsight[]{
  type Acc={orders:number;totalSpent:number;units:number;contribution:number;nonCommercialInteractions:number;first:string|null;last:string|null;products:Map<string,{name:string;qty:number}>};
  const activeCustomers=(state.customers??[]).filter((customer)=>customer.active);const activeIds=new Set(activeCustomers.map((customer)=>customer.id));const byCustomer=new Map<string,Acc>();
  const get=(id:string)=>{const current=byCustomer.get(id);if(current)return current;const created:Acc={orders:0,totalSpent:0,units:0,contribution:0,nonCommercialInteractions:0,first:null,last:null,products:new Map()};byCustomer.set(id,created);return created;};
  for(const sale of state.sales){if(sale.status==="cancelled"||!sale.customerId||!activeIds.has(sale.customerId))continue;const acc=get(sale.customerId);if((sale.transactionType??"sale")!=="sale"){acc.nonCommercialInteractions+=1;continue;}acc.orders+=1;acc.totalSpent+=sale.totalReceived;acc.contribution+=sale.contributionSnapshot;if(!acc.first||+new Date(sale.soldAt)<+new Date(acc.first))acc.first=sale.soldAt;if(!acc.last||+new Date(sale.soldAt)>+new Date(acc.last))acc.last=sale.soldAt;for(const line of activeSaleLines(sale)){acc.units+=line.quantity;const product=acc.products.get(line.productId)??{name:line.productName,qty:0};product.qty+=line.quantity;acc.products.set(line.productId,product);}}
  return activeCustomers.map((customer)=>{const acc=byCustomer.get(customer.id)??{orders:0,totalSpent:0,units:0,contribution:0,nonCommercialInteractions:0,first:null,last:null,products:new Map<string,{name:string;qty:number}>()};const favorite=[...acc.products.values()].sort((a,b)=>b.qty-a.qty)[0]?.name??null;const daysSinceLast=acc.last?Math.max(0,Math.floor((now.getTime()-new Date(acc.last).getTime())/86400000)):null;const r=recencyScore(daysSinceLast,acc.orders);const f=frequencyScore(acc.orders);const v=valueScore(acc.totalSpent);return{customer,firstPurchase:acc.first,lastPurchase:acc.last,orders:acc.orders,totalSpent:acc.totalSpent,averageTicket:acc.orders?acc.totalSpent/acc.orders:0,units:acc.units,daysSinceLast,recurring:acc.orders>=2,favoriteProduct:favorite,nonCommercialInteractions:acc.nonCommercialInteractions,recencyScore:r,frequencyScore:f,valueScore:v,rfmTotal:r+f+v,contribution:acc.contribution,marginPercent:acc.totalSpent>0?acc.contribution/acc.totalSpent*100:0,segment:customerSegment(acc.orders,acc.totalSpent,daysSinceLast)};});
}
export function customerOverview(state:NatState,now=new Date()){
  const insights=customerInsights(state,now); const customersWithOrders=insights.filter((x)=>x.orders>0); const recurrent=customersWithOrders.filter((x)=>x.recurring); const newThisMonth=customersWithOrders.filter((x)=>{if(!x.firstPurchase)return false;const d=new Date(x.firstPurchase);return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth();}); const orders=customersWithOrders.reduce((s,x)=>s+x.orders,0); const sourceMap=new Map<string,{source:string;customers:number;revenue:number;orders:number;recurring:number}>(); for(const row of customersWithOrders){const source=row.customer.source?.trim()||"Não informado";const current=sourceMap.get(source)??{source,customers:0,revenue:0,orders:0,recurring:0};current.customers+=1;current.revenue+=row.totalSpent;current.orders+=row.orders;if(row.recurring)current.recurring+=1;sourceMap.set(source,current);} return {activeCustomers:insights.length,newThisMonth:newThisMonth.length,recurrent:recurrent.length,repurchaseRate:customersWithOrders.length?recurrent.length/customersWithOrders.length*100:0,averageTicket:orders?customersWithOrders.reduce((s,x)=>s+x.totalSpent,0)/orders:0,inactive:customersWithOrders.filter((x)=>x.daysSinceLast!==null&&x.daysSinceLast>=30).length,sourceBreakdown:[...sourceMap.values()].map((x)=>({...x,ticket:x.orders?x.revenue/x.orders:0,repurchaseRate:x.customers?x.recurring/x.customers*100:0})).sort((a,b)=>b.revenue-a.revenue)};
}

export type ProductProfitability={productId:string;name:string;units:number;orders:number;revenue:number;productCost:number;labor:number;allocatedFee:number;allocatedDelivery:number;contribution:number;marginPercent:number;averageOrderTicket:number};
export function productProfitability(state:NatState):ProductProfitability[]{
  const map=new Map<string,ProductProfitability&{orderIds:Set<string>}>();
  const sales=state.sales.filter((s)=>s.status!=="cancelled"&&(s.transactionType??"sale")==="sale");
  for(const sale of sales){const lines=activeSaleLines(sale);const revenueBase=lines.reduce((sum,l)=>sum+l.unitPriceSnapshot*l.quantity,0)||sale.totalReceived||1;for(const line of lines){const lineRevenue=line.unitPriceSnapshot*line.quantity;const share=revenueBase>0?lineRevenue/revenueBase:1/lines.length;const cost=line.unitCostSnapshot*line.quantity;const fee=(sale.variableFeeSnapshot??0)*share;const delivery=(sale.deliveryCostSnapshot??0)*share;const contribution=lineRevenue-cost-fee-delivery;const current=map.get(line.productId)??{productId:line.productId,name:line.productName,units:0,orders:0,revenue:0,productCost:0,labor:0,allocatedFee:0,allocatedDelivery:0,contribution:0,marginPercent:0,averageOrderTicket:0,orderIds:new Set<string>()};current.units+=line.quantity;current.revenue+=lineRevenue;current.productCost+=cost;current.labor+=(line.laborCostSnapshot??0)*line.quantity;current.allocatedFee+=fee;current.allocatedDelivery+=delivery;current.contribution+=contribution;current.orderIds.add(sale.id);map.set(line.productId,current);}}
  return [...map.values()].map(({orderIds,...x})=>({...x,orders:orderIds.size,marginPercent:x.revenue>0?x.contribution/x.revenue*100:0,averageOrderTicket:orderIds.size?x.revenue/orderIds.size:0})).sort((a,b)=>b.contribution-a.contribution);
}
export function channelAnalytics(state:NatState){const map=new Map<SaleChannel,{channel:SaleChannel;orders:number;revenue:number;contribution:number}>();for(const sale of state.sales.filter((s)=>s.status!=="cancelled"&&(s.transactionType??"sale")==="sale")){const channel=sale.saleChannel??"other";const row=map.get(channel)??{channel,orders:0,revenue:0,contribution:0};row.orders+=1;row.revenue+=sale.totalReceived;row.contribution+=sale.contributionSnapshot;map.set(channel,row);}return [...map.values()].map((x)=>({...x,ticket:x.orders?x.revenue/x.orders:0})).sort((a,b)=>b.revenue-a.revenue);}
export function productPairs(state:NatState){const map=new Map<string,{a:string;b:string;count:number}>();for(const sale of state.sales.filter((s)=>s.status!=="cancelled"&&(s.transactionType??"sale")==="sale")){const names=[...new Set(activeSaleLines(sale).map((l)=>l.productName))].sort();for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){const key=`${names[i]}|${names[j]}`;const row=map.get(key)??{a:names[i],b:names[j],count:0};row.count+=1;map.set(key,row);}}return [...map.values()].filter((x)=>x.count>=2).sort((a,b)=>b.count-a.count);}
export function cohortAnalytics(state:NatState){const paid=state.sales.filter((s)=>s.status!=="cancelled"&&(s.transactionType??"sale")==="sale"&&s.customerId);const byCustomer=new Map<string,Sale[]>();for(const s of paid){const list=byCustomer.get(s.customerId!)??[];list.push(s);byCustomer.set(s.customerId!,list);}const cohorts=new Map<string,{cohort:string;customers:number;repurchased:number}>();for(const sales of byCustomer.values()){sales.sort((a,b)=>+new Date(a.soldAt)-+new Date(b.soldAt));const d=new Date(sales[0].soldAt);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;const row=cohorts.get(key)??{cohort:key,customers:0,repurchased:0};row.customers+=1;if(sales.length>=2)row.repurchased+=1;cohorts.set(key,row);}return [...cohorts.values()].map((x)=>({...x,repurchaseRate:x.customers?x.repurchased/x.customers*100:0})).sort((a,b)=>a.cohort.localeCompare(b.cohort));}
export function averageSecondPurchaseDays(state:NatState){const paid=state.sales.filter((s)=>s.status!=="cancelled"&&(s.transactionType??"sale")==="sale"&&s.customerId);const byCustomer=new Map<string,Sale[]>();for(const s of paid){const list=byCustomer.get(s.customerId!)??[];list.push(s);byCustomer.set(s.customerId!,list);}const days:number[]=[];for(const sales of byCustomer.values()){if(sales.length<2)continue;sales.sort((a,b)=>+new Date(a.soldAt)-+new Date(b.soldAt));days.push((+new Date(sales[1].soldAt)-+new Date(sales[0].soldAt))/86400000);}return {sample:days.length,days:days.length?days.reduce((a,b)=>a+b,0)/days.length:null,baseSmall:days.length<5};}
export function promotionAnalytics(state:NatState){const sales=state.sales.filter((s)=>s.status!=="cancelled"&&(s.transactionType??"sale")==="sale");let discountedOrders=0,discountValue=0,contribution=0;for(const sale of sales){const list=activeSaleLines(sale).reduce((sum,l)=>{const p=state.products.find((x)=>x.id===l.productId);return sum+(p?.sellingPrice??l.unitPriceSnapshot)*l.quantity;},0);if(sale.totalReceived+0.005<list){discountedOrders+=1;discountValue+=list-sale.totalReceived;contribution+=sale.contributionSnapshot;}}return{discountedOrders,discountValue,contribution};}

export function buildSaleOrder(args: { items: Array<{ product: Product; quantity: number }>; supplies: Supply[]; paymentFeePercent: number; totalReceived: number; paymentMethod: PaymentMethod; soldAt: string; customerId?:string|null; transactionType?:TransactionType; saleChannel?:SaleChannel; deliveryCost?:number; discountReason?:string|null; belowCostOverride?:boolean }): Sale {
  if (!args.items.length) throw new Error("Adicione pelo menos um produto."); const transactionType=args.transactionType??"sale"; const received=transactionType==="sale"?args.totalReceived:0; const seen = new Set<string>(); let totalCost = 0; let totalQuantity = 0; let listTotal = 0;
  const prepared = args.items.map(({ product, quantity }) => { if (transactionType==="sale"&&product.available === false) throw new Error(`${product.name} está pausado e não pode entrar em uma nova venda.`); if (seen.has(product.id)) throw new Error("O mesmo produto não pode aparecer duas vezes."); seen.add(product.id); if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) throw new Error("A quantidade precisa ser um número inteiro maior que zero."); const metrics = productCost(product,args.supplies,args.paymentFeePercent); if (!metrics.recipeValid || !Number.isFinite(metrics.unitCost)) throw new Error("Não foi possível calcular o custo desta movimentação."); totalCost += metrics.unitCost * quantity; totalQuantity += quantity; listTotal += product.sellingPrice * quantity; return { product, quantity, unitCost: metrics.unitCost,unitLabor:product.batchYield>0?(product.laborCostPerBatch??0)/product.batchYield:0,listValue: product.sellingPrice * quantity }; });
  const deliveryCost=transactionType==="sale"?Math.max(0,args.deliveryCost??0):0; const variableFeeSnapshot = transactionType==="sale"?received * Math.max(0,args.paymentFeePercent) / 100:0; const contributionSnapshot = received - totalCost - variableFeeSnapshot - deliveryCost; const discountReason=(args.discountReason??"").trim()||null; if(transactionType==="sale"&&received+0.005<listTotal&&!discountReason) throw new Error("Informe o motivo do desconto."); if(transactionType==="sale"&&contributionSnapshot<0&&!args.belowCostOverride) throw new Error("Esta venda fica abaixo do custo. Confirme conscientemente para continuar."); if(transactionType==="sale"&&contributionSnapshot<0&&args.belowCostOverride&&!discountReason) throw new Error("Informe o motivo para confirmar uma venda abaixo do custo.");
  const items: SaleLine[] = prepared.map(({ product,quantity,unitCost,unitLabor,listValue }) => { const lineRevenue = transactionType==="sale"?(listTotal > 0 ? received * listValue / listTotal : received * quantity / totalQuantity):0; return { productId: product.id, productName: product.name, portfolioKey: product.portfolioKey ?? null, quantity, unitCostSnapshot: unitCost,laborCostSnapshot:unitLabor, unitPriceSnapshot: lineRevenue / quantity }; }); const first = items[0];
  return { id:id("sale"),productId:first.productId,productName:items.length===1?first.productName:`${items.length} produtos`,portfolioKey:items.length===1?first.portfolioKey??null:null,customerId:args.customerId??null,transactionType,saleChannel:transactionType==="sale"?(args.saleChannel??"other"):"other",deliveryCostSnapshot:deliveryCost,discountReason,belowCostOverride:transactionType==="sale"?Boolean(args.belowCostOverride):false,quantity:totalQuantity,totalReceived:received,paymentMethod:args.paymentMethod,soldAt:args.soldAt,unitCostSnapshot:totalQuantity>0?totalCost/totalQuantity:0,variableFeeSnapshot,contributionSnapshot,items,status:"completed",cancelledAt:null,cancelReason:null };
}
export function buildSale(args: { product: Product; supplies: Supply[]; paymentFeePercent: number; quantity: number; totalReceived: number; paymentMethod: PaymentMethod; soldAt: string }): Sale { return buildSaleOrder({ items:[{ product:args.product,quantity:args.quantity }], supplies:args.supplies, paymentFeePercent:args.paymentFeePercent, totalReceived:args.totalReceived, paymentMethod:args.paymentMethod, soldAt:args.soldAt }); }

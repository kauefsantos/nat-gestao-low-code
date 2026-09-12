import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/lovable-cloud/database";
import type { NatState } from "@/domain/nat";
import type { FundingSource } from "@/domain/funding";

export type NatVersions={settings:string|null;supplies:Record<string,string>;products:Record<string,string>;sales:Record<string,string>;expenses:Record<string,string>};
export const emptyNatVersions=():NatVersions=>({settings:null,supplies:{},products:{},sales:{},expenses:{}});
export type PersistContext={fundingSource?:FundingSource;fixedCostFundingSource?:FundingSource};
export type TransitionResult={versions:Partial<NatVersions>;inventoryChanged:boolean;fundingChanged:boolean};
type Operation={type:string;expectedUpdatedAt:string|null;payload:Record<string,unknown>};
type TransitionPayload={settings?:string|null;supplies?:Record<string,string|null>;products?:Record<string,string|null>;sales?:Record<string,string|null>;expenses?:Record<string,string|null>;inventoryChanged?:boolean};
function failure(context:string,error:{message:string}|null){if(error)throw new Error(`${context}: ${error.message}`);}
const same=(left:unknown,right:unknown)=>JSON.stringify(left)===JSON.stringify(right);
function cleanVersionMap(value:Record<string,string|null>|undefined){return Object.fromEntries(Object.entries(value??{}).filter((entry):entry is [string,string]=>typeof entry[1]==="string"&&entry[1].length>0));}

export async function setProductAvailabilityCloud(businessId:string,productId:string,expectedUpdatedAt:string|null,available:boolean):Promise<string|null>{
  const result=await supabase.rpc("set_product_availability",{p_business_id:businessId,p_id:productId,p_expected_updated_at:expectedUpdatedAt,p_available:available});failure("Não foi possível alterar a disponibilidade do produto",result.error);
  const version=await supabase.from("products").select("updated_at").eq("business_id",businessId).eq("id",productId).maybeSingle();failure("Não foi possível confirmar a versão do produto",version.error);return version.data?.updated_at??null;
}

export async function persistNatTransition(businessId:string,previous:NatState,next:NatState,versions:NatVersions,context:PersistContext={}):Promise<TransitionResult>{
  const operations:Operation[]=[];
  const previousSales=new Map(previous.sales.map((item)=>[item.id,item]));const nextSales=new Map(next.sales.map((item)=>[item.id,item]));
  for(const sale of previous.sales)if(!nextSales.has(sale.id)&&sale.status!=="cancelled")operations.push({type:"cancel_sale",expectedUpdatedAt:versions.sales[sale.id]??null,payload:{id:sale.id,reason:"Cancelada pelo usuário"}});
  for(const sale of next.sales){const old=previousSales.get(sale.id);if(old&&old.status!=="cancelled"&&sale.status==="cancelled")operations.push({type:"cancel_sale",expectedUpdatedAt:versions.sales[sale.id]??null,payload:{id:sale.id,reason:sale.cancelReason??"Cancelada pelo usuário"}});}
  for(const sale of next.sales)if(!previousSales.has(sale.id)){
    const economicValue=sale.saleValueSnapshot??sale.totalReceived;
    operations.push({type:"create_sale",expectedUpdatedAt:null,payload:{id:sale.id,items:sale.items.map((item)=>({productId:item.productId,quantity:item.quantity})),totalReceived:economicValue,saleValue:economicValue,paymentStatus:sale.paymentStatus??"paid",paymentPromisedDate:sale.paymentPromisedDate??null,paymentPromisedTime:sale.paymentPromisedTime??null,paymentMethod:sale.paymentMethod,soldAt:sale.soldAt,customerId:sale.customerId??null,transactionType:sale.transactionType??"sale",saleChannel:sale.saleChannel??"other",deliveryCost:sale.deliveryCostSnapshot??0,discountReason:sale.discountReason??null,belowCostOverride:Boolean(sale.belowCostOverride),marginOverride:Boolean(sale.marginOverride)}});
  }

  const previousProducts=new Map(previous.products.map((item)=>[item.id,item]));const nextProducts=new Map(next.products.map((item)=>[item.id,item]));
  for(const product of previous.products)if(!nextProducts.has(product.id))operations.push({type:"archive_product",expectedUpdatedAt:versions.products[product.id]??null,payload:{id:product.id}});
  const previousSupplies=new Map(previous.supplies.map((item)=>[item.id,item]));const nextSupplies=new Map(next.supplies.map((item)=>[item.id,item]));
  for(const supply of previous.supplies)if(!nextSupplies.has(supply.id))operations.push({type:"delete_supply",expectedUpdatedAt:versions.supplies[supply.id]??null,payload:{id:supply.id}});
  const previousExpenses=new Map(previous.expenses.map((item)=>[item.id,item]));const nextExpenses=new Map(next.expenses.map((item)=>[item.id,item]));
  for(const expense of previous.expenses)if(!nextExpenses.has(expense.id))operations.push({type:"delete_sporadic_expense",expectedUpdatedAt:versions.expenses[expense.id]??null,payload:{id:expense.id}});
  const previousCustomers=new Map((previous.customers??[]).map((item)=>[item.id,item]));
  const previousOwnerCash=new Map((previous.ownerCashMovements??[]).map((item)=>[item.id,item]));const nextOwnerCash=new Map((next.ownerCashMovements??[]).map((item)=>[item.id,item]));
  for(const movement of previous.ownerCashMovements??[])if(!nextOwnerCash.has(movement.id))operations.push({type:"delete_owner_cash_movement",expectedUpdatedAt:null,payload:{id:movement.id}});
  for(const customer of next.customers??[]){const old=previousCustomers.get(customer.id);if(!old||!same(old,customer))operations.push({type:"save_customer",expectedUpdatedAt:null,payload:{id:customer.id,name:customer.name,phone:customer.phone??null,instagram:customer.instagram??null,source:customer.source??null,marketingConsent:customer.marketingConsent,notes:customer.notes??null,active:customer.active}});}
  for(const movement of next.ownerCashMovements??[]){const old=previousOwnerCash.get(movement.id);if(!old||!same(old,movement))operations.push({type:"save_owner_cash_movement",expectedUpdatedAt:null,payload:{id:movement.id,movementType:movement.movementType,amount:movement.amount,occurredAt:movement.occurredAt.slice(0,10),note:movement.note??null}});}
  for(const supply of next.supplies){const old=previousSupplies.get(supply.id);if(!old||!same(old,supply))operations.push({type:"save_supply",expectedUpdatedAt:old?versions.supplies[supply.id]??null:null,payload:{id:supply.id,name:supply.name,category:supply.category,packageQuantity:supply.packageQuantity,packageUnit:supply.packageUnit,packagePrice:supply.packagePrice,purchasedAt:supply.purchasedAt.slice(0,10),fundingSource:context.fundingSource??supply.fundingSource??"business"}});}
  for(const product of next.products){const old=previousProducts.get(product.id);if(!old||!same(old,product))operations.push({type:"save_product",expectedUpdatedAt:old?versions.products[product.id]??null:null,payload:{id:product.id,name:product.name,batchYield:product.batchYield,sellingPrice:product.sellingPrice,lossPercent:product.lossPercent,laborCostPerBatch:product.laborCostPerBatch,productionCostPerBatch:product.productionCostPerBatch,minimumMarginPercent:product.minimumMarginPercent,targetMarginPercent:product.targetMarginPercent,recipe:product.recipe,portfolioKey:product.portfolioKey??null}});}
  for(const expense of next.expenses){const old=previousExpenses.get(expense.id);if(!old||!same(old,expense))operations.push({type:"save_sporadic_expense",expectedUpdatedAt:old?versions.expenses[expense.id]??null:null,payload:{id:expense.id,name:expense.name,amount:expense.amount,spentAt:expense.spentAt.slice(0,10),fundingSource:context.fundingSource??expense.fundingSource??"business"}});}
  if(!same(previous.settings,next.settings))operations.push({type:"save_business_settings",expectedUpdatedAt:versions.settings,payload:{ownerName:next.settings.ownerName,monthlyFixedCosts:next.settings.monthlyFixedCosts,paymentFeePercent:next.settings.paymentFeePercent,pixFeePercent:next.settings.pixFeePercent??0,cashFeePercent:next.settings.cashFeePercent??0,cardFeePercent:next.settings.cardFeePercent??0,defaultMinimumMarginPercent:next.settings.defaultMinimumMarginPercent,defaultTargetMarginPercent:next.settings.defaultTargetMarginPercent,ownerHourlyRate:next.settings.ownerHourlyRate,ownerDailyHours:next.settings.ownerDailyHours,fixedCostFundingSource:context.fixedCostFundingSource??next.settings.fixedCostFundingSource??"owner"}});
  if(!operations.length)return{versions:{},inventoryChanged:false,fundingChanged:false};
  const requestId=crypto.randomUUID();const payload={p_business_id:businessId,p_request_id:requestId,p_operations:operations as unknown as Json};let lastError:{message:string}|null=null;let data:unknown=null;
  for(let attempt=0;attempt<2;attempt+=1){const result=await supabase.rpc("apply_nat_transition_v4",payload);if(!result.error){data=result.data;lastError=null;break;}lastError=result.error;const message=result.error.message??"";if(!/fetch|network|timeout|Failed to fetch/i.test(message))break;}
  failure("Falha ao salvar alteração",lastError);
  const response=(data&&typeof data==="object"&&!Array.isArray(data)?data:{}) as TransitionPayload;
  const fundingChanged=operations.some((op)=>["save_supply","delete_supply","save_sporadic_expense","delete_sporadic_expense","save_owner_cash_movement","delete_owner_cash_movement","save_business_settings"].includes(op.type));
  return{versions:{settings:response.settings??undefined,supplies:cleanVersionMap(response.supplies),products:cleanVersionMap(response.products),sales:cleanVersionMap(response.sales),expenses:cleanVersionMap(response.expenses)},inventoryChanged:Boolean(response.inventoryChanged),fundingChanged};
}

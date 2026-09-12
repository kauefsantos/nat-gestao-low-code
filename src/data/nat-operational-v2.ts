import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/lovable-cloud/database";
import { initialState, type Customer, type NatState, type OwnerCashMovement, type PaymentMethod, type Product, type RecipeItem, type Sale, type SaleChannel, type SaleLine, type SaleStatus, type Settings, type SporadicExpense, type Supply, type SupplyCategory, type TransactionType, type Unit } from "@/domain/nat";
import { addCalendarDays, businessDate, businessDayStartInstant } from "@/lib/business-time";
import { emptyNatVersions, type NatVersions } from "@/data/nat-repository";

type MembershipRow=Database["public"]["Tables"]["business_members"]["Row"];
type SettingsRow=Database["public"]["Tables"]["business_settings"]["Row"];
type SupplyRow=Database["public"]["Tables"]["supplies"]["Row"];
type ProductRow=Database["public"]["Tables"]["products"]["Row"];
type RecipeRow=Database["public"]["Tables"]["recipe_items"]["Row"];
type SaleRow=Database["public"]["Tables"]["sales"]["Row"];
type SaleItemRow=Database["public"]["Tables"]["sale_items"]["Row"];
type ExpenseRow=Database["public"]["Tables"]["sporadic_expenses"]["Row"];
type PurchaseSnapshot={supplyId:string;packageQuantity:number|string;packageUnit:Unit;packagePrice:number|string;purchasedAt:string;fundingSource?:string};
export type PageCursor={soldAt?:string;spentAt?:string;id:string};
export type HistoryCursor={sale:PageCursor|null;expense:PageCursor|null;salesDone:boolean;expensesDone:boolean};
export type HistoryPage={sales:Sale[];expenses:SporadicExpense[];saleVersions:Record<string,string>;expenseVersions:Record<string,string>;cursor:HistoryCursor};

const numberValue=(value:number|string|null|undefined)=>Number.isFinite(Number(value))?Number(value):0;
const rows=<T>(value:unknown):T[]=>Array.isArray(value)?value as T[]:[];
function failure(context:string,error:{message:string}|null){if(error)throw new Error(`${context}: ${error.message}`);}

async function ensureBusiness():Promise<string>{
  const membership=await supabase.from("business_members").select("business_id").order("created_at",{ascending:true}).limit(1).maybeSingle();
  failure("Não foi possível localizar a empresa",membership.error);
  const existing=(membership.data as Pick<MembershipRow,"business_id">|null)?.business_id;
  if(existing)return existing;
  const created=await supabase.rpc("bootstrap_nat_business",{p_name:"NAT",p_owner_name:"NAT"});
  failure("Não foi possível preparar a NAT",created.error);if(!created.data)throw new Error("A empresa não foi criada.");return String(created.data);
}

function customerFrom(value:unknown):Customer{const row=(value&&typeof value==="object"?value:{}) as Record<string,unknown>;return{id:String(row.id??""),name:String(row.name??"Cliente"),phone:row.phone==null?null:String(row.phone),instagram:row.instagram==null?null:String(row.instagram),source:row.source==null?null:String(row.source),marketingConsent:row.marketingConsent===true,notes:row.notes==null?null:String(row.notes),active:row.active!==false,createdAt:String(row.createdAt??new Date().toISOString()),updatedAt:String(row.updatedAt??new Date().toISOString())};}
function ownerCashMovementFrom(value:unknown):OwnerCashMovement{const row=(value&&typeof value==="object"?value:{}) as Record<string,unknown>;return{id:String(row.id??""),movementType:row.movementType==="withdrawal"?"withdrawal":"contribution",amount:numberValue(row.amount as number|string|null|undefined),occurredAt:String(row.occurredAt??businessDate()),note:row.note==null?null:String(row.note),createdAt:row.createdAt==null?undefined:String(row.createdAt),updatedAt:row.updatedAt==null?undefined:String(row.updatedAt)};}

function saleFromRows(row:SaleRow,items:SaleItemRow[]):Sale|null{
  if(!items.length)return null;
  const lines:SaleLine[]=items.map((item)=>({id:item.id,productId:item.product_id,productName:item.product_name_snapshot,portfolioKey:item.portfolio_key_snapshot??null,quantity:numberValue(item.quantity),unitCostSnapshot:numberValue(item.unit_cost_snapshot),laborCostSnapshot:numberValue(item.labor_cost_snapshot),unitPriceSnapshot:numberValue(item.unit_price_snapshot)}));
  const quantity=lines.reduce((sum,item)=>sum+item.quantity,0);const totalCost=lines.reduce((sum,item)=>sum+item.unitCostSnapshot*item.quantity,0);const first=lines[0];
  return{id:row.id,productId:first.productId,productName:lines.length===1?first.productName:`${lines.length} produtos`,portfolioKey:lines.length===1?first.portfolioKey??null:null,customerId:row.customer_id??null,transactionType:(row.transaction_type??"sale") as TransactionType,saleChannel:(row.sale_channel??"other") as SaleChannel,deliveryCostSnapshot:numberValue(row.delivery_cost_snapshot),discountReason:row.discount_reason??null,belowCostOverride:Boolean(row.below_cost_override),quantity,totalReceived:numberValue(row.total_received),paymentMethod:row.payment_method as PaymentMethod,soldAt:row.sold_at,unitCostSnapshot:quantity>0?totalCost/quantity:0,variableFeeSnapshot:numberValue(row.variable_fee_snapshot),contributionSnapshot:numberValue(row.contribution_snapshot),items:lines,status:row.status as SaleStatus,cancelledAt:row.cancelled_at,cancelReason:row.cancel_reason};
}

function saleFromPage(value:unknown):{sale:Sale;updatedAt:string|null}|null{
  const row=(value&&typeof value==="object"?value:{}) as Record<string,unknown>;const rawItems=rows<Record<string,unknown>>(row.items);if(!rawItems.length)return null;
  const items:SaleLine[]=rawItems.map((item)=>({id:String(item.id??""),productId:String(item.productId??""),productName:String(item.productName??"Produto"),portfolioKey:item.portfolioKey==null?null:String(item.portfolioKey),quantity:numberValue(item.quantity as number|string|null|undefined),unitCostSnapshot:numberValue(item.unitCostSnapshot as number|string|null|undefined),laborCostSnapshot:numberValue(item.laborCostSnapshot as number|string|null|undefined),unitPriceSnapshot:numberValue(item.unitPriceSnapshot as number|string|null|undefined)}));
  const quantity=items.reduce((sum,item)=>sum+item.quantity,0);const totalCost=items.reduce((sum,item)=>sum+item.unitCostSnapshot*item.quantity,0);const first=items[0];
  return{updatedAt:row.updatedAt==null?null:String(row.updatedAt),sale:{id:String(row.id??""),productId:first.productId,productName:items.length===1?first.productName:`${items.length} produtos`,portfolioKey:items.length===1?first.portfolioKey??null:null,customerId:row.customerId==null?null:String(row.customerId),transactionType:(row.transactionType??"sale") as TransactionType,saleChannel:(row.saleChannel??"other") as SaleChannel,deliveryCostSnapshot:numberValue(row.deliveryCostSnapshot as number|string|null|undefined),discountReason:row.discountReason==null?null:String(row.discountReason),belowCostOverride:Boolean(row.belowCostOverride),quantity,totalReceived:numberValue(row.totalReceived as number|string|null|undefined),paymentMethod:(row.paymentMethod??"other") as PaymentMethod,soldAt:String(row.soldAt??new Date().toISOString()),unitCostSnapshot:quantity>0?totalCost/quantity:0,variableFeeSnapshot:numberValue(row.variableFeeSnapshot as number|string|null|undefined),contributionSnapshot:numberValue(row.contributionSnapshot as number|string|null|undefined),items,status:(row.status??"completed") as SaleStatus,cancelledAt:row.cancelledAt==null?null:String(row.cancelledAt),cancelReason:row.cancelReason==null?null:String(row.cancelReason)}};
}

export function initialHistoryCursor(state:NatState):HistoryCursor{
  const oldestSale=[...state.sales].sort((a,b)=>+new Date(a.soldAt)-+new Date(b.soldAt)||a.id.localeCompare(b.id))[0];
  const oldestExpense=[...state.expenses].sort((a,b)=>a.spentAt.localeCompare(b.spentAt)||a.id.localeCompare(b.id))[0];
  return{sale:oldestSale?{soldAt:oldestSale.soldAt,id:oldestSale.id}:null,expense:oldestExpense?{spentAt:oldestExpense.spentAt.slice(0,10),id:oldestExpense.id}:null,salesDone:false,expensesDone:false};
}

export async function loadNatOperationalStateV2():Promise<{businessId:string;state:NatState;versions:NatVersions}>{
  const businessId=await ensureBusiness();const today=businessDate();const monthStart=`${today.slice(0,7)}-01`;const recentSalesStart=businessDayStartInstant(addCalendarDays(today,-45));
  const [settingsResult,suppliesResult,purchaseSnapshotResult,productsResult,recipeResult,salesResult,expensesResult,customersResult,ownerCashResult]=await Promise.all([
    supabase.from("business_settings").select("business_id,owner_name,monthly_fixed_costs,payment_fee_percent,default_minimum_margin_percent,default_target_margin_percent,updated_at,owner_hourly_rate,owner_daily_hours,pix_fee_percent,cash_fee_percent,card_fee_percent,timezone,fixed_cost_funding_source").eq("business_id",businessId).maybeSingle(),
    supabase.from("supplies").select("id,business_id,name,category,active,created_at,updated_at").eq("business_id",businessId).order("name",{ascending:true}),
    supabase.rpc("get_supply_purchase_snapshot",{p_business_id:businessId,p_month_start:monthStart}),
    supabase.from("products").select("id,business_id,name,portfolio_key,batch_yield,selling_price,loss_percent,labor_cost_per_batch,production_cost_per_batch,minimum_margin_percent,target_margin_percent,available,active,created_at,updated_at").eq("business_id",businessId).order("name",{ascending:true}),
    supabase.from("recipe_items").select("id,business_id,product_id,supply_id,quantity,unit,created_at").eq("business_id",businessId),
    supabase.from("sales").select("id,business_id,customer_id,transaction_type,sale_channel,total_received,payment_method,sold_at,variable_fee_snapshot,contribution_snapshot,delivery_cost_snapshot,discount_reason,below_cost_override,status,cancelled_at,cancel_reason,created_at,updated_at").eq("business_id",businessId).gte("sold_at",recentSalesStart).order("sold_at",{ascending:false}),
    supabase.from("sporadic_expenses").select("id,business_id,name,amount,spent_at,funding_source,created_at,updated_at").eq("business_id",businessId).gte("spent_at",monthStart).order("spent_at",{ascending:false}).order("created_at",{ascending:false}),
    supabase.rpc("get_customers_snapshot",{p_business_id:businessId}),
    supabase.rpc("get_owner_cash_movements_snapshot",{p_business_id:businessId}),
  ]);
  failure("Não foi possível carregar as configurações",settingsResult.error);failure("Não foi possível carregar os ingredientes",suppliesResult.error);failure("Não foi possível carregar o custo dos ingredientes",purchaseSnapshotResult.error);failure("Não foi possível carregar os produtos",productsResult.error);failure("Não foi possível carregar as receitas",recipeResult.error);failure("Não foi possível carregar as vendas recentes",salesResult.error);failure("Não foi possível carregar os gastos do mês",expensesResult.error);failure("Não foi possível carregar os clientes",customersResult.error);failure("Não foi possível carregar aportes e retiradas",ownerCashResult.error);

  const saleRows=rows<SaleRow>(salesResult.data);const saleIds=saleRows.map((row)=>row.id);let saleItemRows:SaleItemRow[]=[];
  if(saleIds.length){const saleItemsResult=await supabase.from("sale_items").select("id,business_id,sale_id,product_id,product_name_snapshot,portfolio_key_snapshot,quantity,unit_cost_snapshot,labor_cost_snapshot,unit_price_snapshot,created_at").eq("business_id",businessId).in("sale_id",saleIds);failure("Não foi possível carregar os itens das vendas recentes",saleItemsResult.error);saleItemRows=rows<SaleItemRow>(saleItemsResult.data);}
  const bySale=new Map<string,SaleItemRow[]>();for(const item of saleItemRows){const list=bySale.get(item.sale_id)??[];list.push(item);bySale.set(item.sale_id,list);}

  const snapshot=(purchaseSnapshotResult.data??{}) as unknown as{latest?:PurchaseSnapshot[];monthCashOut?:number|string};const latestPurchase=new Map((snapshot.latest??[]).map((purchase)=>[purchase.supplyId,purchase]));const purchaseCashOut=numberValue(snapshot.monthCashOut);
  const allSupplies=rows<SupplyRow>(suppliesResult.data);const recipeRows=rows<RecipeRow>(recipeResult.data);const allProductRows=rows<ProductRow>(productsResult.data);const activeProducts=allProductRows.filter((row)=>row.active);const activeIds=new Set(activeProducts.map((row)=>row.id));const referencedSupplyIds=new Set(recipeRows.filter((row)=>activeIds.has(row.product_id)).map((row)=>row.supply_id));
  const supplies:Supply[]=allSupplies.filter((row)=>row.active||referencedSupplyIds.has(row.id)).map((row)=>{const purchase=latestPurchase.get(row.id);return{id:row.id,name:row.name,category:row.category as SupplyCategory,packageQuantity:numberValue(purchase?.packageQuantity??1),packageUnit:(purchase?.packageUnit??"unit") as Unit,packagePrice:numberValue(purchase?.packagePrice),purchasedAt:purchase?.purchasedAt??today};});
  const recipesByProduct=new Map<string,RecipeItem[]>();for(const item of recipeRows){const list=recipesByProduct.get(item.product_id)??[];list.push({id:item.id,supplyId:item.supply_id,quantity:numberValue(item.quantity),unit:item.unit as Unit});recipesByProduct.set(item.product_id,list);}
  const products:Product[]=activeProducts.map((row)=>({id:row.id,name:row.name,portfolioKey:row.portfolio_key??null,available:row.available??true,batchYield:numberValue(row.batch_yield),sellingPrice:numberValue(row.selling_price),lossPercent:numberValue(row.loss_percent),laborCostPerBatch:numberValue(row.labor_cost_per_batch),productionCostPerBatch:numberValue(row.production_cost_per_batch),minimumMarginPercent:numberValue(row.minimum_margin_percent),targetMarginPercent:numberValue(row.target_margin_percent),recipe:recipesByProduct.get(row.id)??[]}));
  const sales=saleRows.map((row)=>saleFromRows(row,bySale.get(row.id)??[])).filter((sale):sale is Sale=>sale!==null);
  const expenseRows=rows<ExpenseRow>(expensesResult.data);const expenses:SporadicExpense[]=expenseRows.map((row)=>({id:row.id,name:row.name,amount:numberValue(row.amount),spentAt:row.spent_at,fundingSource:row.funding_source==="business"?"business":"owner"}));
  const settingsRow=settingsResult.data as SettingsRow|null;const settings:Settings=settingsRow?{ownerName:settingsRow.owner_name,monthlyFixedCosts:numberValue(settingsRow.monthly_fixed_costs),paymentFeePercent:numberValue(settingsRow.payment_fee_percent),pixFeePercent:numberValue(settingsRow.pix_fee_percent),cashFeePercent:numberValue(settingsRow.cash_fee_percent),cardFeePercent:numberValue(settingsRow.card_fee_percent),defaultMinimumMarginPercent:numberValue(settingsRow.default_minimum_margin_percent),defaultTargetMarginPercent:numberValue(settingsRow.default_target_margin_percent),ownerHourlyRate:numberValue(settingsRow.owner_hourly_rate),ownerDailyHours:numberValue(settingsRow.owner_daily_hours),fixedCostFundingSource:settingsRow.fixed_cost_funding_source==="business"?"business":"owner",timezone:settingsRow.timezone||"America/Sao_Paulo"}:initialState.settings;
  const customers=rows<unknown>(customersResult.data).map(customerFrom);const ownerCashMovements=rows<unknown>(ownerCashResult.data).map(ownerCashMovementFrom);
  const versions:NatVersions={...emptyNatVersions(),settings:settingsRow?.updated_at??null,supplies:Object.fromEntries(allSupplies.map((row)=>[row.id,row.updated_at])),products:Object.fromEntries(allProductRows.map((row)=>[row.id,row.updated_at])),sales:Object.fromEntries(saleRows.map((row)=>[row.id,row.updated_at])),expenses:Object.fromEntries(expenseRows.map((row)=>[row.id,row.updated_at]))};
  return{businessId,state:{version:6,supplies,products,customers,sales,expenses,ownerCashMovements,settings,purchaseCashOut},versions};
}

export async function loadNatHistoryPage(businessId:string,cursor:HistoryCursor,limit=100):Promise<HistoryPage>{
  let next={...cursor};const sales:Sale[]=[];const expenses:SporadicExpense[]=[];const saleVersions:Record<string,string>={};const expenseVersions:Record<string,string>={};
  if(!cursor.salesDone){const result=await supabase.rpc("list_sales_page",{p_business_id:businessId,p_limit:Math.min(Math.max(limit,1),100),p_before_sold_at:cursor.sale?.soldAt??undefined,p_before_id:cursor.sale?.id??undefined});failure("Não foi possível carregar mais vendas",result.error);const payload=(result.data??{}) as unknown as{items?:unknown[];hasMore?:boolean;nextCursor?:PageCursor|null};for(const item of payload.items??[]){const parsed=saleFromPage(item);if(!parsed)continue;sales.push(parsed.sale);if(parsed.updatedAt)saleVersions[parsed.sale.id]=parsed.updatedAt;}next={...next,sale:payload.nextCursor??cursor.sale,salesDone:!payload.hasMore};}
  if(!cursor.expensesDone){const result=await supabase.rpc("list_expenses_page",{p_business_id:businessId,p_limit:Math.min(Math.max(limit,1),100),p_before_spent_at:cursor.expense?.spentAt??undefined,p_before_id:cursor.expense?.id??undefined});failure("Não foi possível carregar mais gastos",result.error);const payload=(result.data??{}) as unknown as{items?:Array<Record<string,unknown>>;hasMore?:boolean;nextCursor?:PageCursor|null};for(const row of payload.items??[]){const id=String(row.id??"");expenses.push({id,name:String(row.name??"Despesa"),amount:numberValue(row.amount as number|string|null|undefined),spentAt:String(row.spentAt??businessDate())});if(row.updatedAt!=null)expenseVersions[id]=String(row.updatedAt);}next={...next,expense:payload.nextCursor??cursor.expense,expensesDone:!payload.hasMore};}
  return{sales,expenses,saleVersions,expenseVersions,cursor:next};
}

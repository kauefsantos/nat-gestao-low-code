import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { initialState, type Customer, type NatState, type OwnerCashMovement, type PaymentMethod, type Product, type RecipeItem, type Sale, type SaleLine, type SaleStatus, type Settings, type SporadicExpense, type Supply, type SupplyCategory, type TransactionType, type Unit } from "@/domain/nat";

type MembershipRow = Database["public"]["Tables"]["business_members"]["Row"];
type SettingsRow = Database["public"]["Tables"]["business_settings"]["Row"] & { owner_hourly_rate?:number|string|null; owner_daily_hours?:number|string|null; pix_fee_percent?:number|string|null; cash_fee_percent?:number|string|null; card_fee_percent?:number|string|null };
type SupplyRow = Database["public"]["Tables"]["supplies"]["Row"];
type PurchaseRow = Database["public"]["Tables"]["supply_purchases"]["Row"];
type ProductRow = Database["public"]["Tables"]["products"]["Row"] & { available?:boolean; labor_cost_per_batch?:number|string|null };
type RecipeRow = Database["public"]["Tables"]["recipe_items"]["Row"];
type SaleRow = Database["public"]["Tables"]["sales"]["Row"] & { customer_id?:string|null; transaction_type?:TransactionType|null };
type SaleItemRow = Database["public"]["Tables"]["sale_items"]["Row"] & { labor_cost_snapshot?:number|string|null };
type ExpenseRow = Database["public"]["Tables"]["sporadic_expenses"]["Row"];

export type NatVersions = {
  settings: string | null;
  supplies: Record<string,string>;
  products: Record<string,string>;
  sales: Record<string,string>;
  expenses: Record<string,string>;
};
export const emptyNatVersions = (): NatVersions => ({ settings:null,supplies:{},products:{},sales:{},expenses:{} });

const numberValue = (value: number | string | null | undefined) => Number.isFinite(Number(value)) ? Number(value) : 0;
const rows = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];
function failure(context: string, error: { message: string } | null) { if (error) throw new Error(`${context}: ${error.message}`); }

async function ensureBusiness(): Promise<string> {
  const membership = await supabase.from("business_members").select("business_id").order("created_at",{ ascending: true }).limit(1).maybeSingle();
  failure("Não foi possível localizar a empresa",membership.error);
  const existing = (membership.data as Pick<MembershipRow,"business_id"> | null)?.business_id;
  if (existing) return existing;
  const created = await supabase.rpc("bootstrap_nat_business",{ p_name: "NAT", p_owner_name: "NAT" });
  failure("Não foi possível preparar a NAT",created.error);
  if (!created.data) throw new Error("A empresa não foi criada.");
  return String(created.data);
}

function customerFrom(value:unknown):Customer {
  const row=(value&&typeof value==="object"?value:{}) as Record<string,unknown>;
  return { id:String(row.id??""),name:String(row.name??"Cliente"),phone:row.phone==null?null:String(row.phone),instagram:row.instagram==null?null:String(row.instagram),source:row.source==null?null:String(row.source),marketingConsent:row.marketingConsent===true,notes:row.notes==null?null:String(row.notes),active:row.active!==false,createdAt:String(row.createdAt??new Date().toISOString()),updatedAt:String(row.updatedAt??new Date().toISOString()) };
}
function ownerCashMovementFrom(value:unknown):OwnerCashMovement {
  const row=(value&&typeof value==="object"?value:{}) as Record<string,unknown>;
  return { id:String(row.id??""),movementType:row.movementType==="withdrawal"?"withdrawal":"contribution",amount:numberValue(row.amount as number|string|null|undefined),occurredAt:String(row.occurredAt??new Date().toISOString().slice(0,10)),note:row.note==null?null:String(row.note),createdAt:row.createdAt==null?undefined:String(row.createdAt),updatedAt:row.updatedAt==null?undefined:String(row.updatedAt) };
}

export async function loadNatCloudState(): Promise<{ businessId: string; state: NatState; versions: NatVersions }> {
  const businessId = await ensureBusiness();
  const [settingsResult,suppliesResult,purchasesResult,productsResult,recipeResult,salesResult,saleItemsResult,expensesResult,customersResult,ownerCashResult] = await Promise.all([
    supabase.from("business_settings").select("*").eq("business_id",businessId).maybeSingle(),
    supabase.from("supplies").select("*").eq("business_id",businessId).order("name",{ ascending: true }),
    supabase.from("supply_purchases").select("*").eq("business_id",businessId).order("purchased_at",{ ascending: false }).order("created_at",{ ascending: false }),
    supabase.from("products").select("*").eq("business_id",businessId).order("name",{ ascending: true }),
    supabase.from("recipe_items").select("*").eq("business_id",businessId),
    supabase.from("sales").select("*").eq("business_id",businessId).order("sold_at",{ ascending: false }),
    supabase.from("sale_items").select("*").eq("business_id",businessId),
    supabase.from("sporadic_expenses").select("*").eq("business_id",businessId).order("spent_at",{ ascending: false }).order("created_at",{ ascending: false }),
    supabase.rpc("get_customers_snapshot" as never,{p_business_id:businessId} as never),
    supabase.rpc("get_owner_cash_movements_snapshot" as never,{p_business_id:businessId} as never),
  ]);
  failure("Não foi possível carregar as configurações",settingsResult.error); failure("Não foi possível carregar os ingredientes",suppliesResult.error); failure("Não foi possível carregar as compras",purchasesResult.error); failure("Não foi possível carregar os produtos",productsResult.error); failure("Não foi possível carregar as receitas",recipeResult.error); failure("Não foi possível carregar as vendas",salesResult.error); failure("Não foi possível carregar os itens das vendas",saleItemsResult.error); failure("Não foi possível carregar os gastos esporádicos",expensesResult.error); failure("Não foi possível carregar os clientes",customersResult.error); failure("Não foi possível carregar aportes e retiradas",ownerCashResult.error);

  const purchaseRows = rows<PurchaseRow>(purchasesResult.data);
  const latestPurchase = new Map<string,PurchaseRow>(); for (const purchase of purchaseRows) if (!latestPurchase.has(purchase.supply_id)) latestPurchase.set(purchase.supply_id,purchase);
  const now=new Date();
  const purchaseCashOut=purchaseRows.filter((p)=>{const d=new Date(`${p.purchased_at}T12:00:00`);return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth();}).reduce((sum,p)=>sum+numberValue(p.package_price),0);
  const allSupplies = rows<SupplyRow>(suppliesResult.data);
  const recipeRows = rows<RecipeRow>(recipeResult.data);
  const allProductRows = rows<ProductRow>(productsResult.data);
  const activeProductRows = allProductRows.filter((row) => row.active);
  const referencedSupplyIds = new Set(recipeRows.filter((row) => activeProductRows.some((product) => product.id === row.product_id)).map((row) => row.supply_id));
  const supplies: Supply[] = allSupplies.filter((row) => row.active || referencedSupplyIds.has(row.id)).map((row) => {
    const purchase = latestPurchase.get(row.id);
    return { id: row.id, name: row.name, category: row.category as SupplyCategory, packageQuantity: numberValue(purchase?.package_quantity ?? 1), packageUnit: (purchase?.package_unit ?? "unit") as Unit, packagePrice: numberValue(purchase?.package_price), purchasedAt: purchase?.purchased_at ?? new Date().toISOString().slice(0,10) };
  });
  const products: Product[] = activeProductRows.map((row) => ({ id: row.id, name: row.name, portfolioKey: row.portfolio_key ?? null, available: row.available ?? true, batchYield: numberValue(row.batch_yield), sellingPrice: numberValue(row.selling_price), lossPercent: numberValue(row.loss_percent), laborCostPerBatch:numberValue(row.labor_cost_per_batch), productionCostPerBatch: numberValue(row.production_cost_per_batch), minimumMarginPercent: numberValue(row.minimum_margin_percent), targetMarginPercent: numberValue(row.target_margin_percent), recipe: recipeRows.filter((item) => item.product_id === row.id).map((item): RecipeItem => ({ id: item.id, supplyId: item.supply_id, quantity: numberValue(item.quantity), unit: item.unit as Unit })) }));

  const saleRows = rows<SaleRow>(salesResult.data);
  const saleItemsBySale = new Map<string,SaleItemRow[]>();
  for (const item of rows<SaleItemRow>(saleItemsResult.data)) { const list = saleItemsBySale.get(item.sale_id) ?? []; list.push(item); saleItemsBySale.set(item.sale_id,list); }
  const sales = saleRows.map((row): Sale | null => {
    const rawItems = saleItemsBySale.get(row.id) ?? []; if (!rawItems.length) return null;
    const items: SaleLine[] = rawItems.map((item) => ({ id:item.id,productId:item.product_id,productName:item.product_name_snapshot,portfolioKey:item.portfolio_key_snapshot ?? null,quantity:numberValue(item.quantity),unitCostSnapshot:numberValue(item.unit_cost_snapshot),laborCostSnapshot:numberValue(item.labor_cost_snapshot),unitPriceSnapshot:numberValue(item.unit_price_snapshot) }));
    const quantity = items.reduce((sum,item)=>sum+item.quantity,0); const totalCost = items.reduce((sum,item)=>sum+item.unitCostSnapshot*item.quantity,0); const first = items[0];
    return { id:row.id,productId:first.productId,productName:items.length===1?first.productName:`${items.length} produtos`,portfolioKey:items.length===1?first.portfolioKey ?? null:null,customerId:row.customer_id??null,transactionType:row.transaction_type??"sale",quantity,totalReceived:numberValue(row.total_received),paymentMethod:row.payment_method as PaymentMethod,soldAt:row.sold_at,unitCostSnapshot:quantity>0?totalCost/quantity:0,variableFeeSnapshot:numberValue(row.variable_fee_snapshot),contributionSnapshot:numberValue(row.contribution_snapshot),items,status:row.status as SaleStatus,cancelledAt:row.cancelled_at,cancelReason:row.cancel_reason };
  }).filter((sale): sale is Sale => sale !== null);

  const expenseRows = rows<ExpenseRow>(expensesResult.data);
  const expenses: SporadicExpense[] = expenseRows.map((row) => ({ id: row.id, name: row.name, amount: numberValue(row.amount), spentAt: row.spent_at }));
  const settingsRow = settingsResult.data as SettingsRow | null;
  const settings: Settings = settingsRow ? {
    ownerName: settingsRow.owner_name,
    monthlyFixedCosts: numberValue(settingsRow.monthly_fixed_costs),
    paymentFeePercent: numberValue(settingsRow.payment_fee_percent),
    pixFeePercent:numberValue(settingsRow.pix_fee_percent??0),cashFeePercent:numberValue(settingsRow.cash_fee_percent??0),cardFeePercent:numberValue(settingsRow.card_fee_percent??0),
    defaultMinimumMarginPercent: numberValue(settingsRow.default_minimum_margin_percent), defaultTargetMarginPercent: numberValue(settingsRow.default_target_margin_percent),ownerHourlyRate:numberValue(settingsRow.owner_hourly_rate??20),ownerDailyHours:numberValue(settingsRow.owner_daily_hours??3)
  } : initialState.settings;
  const customers=rows<unknown>(customersResult.data).map(customerFrom);
  const ownerCashMovements=rows<unknown>(ownerCashResult.data).map(ownerCashMovementFrom);
  const versions: NatVersions = {
    settings: settingsRow?.updated_at ?? null,
    supplies: Object.fromEntries(allSupplies.map((row)=>[row.id,row.updated_at])),
    products: Object.fromEntries(allProductRows.map((row)=>[row.id,row.updated_at])),
    sales: Object.fromEntries(saleRows.map((row)=>[row.id,row.updated_at])),
    expenses: Object.fromEntries(expenseRows.map((row)=>[row.id,row.updated_at])),
  };
  return { businessId, state: { version: 5, supplies, products, customers, sales, expenses, ownerCashMovements, settings,purchaseCashOut }, versions };
}

export async function setProductAvailabilityCloud(businessId:string,productId:string,expectedUpdatedAt:string|null,available:boolean) {
  const result = await supabase.rpc("set_product_availability" as never,{ p_business_id:businessId,p_id:productId,p_expected_updated_at:expectedUpdatedAt,p_available:available } as never);
  failure("Não foi possível alterar a disponibilidade do produto",result.error);
}

const same = (left: unknown,right: unknown) => JSON.stringify(left) === JSON.stringify(right);
type Operation = { type:string; expectedUpdatedAt:string|null; payload:Record<string,unknown> };
export async function persistNatTransition(businessId: string, previous: NatState, next: NatState, versions: NatVersions) {
  const operations: Operation[] = [];
  const previousSales = new Map(previous.sales.map((item)=>[item.id,item])); const nextSales = new Map(next.sales.map((item)=>[item.id,item]));
  for (const sale of previous.sales) if (!nextSales.has(sale.id) && sale.status!=="cancelled") operations.push({type:"cancel_sale",expectedUpdatedAt:versions.sales[sale.id] ?? null,payload:{id:sale.id,reason:"Cancelada pelo usuário"}});
  for (const sale of next.sales) { const old=previousSales.get(sale.id); if (old && old.status!=="cancelled" && sale.status==="cancelled") operations.push({type:"cancel_sale",expectedUpdatedAt:versions.sales[sale.id] ?? null,payload:{id:sale.id,reason:sale.cancelReason ?? "Cancelada pelo usuário"}}); }

  const previousProducts=new Map(previous.products.map((item)=>[item.id,item])); const nextProducts=new Map(next.products.map((item)=>[item.id,item]));
  for (const product of previous.products) if (!nextProducts.has(product.id)) operations.push({type:"archive_product",expectedUpdatedAt:versions.products[product.id] ?? null,payload:{id:product.id}});
  const previousSupplies=new Map(previous.supplies.map((item)=>[item.id,item])); const nextSupplies=new Map(next.supplies.map((item)=>[item.id,item]));
  for (const supply of previous.supplies) if (!nextSupplies.has(supply.id)) operations.push({type:"delete_supply",expectedUpdatedAt:versions.supplies[supply.id] ?? null,payload:{id:supply.id}});
  const previousExpenses=new Map(previous.expenses.map((item)=>[item.id,item])); const nextExpenses=new Map(next.expenses.map((item)=>[item.id,item]));
  for (const expense of previous.expenses) if (!nextExpenses.has(expense.id)) operations.push({type:"delete_sporadic_expense",expectedUpdatedAt:versions.expenses[expense.id] ?? null,payload:{id:expense.id}});
  const previousCustomers=new Map((previous.customers??[]).map((item)=>[item.id,item]));
  const previousOwnerCash=new Map((previous.ownerCashMovements??[]).map((item)=>[item.id,item]));
  const nextOwnerCash=new Map((next.ownerCashMovements??[]).map((item)=>[item.id,item]));
  for(const movement of previous.ownerCashMovements??[]) if(!nextOwnerCash.has(movement.id)) operations.push({type:"delete_owner_cash_movement",expectedUpdatedAt:null,payload:{id:movement.id}});

  for (const customer of next.customers??[]) { const old=previousCustomers.get(customer.id); if(!old||!same(old,customer)) operations.push({type:"save_customer",expectedUpdatedAt:null,payload:{id:customer.id,name:customer.name,phone:customer.phone??null,instagram:customer.instagram??null,source:customer.source??null,marketingConsent:customer.marketingConsent,notes:customer.notes??null,active:customer.active}}); }
  for(const movement of next.ownerCashMovements??[]){const old=previousOwnerCash.get(movement.id);if(!old||!same(old,movement))operations.push({type:"save_owner_cash_movement",expectedUpdatedAt:null,payload:{id:movement.id,movementType:movement.movementType,amount:movement.amount,occurredAt:movement.occurredAt.slice(0,10),note:movement.note??null}});}
  for (const supply of next.supplies) { const old=previousSupplies.get(supply.id); if (!old || !same(old,supply)) operations.push({type:"save_supply",expectedUpdatedAt:old ? versions.supplies[supply.id] ?? null : null,payload:{id:supply.id,name:supply.name,category:supply.category,packageQuantity:supply.packageQuantity,packageUnit:supply.packageUnit,packagePrice:supply.packagePrice,purchasedAt:supply.purchasedAt.slice(0,10)}}); }
  for (const product of next.products) { const old=previousProducts.get(product.id); if (!old || !same(old,product)) operations.push({type:"save_product",expectedUpdatedAt:old ? versions.products[product.id] ?? null : null,payload:{id:product.id,name:product.name,batchYield:product.batchYield,sellingPrice:product.sellingPrice,lossPercent:product.lossPercent,laborCostPerBatch:product.laborCostPerBatch,productionCostPerBatch:product.productionCostPerBatch,minimumMarginPercent:product.minimumMarginPercent,targetMarginPercent:product.targetMarginPercent,recipe:product.recipe,portfolioKey:product.portfolioKey ?? null}}); }
  for (const sale of next.sales) if (!previousSales.has(sale.id)) operations.push({type:"save_sale_items",expectedUpdatedAt:null,payload:{id:sale.id,items:sale.items.map((item)=>({productId:item.productId,quantity:item.quantity})),totalReceived:sale.totalReceived,paymentMethod:sale.paymentMethod,soldAt:sale.soldAt,customerId:sale.customerId??null,transactionType:sale.transactionType}});
  for (const expense of next.expenses) { const old=previousExpenses.get(expense.id); if (!old || !same(old,expense)) operations.push({type:"save_sporadic_expense",expectedUpdatedAt:old ? versions.expenses[expense.id] ?? null : null,payload:{id:expense.id,name:expense.name,amount:expense.amount,spentAt:expense.spentAt.slice(0,10)}}); }
  if (!same(previous.settings,next.settings)) operations.push({type:"save_business_settings",expectedUpdatedAt:versions.settings,payload:{ownerName:next.settings.ownerName,monthlyFixedCosts:next.settings.monthlyFixedCosts,paymentFeePercent:next.settings.paymentFeePercent,pixFeePercent:next.settings.pixFeePercent??0,cashFeePercent:next.settings.cashFeePercent??0,cardFeePercent:next.settings.cardFeePercent??0,defaultMinimumMarginPercent:next.settings.defaultMinimumMarginPercent,defaultTargetMarginPercent:next.settings.defaultTargetMarginPercent,ownerHourlyRate:next.settings.ownerHourlyRate,ownerDailyHours:next.settings.ownerDailyHours}});
  if (!operations.length) return;
  const requestId = crypto.randomUUID();
  const payload = { p_business_id:businessId,p_request_id:requestId,p_operations:operations as unknown as Json };
  let lastError: { message: string } | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await supabase.rpc("apply_nat_transition_v2",payload);
    if (!result.error) return;
    lastError = result.error;
    const message = result.error.message ?? "";
    const retryable = /fetch|network|timeout|Failed to fetch/i.test(message);
    if (!retryable) break;
  }
  failure("Falha ao salvar alteração",lastError);
}

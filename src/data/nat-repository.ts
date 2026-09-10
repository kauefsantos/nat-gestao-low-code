import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { initialState, type NatState, type PaymentMethod, type Product, type RecipeItem, type Settings, type SporadicExpense, type Supply, type SupplyCategory, type Unit } from "@/domain/nat";

type MembershipRow = Database["public"]["Tables"]["business_members"]["Row"];
type SettingsRow = Database["public"]["Tables"]["business_settings"]["Row"];
type SupplyRow = Database["public"]["Tables"]["supplies"]["Row"];
type PurchaseRow = Database["public"]["Tables"]["supply_purchases"]["Row"];
type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type RecipeRow = Database["public"]["Tables"]["recipe_items"]["Row"];
type SaleRow = Database["public"]["Tables"]["sales"]["Row"];
type SaleItemRow = Database["public"]["Tables"]["sale_items"]["Row"];
type ExpenseRow = Database["public"]["Tables"]["sporadic_expenses"]["Row"];

const numberValue = (value: number | string | null | undefined) => Number.isFinite(Number(value)) ? Number(value) : 0;
const rows = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];
function failure(context: string, error: { message: string } | null) { if (error) throw new Error(`${context}: ${error.message}`); }

async function ensureBusiness(): Promise<string> {
  const membership = await supabase.from("business_members").select("business_id").order("created_at",{ ascending: true }).limit(1).maybeSingle();
  failure("Não foi possível localizar a empresa",membership.error);
  const existing = (membership.data as Pick<MembershipRow,"business_id"> | null)?.business_id;
  if (existing) return existing;
  const created = await supabase.rpc("bootstrap_nat_business",{ p_name: "NAT", p_owner_name: "Natalia" });
  failure("Não foi possível preparar a NAT",created.error);
  if (!created.data) throw new Error("A empresa não foi criada.");
  return String(created.data);
}

export async function loadNatCloudState(): Promise<{ businessId: string; state: NatState }> {
  const businessId = await ensureBusiness();
  const [settingsResult,suppliesResult,purchasesResult,productsResult,recipeResult,salesResult,saleItemsResult,expensesResult] = await Promise.all([
    supabase.from("business_settings").select("*").eq("business_id",businessId).maybeSingle(),
    supabase.from("supplies").select("*").eq("business_id",businessId).order("name",{ ascending: true }),
    supabase.from("supply_purchases").select("*").eq("business_id",businessId).order("purchased_at",{ ascending: false }).order("created_at",{ ascending: false }),
    supabase.from("products").select("*").eq("business_id",businessId).order("name",{ ascending: true }),
    supabase.from("recipe_items").select("*").eq("business_id",businessId),
    supabase.from("sales").select("*").eq("business_id",businessId).order("sold_at",{ ascending: false }),
    supabase.from("sale_items").select("*").eq("business_id",businessId),
    supabase.from("sporadic_expenses").select("*").eq("business_id",businessId).order("spent_at",{ ascending: false }).order("created_at",{ ascending: false }),
  ]);
  failure("Não foi possível carregar as configurações",settingsResult.error); failure("Não foi possível carregar os ingredientes",suppliesResult.error); failure("Não foi possível carregar as compras",purchasesResult.error); failure("Não foi possível carregar os produtos",productsResult.error); failure("Não foi possível carregar as receitas",recipeResult.error); failure("Não foi possível carregar as vendas",salesResult.error); failure("Não foi possível carregar os itens das vendas",saleItemsResult.error); failure("Não foi possível carregar os gastos esporádicos",expensesResult.error);

  const purchaseRows = rows<PurchaseRow>(purchasesResult.data);
  const latestPurchase = new Map<string,PurchaseRow>(); for (const purchase of purchaseRows) if (!latestPurchase.has(purchase.supply_id)) latestPurchase.set(purchase.supply_id,purchase);
  const allSupplies = rows<SupplyRow>(suppliesResult.data);
  const recipeRows = rows<RecipeRow>(recipeResult.data);
  const activeProductRows = rows<ProductRow>(productsResult.data).filter((row) => row.active);
  const referencedSupplyIds = new Set(recipeRows.filter((row) => activeProductRows.some((product) => product.id === row.product_id)).map((row) => row.supply_id));
  const supplies: Supply[] = allSupplies.filter((row) => row.active || referencedSupplyIds.has(row.id)).map((row) => {
    const purchase = latestPurchase.get(row.id);
    return { id: row.id, name: row.name, category: row.category as SupplyCategory, packageQuantity: numberValue(purchase?.package_quantity ?? 1), packageUnit: (purchase?.package_unit ?? "unit") as Unit, packagePrice: numberValue(purchase?.package_price), purchasedAt: purchase?.purchased_at ?? new Date().toISOString().slice(0,10) };
  });
  const products: Product[] = activeProductRows.map((row) => ({ id: row.id, name: row.name, portfolioKey: row.portfolio_key ?? null, batchYield: numberValue(row.batch_yield), sellingPrice: numberValue(row.selling_price), lossPercent: numberValue(row.loss_percent), productionCostPerBatch: numberValue(row.production_cost_per_batch), minimumMarginPercent: numberValue(row.minimum_margin_percent), targetMarginPercent: numberValue(row.target_margin_percent), recipe: recipeRows.filter((item) => item.product_id === row.id).map((item): RecipeItem => ({ id: item.id, supplyId: item.supply_id, quantity: numberValue(item.quantity), unit: item.unit as Unit })) }));
  const saleItems = rows<SaleItemRow>(saleItemsResult.data); const itemBySale = new Map<string,SaleItemRow>(); for (const item of saleItems) if (!itemBySale.has(item.sale_id)) itemBySale.set(item.sale_id,item);
  const sales = rows<SaleRow>(salesResult.data).map((row) => { const item = itemBySale.get(row.id); if (!item) return null; return { id: row.id, productId: item.product_id, productName: item.product_name_snapshot, portfolioKey: item.portfolio_key_snapshot ?? null, quantity: numberValue(item.quantity), totalReceived: numberValue(row.total_received), paymentMethod: row.payment_method as PaymentMethod, soldAt: row.sold_at, unitCostSnapshot: numberValue(item.unit_cost_snapshot), variableFeeSnapshot: numberValue(row.variable_fee_snapshot), contributionSnapshot: numberValue(row.contribution_snapshot) }; }).filter((sale): sale is NonNullable<typeof sale> => sale !== null);
  const expenses: SporadicExpense[] = rows<ExpenseRow>(expensesResult.data).map((row) => ({ id: row.id, name: row.name, amount: numberValue(row.amount), spentAt: row.spent_at }));
  const settingsRow = settingsResult.data as SettingsRow | null;
  const settings: Settings = settingsRow ? { ownerName: settingsRow.owner_name, monthlyFixedCosts: numberValue(settingsRow.monthly_fixed_costs), paymentFeePercent: numberValue(settingsRow.payment_fee_percent), defaultMinimumMarginPercent: numberValue(settingsRow.default_minimum_margin_percent), defaultTargetMarginPercent: numberValue(settingsRow.default_target_margin_percent) } : initialState.settings;
  return { businessId, state: { version: 3, supplies, products, sales, expenses, settings } };
}

const canonicalState = (state: NatState) => JSON.stringify({
  ...state,
  supplies: [...state.supplies].sort((a,b) => a.id.localeCompare(b.id)),
  products: [...state.products].map((product) => ({ ...product, recipe: [...product.recipe].sort((a,b) => a.id.localeCompare(b.id)) })).sort((a,b) => a.id.localeCompare(b.id)),
  sales: [...state.sales].sort((a,b) => a.id.localeCompare(b.id)),
  expenses: [...state.expenses].sort((a,b) => a.id.localeCompare(b.id)),
});
export function sameNatState(left: NatState, right: NatState) { return canonicalState(left) === canonicalState(right); }
const same = (left: unknown,right: unknown) => JSON.stringify(left) === JSON.stringify(right);
async function rpc(name: "delete_sale" | "archive_product" | "delete_supply" | "save_supply" | "save_product" | "save_sale" | "save_business_settings" | "save_sporadic_expense" | "delete_sporadic_expense", params: Record<string, unknown>) {
  const result = await supabase.rpc(name,params as never); failure(`Falha ao salvar (${name})`,result.error);
}

export async function persistNatTransition(businessId: string, previous: NatState, next: NatState) {
  const previousSales = new Map(previous.sales.map((item) => [item.id,item])); const nextSales = new Map(next.sales.map((item) => [item.id,item]));
  for (const sale of previous.sales) if (!nextSales.has(sale.id)) await rpc("delete_sale",{ p_business_id: businessId, p_id: sale.id });
  const previousProducts = new Map(previous.products.map((item) => [item.id,item])); const nextProducts = new Map(next.products.map((item) => [item.id,item]));
  for (const product of previous.products) if (!nextProducts.has(product.id)) await rpc("archive_product",{ p_business_id: businessId, p_id: product.id });
  const previousSupplies = new Map(previous.supplies.map((item) => [item.id,item])); const nextSupplies = new Map(next.supplies.map((item) => [item.id,item]));
  for (const supply of previous.supplies) if (!nextSupplies.has(supply.id)) await rpc("delete_supply",{ p_business_id: businessId, p_id: supply.id });
  const previousExpenses = new Map(previous.expenses.map((item) => [item.id,item])); const nextExpenses = new Map(next.expenses.map((item) => [item.id,item]));
  for (const expense of previous.expenses) if (!nextExpenses.has(expense.id)) await rpc("delete_sporadic_expense",{ p_business_id: businessId, p_id: expense.id });
  for (const supply of next.supplies) { const old = previousSupplies.get(supply.id); if (!old || !same(old,supply)) await rpc("save_supply",{ p_business_id: businessId,p_id:supply.id,p_name:supply.name,p_category:supply.category,p_package_quantity:supply.packageQuantity,p_package_unit:supply.packageUnit,p_package_price:supply.packagePrice,p_purchased_at:supply.purchasedAt.slice(0,10) }); }
  for (const product of next.products) { const old = previousProducts.get(product.id); if (!old || !same(old,product)) await rpc("save_product",{ p_business_id:businessId,p_id:product.id,p_name:product.name,p_batch_yield:product.batchYield,p_selling_price:product.sellingPrice,p_loss_percent:product.lossPercent,p_production_cost_per_batch:product.productionCostPerBatch,p_minimum_margin_percent:product.minimumMarginPercent,p_target_margin_percent:product.targetMarginPercent,p_recipe:product.recipe as unknown as Json,p_portfolio_key:product.portfolioKey ?? null }); }
  for (const sale of next.sales) if (!previousSales.has(sale.id)) await rpc("save_sale",{ p_business_id:businessId,p_id:sale.id,p_product_id:sale.productId,p_quantity:sale.quantity,p_total_received:sale.totalReceived,p_payment_method:sale.paymentMethod,p_sold_at:sale.soldAt });
  for (const expense of next.expenses) { const old = previousExpenses.get(expense.id); if (!old || !same(old,expense)) await rpc("save_sporadic_expense",{ p_business_id:businessId,p_id:expense.id,p_name:expense.name,p_amount:expense.amount,p_spent_at:expense.spentAt.slice(0,10) }); }
  if (!same(previous.settings,next.settings)) await rpc("save_business_settings",{ p_business_id:businessId,p_owner_name:next.settings.ownerName,p_monthly_fixed_costs:next.settings.monthlyFixedCosts,p_payment_fee_percent:next.settings.paymentFeePercent,p_default_minimum_margin_percent:next.settings.defaultMinimumMarginPercent,p_default_target_margin_percent:next.settings.defaultTargetMarginPercent });
}

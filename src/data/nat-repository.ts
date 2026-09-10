import { supabase } from "@/integrations/supabase/client";
import {
  initialState,
  type NatState,
  type PaymentMethod,
  type Product,
  type RecipeItem,
  type Sale,
  type Settings,
  type Supply,
  type SupplyCategory,
  type Unit,
} from "@/domain/nat";

type MembershipRow = { business_id: string };
type SettingsRow = { owner_name: string; monthly_fixed_costs: number | string; payment_fee_percent: number | string; default_minimum_margin_percent: number | string; default_target_margin_percent: number | string };
type SupplyRow = { id: string; name: string; category: SupplyCategory };
type PurchaseRow = { supply_id: string; package_quantity: number | string; package_unit: Unit; package_price: number | string; purchased_at: string; created_at: string };
type ProductRow = { id: string; name: string; batch_yield: number | string; selling_price: number | string; loss_percent: number | string; production_cost_per_batch: number | string; minimum_margin_percent: number | string; target_margin_percent: number | string };
type RecipeRow = { id: string; product_id: string; supply_id: string; quantity: number | string; unit: Unit };
type SaleRow = { id: string; sold_at: string; total_received: number | string; payment_method: PaymentMethod; variable_fee_snapshot: number | string; contribution_snapshot: number | string };
type SaleItemRow = { sale_id: string; product_id: string; product_name_snapshot: string; quantity: number | string; unit_cost_snapshot: number | string };

const numberValue = (value: number | string | null | undefined) => Number.isFinite(Number(value)) ? Number(value) : 0;
const rows = <T>(value: unknown): T[] => Array.isArray(value) ? (value as T[]) : [];
function failure(context: string, error: { message: string } | null) { if (error) throw new Error(`${context}: ${error.message}`); }

async function ensureBusiness(): Promise<string> {
  const membership = await supabase.from("business_members").select("business_id").order("created_at", { ascending: true }).limit(1).maybeSingle();
  failure("Não foi possível localizar a empresa", membership.error);
  const existing = (membership.data as MembershipRow | null)?.business_id;
  if (existing) return existing;
  const created = await supabase.rpc("bootstrap_nat_business", { p_name: "NAT", p_owner_name: "Natalia" });
  failure("Não foi possível preparar a NAT", created.error);
  if (!created.data) throw new Error("A empresa não foi criada.");
  return String(created.data);
}

export async function loadNatCloudState(): Promise<{ businessId: string; state: NatState }> {
  const businessId = await ensureBusiness();
  const [settingsResult, suppliesResult, purchasesResult, productsResult, recipeResult, salesResult, saleItemsResult] = await Promise.all([
    supabase.from("business_settings").select("owner_name,monthly_fixed_costs,payment_fee_percent,default_minimum_margin_percent,default_target_margin_percent").eq("business_id", businessId).maybeSingle(),
    supabase.from("supplies").select("id,name,category").eq("business_id", businessId).eq("active", true).order("name", { ascending: true }),
    supabase.from("supply_purchases").select("supply_id,package_quantity,package_unit,package_price,purchased_at,created_at").eq("business_id", businessId).order("purchased_at", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("products").select("id,name,batch_yield,selling_price,loss_percent,production_cost_per_batch,minimum_margin_percent,target_margin_percent").eq("business_id", businessId).eq("active", true).order("name", { ascending: true }),
    supabase.from("recipe_items").select("id,product_id,supply_id,quantity,unit").eq("business_id", businessId),
    supabase.from("sales").select("id,sold_at,total_received,payment_method,variable_fee_snapshot,contribution_snapshot").eq("business_id", businessId).order("sold_at", { ascending: false }),
    supabase.from("sale_items").select("sale_id,product_id,product_name_snapshot,quantity,unit_cost_snapshot").eq("business_id", businessId),
  ]);
  failure("Não foi possível carregar as configurações", settingsResult.error);
  failure("Não foi possível carregar os ingredientes", suppliesResult.error);
  failure("Não foi possível carregar as compras", purchasesResult.error);
  failure("Não foi possível carregar os produtos", productsResult.error);
  failure("Não foi possível carregar as receitas", recipeResult.error);
  failure("Não foi possível carregar as vendas", salesResult.error);
  failure("Não foi possível carregar os itens das vendas", saleItemsResult.error);

  const purchaseRows = rows<PurchaseRow>(purchasesResult.data);
  const latestPurchase = new Map<string, PurchaseRow>();
  for (const purchase of purchaseRows) if (!latestPurchase.has(purchase.supply_id)) latestPurchase.set(purchase.supply_id, purchase);

  const supplies: Supply[] = rows<SupplyRow>(suppliesResult.data).map((row) => {
    const purchase = latestPurchase.get(row.id);
    return { id: row.id, name: row.name, category: row.category, packageQuantity: numberValue(purchase?.package_quantity ?? 1), packageUnit: purchase?.package_unit ?? "unit", packagePrice: numberValue(purchase?.package_price), purchasedAt: purchase?.purchased_at ?? new Date().toISOString().slice(0, 10) };
  });

  const recipeRows = rows<RecipeRow>(recipeResult.data);
  const products: Product[] = rows<ProductRow>(productsResult.data).map((row) => ({
    id: row.id, name: row.name, batchYield: numberValue(row.batch_yield), sellingPrice: numberValue(row.selling_price), lossPercent: numberValue(row.loss_percent), productionCostPerBatch: numberValue(row.production_cost_per_batch), minimumMarginPercent: numberValue(row.minimum_margin_percent), targetMarginPercent: numberValue(row.target_margin_percent),
    recipe: recipeRows.filter((item) => item.product_id === row.id).map((item): RecipeItem => ({ id: item.id, supplyId: item.supply_id, quantity: numberValue(item.quantity), unit: item.unit })),
  }));

  const saleItems = rows<SaleItemRow>(saleItemsResult.data);
  const itemBySale = new Map<string, SaleItemRow>();
  for (const item of saleItems) if (!itemBySale.has(item.sale_id)) itemBySale.set(item.sale_id, item);
  const sales = rows<SaleRow>(salesResult.data).map((row): Sale | null => {
    const item = itemBySale.get(row.id);
    if (!item) return null;
    return { id: row.id, productId: item.product_id, productName: item.product_name_snapshot, quantity: numberValue(item.quantity), totalReceived: numberValue(row.total_received), paymentMethod: row.payment_method, soldAt: row.sold_at, unitCostSnapshot: numberValue(item.unit_cost_snapshot), variableFeeSnapshot: numberValue(row.variable_fee_snapshot), contributionSnapshot: numberValue(row.contribution_snapshot) };
  }).filter((sale): sale is Sale => sale !== null);

  const settingsRow = settingsResult.data as SettingsRow | null;
  const settings: Settings = settingsRow ? { ownerName: settingsRow.owner_name, monthlyFixedCosts: numberValue(settingsRow.monthly_fixed_costs), paymentFeePercent: numberValue(settingsRow.payment_fee_percent), defaultMinimumMarginPercent: numberValue(settingsRow.default_minimum_margin_percent), defaultTargetMarginPercent: numberValue(settingsRow.default_target_margin_percent) } : initialState.settings;
  return { businessId, state: { version: 2, supplies, products, sales, settings } };
}

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
async function rpc(name: string, params: Record<string, unknown>) { const result = await supabase.rpc(name, params); failure(`Falha ao salvar (${name})`, result.error); }

export async function persistNatTransition(businessId: string, previous: NatState, next: NatState) {
  const previousSales = new Map(previous.sales.map((item) => [item.id, item]));
  const nextSales = new Map(next.sales.map((item) => [item.id, item]));
  for (const sale of previous.sales) if (!nextSales.has(sale.id)) await rpc("delete_sale", { p_business_id: businessId, p_id: sale.id });

  const previousProducts = new Map(previous.products.map((item) => [item.id, item]));
  const nextProducts = new Map(next.products.map((item) => [item.id, item]));
  for (const product of previous.products) if (!nextProducts.has(product.id)) await rpc("archive_product", { p_business_id: businessId, p_id: product.id });

  const previousSupplies = new Map(previous.supplies.map((item) => [item.id, item]));
  const nextSupplies = new Map(next.supplies.map((item) => [item.id, item]));
  for (const supply of previous.supplies) if (!nextSupplies.has(supply.id)) await rpc("delete_supply", { p_business_id: businessId, p_id: supply.id });

  for (const supply of next.supplies) {
    const old = previousSupplies.get(supply.id);
    if (!old || !same(old, supply)) await rpc("save_supply", { p_business_id: businessId, p_id: supply.id, p_name: supply.name, p_category: supply.category, p_package_quantity: supply.packageQuantity, p_package_unit: supply.packageUnit, p_package_price: supply.packagePrice, p_purchased_at: supply.purchasedAt.slice(0, 10) });
  }
  for (const product of next.products) {
    const old = previousProducts.get(product.id);
    if (!old || !same(old, product)) await rpc("save_product", { p_business_id: businessId, p_id: product.id, p_name: product.name, p_batch_yield: product.batchYield, p_selling_price: product.sellingPrice, p_loss_percent: product.lossPercent, p_production_cost_per_batch: product.productionCostPerBatch, p_minimum_margin_percent: product.minimumMarginPercent, p_target_margin_percent: product.targetMarginPercent, p_recipe: product.recipe });
  }
  for (const sale of next.sales) if (!previousSales.has(sale.id)) await rpc("save_sale", { p_business_id: businessId, p_id: sale.id, p_product_id: sale.productId, p_product_name: sale.productName, p_quantity: sale.quantity, p_total_received: sale.totalReceived, p_payment_method: sale.paymentMethod, p_sold_at: sale.soldAt, p_unit_cost_snapshot: sale.unitCostSnapshot, p_variable_fee_snapshot: sale.variableFeeSnapshot, p_contribution_snapshot: sale.contributionSnapshot });
  if (!same(previous.settings, next.settings)) await rpc("save_business_settings", { p_business_id: businessId, p_owner_name: next.settings.ownerName, p_monthly_fixed_costs: next.settings.monthlyFixedCosts, p_payment_fee_percent: next.settings.paymentFeePercent, p_default_minimum_margin_percent: next.settings.defaultMinimumMarginPercent, p_default_target_margin_percent: next.settings.defaultTargetMarginPercent });
}

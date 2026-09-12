import type { Database as GeneratedDatabase, Json } from "@/integrations/supabase/types";

type PublicSchema = GeneratedDatabase["public"];
type Tables = PublicSchema["Tables"];
type Functions = PublicSchema["Functions"];
type ExistingTable<Name extends keyof Tables> = Tables[Name];
type TableWith<
  Name extends keyof Tables,
  RowExtra extends object,
  InsertExtra extends object = { [Key in keyof RowExtra]?: RowExtra[Key] },
  UpdateExtra extends object = { [Key in keyof RowExtra]?: RowExtra[Key] },
> = Omit<ExistingTable<Name>, "Row" | "Insert" | "Update"> & {
  Row: ExistingTable<Name>["Row"] & RowExtra;
  Insert: ExistingTable<Name>["Insert"] & InsertExtra;
  Update: ExistingTable<Name>["Update"] & UpdateExtra;
};

type BusinessSettingsExtra = {
  owner_hourly_rate: number;
  owner_daily_hours: number;
  pix_fee_percent: number;
  cash_fee_percent: number;
  card_fee_percent: number;
  timezone: string;
  fixed_cost_funding_source: string;
};

type ProductExtra = { available: boolean; labor_cost_per_batch: number };
type SaleItemExtra = { labor_cost_snapshot: number };
type SaleExtra = {
  customer_id: string | null;
  transaction_type: string;
  sale_channel: string;
  delivery_cost_snapshot: number;
  discount_reason: string | null;
  below_cost_override: boolean;
};
type FundingExtra = { funding_source: string };

type CustomerMarketingConsentTable = {
  Row: {
    id: number;
    business_id: string;
    customer_id: string;
    status: string;
    source: string;
    notice_version: string;
    actor_user_id: string | null;
    occurred_at: string;
    expires_at: string | null;
    created_at: string;
  };
  Insert: {
    id?: number;
    business_id: string;
    customer_id: string;
    status: string;
    source: string;
    notice_version: string;
    actor_user_id?: string | null;
    occurred_at?: string;
    expires_at?: string | null;
    created_at?: string;
  };
  Update: {
    id?: number;
    business_id?: string;
    customer_id?: string;
    status?: string;
    source?: string;
    notice_version?: string;
    actor_user_id?: string | null;
    occurred_at?: string;
    expires_at?: string | null;
    created_at?: string;
  };
  Relationships: [];
};

type RuntimeFunctions = {
  quote_sale_v1: {
    Args: {
      p_business_id: string;
      p_items: Json;
      p_total_received: number;
      p_payment_method: string;
      p_sold_at: string;
      p_transaction_type?: string;
      p_delivery_cost?: number;
    };
    Returns: Json;
  };
  erase_customer_privacy_v1: {
    Args: { p_business_id: string; p_customer_id: string; p_reason?: string };
    Returns: Json;
  };
  get_customers_snapshot: { Args: { p_business_id: string }; Returns: Json };
  get_owner_cash_movements_snapshot: { Args: { p_business_id: string }; Returns: Json };
  get_inventory_snapshot: { Args: { p_business_id: string }; Returns: Json };
  set_inventory_balance: {
    Args: {
      p_business_id: string;
      p_item_kind: string;
      p_item_id: string;
      p_quantity: number;
      p_minimum_quantity: number;
      p_note?: string | null;
    };
    Returns: undefined;
  };
  set_product_availability: {
    Args: { p_business_id: string; p_id: string; p_expected_updated_at: string | null; p_available: boolean };
    Returns: undefined;
  };
  apply_nat_transition_v3: {
    Args: { p_business_id: string; p_request_id: string; p_operations: Json };
    Returns: Json;
  };
};

/**
 * Effective application schema for Lovable Cloud.
 *
 * `src/integrations/supabase/types.ts` remains the last generated snapshot.
 * This overlay contains only fields/RPCs confirmed against the live Lovable Cloud
 * schema (plus branch RPCs exercised by CI) so application code stays type-safe
 * until the generated snapshot can be refreshed by an authorized generator.
 */
export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<PublicSchema, "Tables" | "Functions"> & {
    Tables: Omit<
      Tables,
      "business_settings" | "products" | "sale_items" | "sales" | "sporadic_expenses" | "supply_purchases"
    > & {
      business_settings: TableWith<"business_settings", BusinessSettingsExtra>;
      products: TableWith<"products", ProductExtra>;
      sale_items: TableWith<"sale_items", SaleItemExtra>;
      sales: TableWith<"sales", SaleExtra>;
      sporadic_expenses: TableWith<"sporadic_expenses", FundingExtra>;
      supply_purchases: TableWith<"supply_purchases", FundingExtra>;
      customer_marketing_consents: CustomerMarketingConsentTable;
    };
    Functions: Functions & RuntimeFunctions;
  };
};

export type { Json };

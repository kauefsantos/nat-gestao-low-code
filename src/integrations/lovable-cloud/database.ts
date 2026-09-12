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
  sale_value_snapshot: number;
  payment_status: string;
  payment_promised_date: string | null;
  payment_promised_time: string | null;
  payment_due_at: string | null;
  paid_at: string | null;
  payment_critical_at: string | null;
};
type FundingExtra = { funding_source: string };
type AiGenerationLogExtra = {
  provider_called_at: string | null;
  provider_attempt_count: number;
  cost_quota_consumed: boolean;
  correlation_id: string | null;
};
type NotificationDeliveryExtra = {
  status: string;
  attempt_count: number;
  provider_status: number | null;
  last_error_code: string | null;
  last_error_message: string | null;
  next_retry_at: string | null;
  locked_at: string | null;
  sent_at: string | null;
  updated_at: string;
};

type CustomerTable = {
  Row: {
    id: string;
    business_id: string;
    name: string;
    phone: string | null;
    instagram: string | null;
    source: string | null;
    marketing_consent: boolean;
    notes: string | null;
    active: boolean;
    credit_status: string;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    business_id: string;
    name: string;
    phone?: string | null;
    instagram?: string | null;
    source?: string | null;
    marketing_consent?: boolean;
    notes?: string | null;
    active?: boolean;
    credit_status?: string;
    created_at?: string;
    updated_at?: string;
  };
  Update: {
    id?: string;
    business_id?: string;
    name?: string;
    phone?: string | null;
    instagram?: string | null;
    source?: string | null;
    marketing_consent?: boolean;
    notes?: string | null;
    active?: boolean;
    credit_status?: string;
    created_at?: string;
    updated_at?: string;
  };
  Relationships: [];
};

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
  stage_recipe_import_v1: {
    Args: {
      p_source_type: string;
      p_file_name: string | null;
      p_file_sha256: string;
      p_parser_version: string;
      p_row_count: number;
    };
    Returns: undefined;
  };
  get_customers_snapshot: { Args: { p_business_id: string }; Returns: Json };
  get_owner_cash_movements_snapshot: { Args: { p_business_id: string }; Returns: Json };
  get_inventory_snapshot: { Args: { p_business_id: string }; Returns: Json };
  get_supply_purchase_snapshot: {
    Args: { p_business_id: string; p_month_start: string };
    Returns: Json;
  };
  get_financial_funding_snapshot: {
    Args: { p_business_id: string; p_month_start: string };
    Returns: Json;
  };
  get_integration_health: { Args: { p_business_id: string }; Returns: Json };
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
  apply_nat_transition_v4: {
    Args: { p_business_id: string; p_request_id: string; p_operations: Json };
    Returns: Json;
  };
  mark_sale_paid_v1: {
    Args: {
      p_business_id: string;
      p_sale_id: string;
      p_payment_method: string;
      p_expected_updated_at?: string | null;
    };
    Returns: Json;
  };
};

/**
 * Effective application schema for Lovable Cloud.
 *
 * `src/integrations/supabase/types.ts` is the generated schema snapshot. This
 * overlay keeps runtime fields and RPC contracts explicit until the next
 * authorized type regeneration.
 */
export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<PublicSchema, "Tables" | "Functions"> & {
    Tables: Omit<
      Tables,
      | "ai_generation_log"
      | "business_settings"
      | "notification_delivery_log"
      | "products"
      | "sale_items"
      | "sales"
      | "sporadic_expenses"
      | "supply_purchases"
    > & {
      ai_generation_log: TableWith<"ai_generation_log", AiGenerationLogExtra>;
      business_settings: TableWith<"business_settings", BusinessSettingsExtra>;
      customers: CustomerTable;
      notification_delivery_log: TableWith<"notification_delivery_log", NotificationDeliveryExtra>;
      products: TableWith<"products", ProductExtra>;
      sale_items: TableWith<"sale_items", SaleItemExtra>;
      sales: TableWith<"sales", SaleExtra>;
      sporadic_expenses: TableWith<"sporadic_expenses", FundingExtra>;
      supply_purchases: TableWith<"supply_purchases", FundingExtra>;
      customer_marketing_consents: CustomerMarketingConsentTable;
    };
    Functions: Omit<Functions, keyof RuntimeFunctions> & RuntimeFunctions;
  };
};

export type { Json };

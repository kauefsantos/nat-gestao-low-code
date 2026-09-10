export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type Business = { id: string; name: string; created_at: string; updated_at: string };
type BusinessMember = { business_id: string; user_id: string; role: "admin" | "member"; created_at: string };
type BusinessSettings = { business_id: string; owner_name: string; monthly_fixed_costs: number; payment_fee_percent: number; default_minimum_margin_percent: number; default_target_margin_percent: number; updated_at: string };
type Supply = { id: string; business_id: string; name: string; category: "ingredient" | "packaging"; active: boolean; created_at: string; updated_at: string };
type SupplyPurchase = { id: string; business_id: string; supply_id: string; package_quantity: number; package_unit: "g" | "kg" | "ml" | "l" | "unit"; package_price: number; purchased_at: string; created_at: string };
type Product = { id: string; business_id: string; name: string; portfolio_key: string | null; batch_yield: number; selling_price: number; loss_percent: number; production_cost_per_batch: number; minimum_margin_percent: number; target_margin_percent: number; active: boolean; created_at: string; updated_at: string };
type RecipeItem = { id: string; business_id: string; product_id: string; supply_id: string; quantity: number; unit: "g" | "kg" | "ml" | "l" | "unit"; created_at: string };
type Sale = { id: string; business_id: string; sold_at: string; total_received: number; payment_method: "pix" | "cash" | "card" | "other"; variable_fee_snapshot: number; contribution_snapshot: number; created_at: string };
type SaleItem = { id: string; business_id: string; sale_id: string; product_id: string; product_name_snapshot: string; portfolio_key_snapshot: string | null; quantity: number; unit_cost_snapshot: number; unit_price_snapshot: number; created_at: string };
type SporadicExpense = { id: string; business_id: string; name: string; amount: number; spent_at: string; created_at: string; updated_at: string };
type AuditLog = { id: number; business_id: string | null; actor_user_id: string | null; action: "INSERT" | "UPDATE" | "DELETE"; entity_table: string; entity_id: string | null; before_data: Json | null; after_data: Json | null; created_at: string };

export type Database = {
  public: {
    Tables: {
      businesses: Table<Business>;
      business_members: Table<BusinessMember>;
      business_settings: Table<BusinessSettings>;
      supplies: Table<Supply>;
      supply_purchases: Table<SupplyPurchase>;
      products: Table<Product>;
      recipe_items: Table<RecipeItem>;
      sales: Table<Sale>;
      sale_items: Table<SaleItem>;
      sporadic_expenses: Table<SporadicExpense>;
      audit_log: Table<AuditLog>;
    };
    Views: Record<string, never>;
    Functions: {
      bootstrap_nat_business: { Args: { p_name?: string; p_owner_name?: string }; Returns: string };
      save_supply: { Args: { p_business_id: string; p_id: string; p_name: string; p_category: string; p_package_quantity: number; p_package_unit: string; p_package_price: number; p_purchased_at: string }; Returns: undefined };
      delete_supply: { Args: { p_business_id: string; p_id: string }; Returns: undefined };
      save_product: { Args: { p_business_id: string; p_id: string; p_name: string; p_batch_yield: number; p_selling_price: number; p_loss_percent: number; p_production_cost_per_batch: number; p_minimum_margin_percent: number; p_target_margin_percent: number; p_recipe: Json; p_portfolio_key?: string | null }; Returns: undefined };
      archive_product: { Args: { p_business_id: string; p_id: string }; Returns: undefined };
      save_sale: { Args: { p_business_id: string; p_id: string; p_product_id: string; p_quantity: number; p_total_received: number; p_payment_method: string; p_sold_at: string }; Returns: undefined };
      delete_sale: { Args: { p_business_id: string; p_id: string }; Returns: undefined };
      save_sporadic_expense: { Args: { p_business_id: string; p_id: string; p_name: string; p_amount: number; p_spent_at: string }; Returns: undefined };
      delete_sporadic_expense: { Args: { p_business_id: string; p_id: string }; Returns: undefined };
      save_business_settings: { Args: { p_business_id: string; p_owner_name: string; p_monthly_fixed_costs: number; p_payment_fee_percent: number; p_default_minimum_margin_percent: number; p_default_target_margin_percent: number }; Returns: undefined };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
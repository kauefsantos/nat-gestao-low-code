export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_generation_log: {
        Row: {
          business_id: string
          created_at: string
          error_code: string | null
          finished_at: string | null
          format: string
          id: string
          input_tokens: number | null
          latency_ms: number | null
          output_tokens: number | null
          prompt_chars: number
          provider_status: number | null
          status: string
          total_tokens: number | null
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          error_code?: string | null
          finished_at?: string | null
          format: string
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          output_tokens?: number | null
          prompt_chars: number
          provider_status?: number | null
          status?: string
          total_tokens?: number | null
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          error_code?: string | null
          finished_at?: string | null
          format?: string
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          output_tokens?: number | null
          prompt_chars?: number
          provider_status?: number | null
          status?: string
          total_tokens?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_generation_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          business_id: string | null
          created_at: string
          entity_id: string | null
          entity_table: string
          id: number
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          business_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_table: string
          id?: never
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          business_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_table?: string
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_members: {
        Row: {
          business_id: string
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          role?: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_settings: {
        Row: {
          business_id: string
          default_minimum_margin_percent: number
          default_target_margin_percent: number
          monthly_fixed_costs: number
          owner_name: string
          payment_fee_percent: number
          updated_at: string
        }
        Insert: {
          business_id: string
          default_minimum_margin_percent?: number
          default_target_margin_percent?: number
          monthly_fixed_costs?: number
          owner_name?: string
          payment_fee_percent?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          default_minimum_margin_percent?: number
          default_target_margin_percent?: number
          monthly_fixed_costs?: number
          owner_name?: string
          payment_fee_percent?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          business_id: string
          cancelled_at: string | null
          cancelled_by: string | null
          channel: string | null
          completed_at: string | null
          created_at: string
          details: string | null
          event_date: string
          event_time: string | null
          id: string
          kind: string
          objective: string | null
          reminder_enabled: boolean
          source: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          business_id: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          channel?: string | null
          completed_at?: string | null
          created_at?: string
          details?: string | null
          event_date: string
          event_time?: string | null
          id?: string
          kind: string
          objective?: string | null
          reminder_enabled?: boolean
          source?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          channel?: string | null
          completed_at?: string | null
          created_at?: string
          details?: string | null
          event_date?: string
          event_time?: string | null
          id?: string
          kind?: string
          objective?: string | null
          reminder_enabled?: boolean
          source?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_seed_runs: {
        Row: {
          business_id: string
          created_at: string
          seed_key: string
        }
        Insert: {
          business_id: string
          created_at?: string
          seed_key: string
        }
        Update: {
          business_id?: string
          created_at?: string
          seed_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_seed_runs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      mutation_requests: {
        Row: {
          business_id: string
          created_at: string
          request_hash: string
          request_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          request_hash: string
          request_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          request_hash?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mutation_requests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_delivery_log: {
        Row: {
          business_id: string
          created_at: string
          event_count: number
          id: string
          local_date: string
          slot: number
          subscription_id: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          event_count?: number
          id?: string
          local_date: string
          slot: number
          subscription_id: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          event_count?: number
          id?: string
          local_date?: string
          slot?: number
          subscription_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_delivery_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_delivery_log_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "push_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          batch_yield: number
          business_id: string
          created_at: string
          id: string
          loss_percent: number
          minimum_margin_percent: number
          name: string
          portfolio_key: string | null
          production_cost_per_batch: number
          selling_price: number
          target_margin_percent: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          batch_yield: number
          business_id: string
          created_at?: string
          id?: string
          loss_percent?: number
          minimum_margin_percent?: number
          name: string
          portfolio_key?: string | null
          production_cost_per_batch?: number
          selling_price?: number
          target_margin_percent?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          batch_yield?: number
          business_id?: string
          created_at?: string
          id?: string
          loss_percent?: number
          minimum_margin_percent?: number
          name?: string
          portfolio_key?: string | null
          production_cost_per_batch?: number
          selling_price?: number
          target_margin_percent?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          business_id: string
          created_at: string
          enabled: boolean
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          business_id: string
          created_at?: string
          enabled?: boolean
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          business_id?: string
          created_at?: string
          enabled?: boolean
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_items: {
        Row: {
          business_id: string
          created_at: string
          id: string
          product_id: string
          quantity: number
          supply_id: string
          unit: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          supply_id: string
          unit: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          supply_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_items_product_business_fk"
            columns: ["business_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "recipe_items_supply_business_fk"
            columns: ["business_id", "supply_id"]
            isOneToOne: false
            referencedRelation: "supplies"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
      sale_items: {
        Row: {
          business_id: string
          created_at: string
          id: string
          portfolio_key_snapshot: string | null
          product_id: string
          product_name_snapshot: string
          quantity: number
          sale_id: string
          unit_cost_snapshot: number
          unit_price_snapshot: number
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          portfolio_key_snapshot?: string | null
          product_id: string
          product_name_snapshot: string
          quantity: number
          sale_id: string
          unit_cost_snapshot: number
          unit_price_snapshot: number
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          portfolio_key_snapshot?: string | null
          product_id?: string
          product_name_snapshot?: string
          quantity?: number
          sale_id?: string
          unit_cost_snapshot?: number
          unit_price_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_business_fk"
            columns: ["business_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "sale_items_sale_business_fk"
            columns: ["business_id", "sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
      sales: {
        Row: {
          business_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          contribution_snapshot: number
          created_at: string
          id: string
          payment_method: string
          sold_at: string
          status: string
          total_received: number
          updated_at: string
          variable_fee_snapshot: number
        }
        Insert: {
          business_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          contribution_snapshot: number
          created_at?: string
          id?: string
          payment_method: string
          sold_at?: string
          status?: string
          total_received: number
          updated_at?: string
          variable_fee_snapshot?: number
        }
        Update: {
          business_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          contribution_snapshot?: number
          created_at?: string
          id?: string
          payment_method?: string
          sold_at?: string
          status?: string
          total_received?: number
          updated_at?: string
          variable_fee_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      sporadic_expenses: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          id: string
          name: string
          spent_at: string
          updated_at: string
        }
        Insert: {
          amount: number
          business_id: string
          created_at?: string
          id?: string
          name: string
          spent_at: string
          updated_at?: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          id?: string
          name?: string
          spent_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sporadic_expenses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      supplies: {
        Row: {
          active: boolean
          business_id: string
          category: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          business_id: string
          category: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          business_id?: string
          category?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplies_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_purchases: {
        Row: {
          business_id: string
          created_at: string
          id: string
          package_price: number
          package_quantity: number
          package_unit: string
          purchased_at: string
          supply_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          package_price: number
          package_quantity: number
          package_unit: string
          purchased_at?: string
          supply_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          package_price?: number
          package_quantity?: number
          package_unit?: string
          purchased_at?: string
          supply_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supply_purchases_supply_business_fk"
            columns: ["business_id", "supply_id"]
            isOneToOne: false
            referencedRelation: "supplies"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_nat_transition: {
        Args: { p_business_id: string; p_operations: Json }
        Returns: undefined
      }
      apply_nat_transition_v2: {
        Args: {
          p_business_id: string
          p_operations: Json
          p_request_id: string
        }
        Returns: undefined
      }
      archive_product: {
        Args: { p_business_id: string; p_id: string }
        Returns: undefined
      }
      bootstrap_nat_business: {
        Args: { p_name?: string; p_owner_name?: string }
        Returns: string
      }
      cancel_calendar_event_v2: {
        Args: {
          p_business_id: string
          p_expected_updated_at: string
          p_id: string
        }
        Returns: undefined
      }
      cancel_sale: {
        Args: { p_business_id: string; p_id: string; p_reason?: string }
        Returns: undefined
      }
      claim_content_ai_quota: {
        Args: {
          p_business_id: string
          p_format: string
          p_prompt_chars: number
          p_user_id: string
        }
        Returns: string
      }
      configure_content_ai: {
        Args: { p_api_key: string; p_business_id: string }
        Returns: undefined
      }
      content_ai_status: { Args: { p_business_id: string }; Returns: boolean }
      delete_calendar_event: {
        Args: { p_business_id: string; p_id: string }
        Returns: undefined
      }
      delete_push_subscription: {
        Args: { p_business_id: string; p_endpoint: string }
        Returns: undefined
      }
      delete_sale: {
        Args: { p_business_id: string; p_id: string }
        Returns: undefined
      }
      delete_sporadic_expense: {
        Args: { p_business_id: string; p_id: string }
        Returns: undefined
      }
      delete_supply: {
        Args: { p_business_id: string; p_id: string }
        Returns: undefined
      }
      disconnect_content_ai: {
        Args: { p_business_id: string }
        Returns: undefined
      }
      finish_content_ai_generation: {
        Args: {
          p_error_code?: string
          p_id: string
          p_input_tokens?: number
          p_latency_ms: number
          p_output_tokens?: number
          p_provider_status?: number
          p_status: string
          p_total_tokens?: number
        }
        Returns: undefined
      }
      get_content_ai_key: { Args: { p_business_id: string }; Returns: string }
      get_dashboard_summary: {
        Args: { p_business_id: string; p_reference_date?: string }
        Returns: Json
      }
      get_push_backend_config: { Args: never; Returns: Json }
      get_push_public_key: { Args: { p_business_id: string }; Returns: string }
      list_expenses_page: {
        Args: {
          p_before_id?: string
          p_before_spent_at?: string
          p_business_id: string
          p_limit?: number
        }
        Returns: Json
      }
      list_sales_page: {
        Args: {
          p_before_id?: string
          p_before_sold_at?: string
          p_business_id: string
          p_limit?: number
        }
        Returns: Json
      }
      list_supply_purchases_page: {
        Args: {
          p_before_id?: string
          p_before_purchased_at?: string
          p_business_id: string
          p_limit?: number
        }
        Returns: Json
      }
      save_business_settings: {
        Args: {
          p_business_id: string
          p_default_minimum_margin_percent: number
          p_default_target_margin_percent: number
          p_monthly_fixed_costs: number
          p_owner_name: string
          p_payment_fee_percent: number
        }
        Returns: undefined
      }
      save_calendar_event: {
        Args: {
          p_business_id: string
          p_channel: string
          p_details: string
          p_event_date: string
          p_event_time: string
          p_id: string
          p_kind: string
          p_objective: string
          p_status: string
          p_title: string
        }
        Returns: undefined
      }
      save_calendar_event_v2: {
        Args: {
          p_business_id: string
          p_channel: string
          p_details: string
          p_event_date: string
          p_event_time: string
          p_expected_updated_at: string
          p_id: string
          p_kind: string
          p_objective: string
          p_reminder_enabled: boolean
          p_status: string
          p_title: string
        }
        Returns: undefined
      }
      save_product: {
        Args: {
          p_batch_yield: number
          p_business_id: string
          p_id: string
          p_loss_percent: number
          p_minimum_margin_percent: number
          p_name: string
          p_portfolio_key: string
          p_production_cost_per_batch: number
          p_recipe: Json
          p_selling_price: number
          p_target_margin_percent: number
        }
        Returns: undefined
      }
      save_push_subscription: {
        Args: {
          p_auth: string
          p_business_id: string
          p_endpoint: string
          p_p256dh: string
        }
        Returns: undefined
      }
      save_sale: {
        Args: {
          p_business_id: string
          p_id: string
          p_payment_method: string
          p_product_id: string
          p_quantity: number
          p_sold_at: string
          p_total_received: number
        }
        Returns: undefined
      }
      save_sale_items: {
        Args: {
          p_business_id: string
          p_id: string
          p_items: Json
          p_payment_method: string
          p_sold_at: string
          p_total_received: number
        }
        Returns: undefined
      }
      save_sporadic_expense: {
        Args: {
          p_amount: number
          p_business_id: string
          p_id: string
          p_name: string
          p_spent_at: string
        }
        Returns: undefined
      }
      save_supply: {
        Args: {
          p_business_id: string
          p_category: string
          p_id: string
          p_name: string
          p_package_price: number
          p_package_quantity: number
          p_package_unit: string
          p_purchased_at: string
        }
        Returns: undefined
      }
      seed_nat_editorial_calendar: {
        Args: { p_business_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

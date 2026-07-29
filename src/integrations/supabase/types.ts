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
      cities: {
        Row: {
          country_code: string
          id: string
          name: string
        }
        Insert: {
          country_code: string
          id?: string
          name: string
        }
        Update: {
          country_code?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "cities_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
        ]
      }
      countries: {
        Row: {
          code: string
          currency: string
          flag: string
          name: string
        }
        Insert: {
          code: string
          currency?: string
          flag: string
          name: string
        }
        Update: {
          code?: string
          currency?: string
          flag?: string
          name?: string
        }
        Relationships: []
      }
      list_items: {
        Row: {
          checked: boolean
          created_at: string
          currency: string
          id: string
          list_id: string
          price_cents: number
          product_id: string
          quantity: number
          store_id: string
        }
        Insert: {
          checked?: boolean
          created_at?: string
          currency?: string
          id?: string
          list_id: string
          price_cents: number
          product_id: string
          quantity?: number
          store_id: string
        }
        Update: {
          checked?: boolean
          created_at?: string
          currency?: string
          id?: string
          list_id?: string
          price_cents?: number
          product_id?: string
          quantity?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "list_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      list_members: {
        Row: {
          created_at: string
          id: string
          list_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          list_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          list_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "list_members_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          alert_id: string | null
          body: string
          created_at: string
          currency: string
          id: string
          price_cents: number | null
          product_id: string | null
          read: boolean
          store_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          alert_id?: string | null
          body: string
          created_at?: string
          currency?: string
          id?: string
          price_cents?: number | null
          product_id?: string | null
          read?: boolean
          store_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          alert_id?: string | null
          body?: string
          created_at?: string
          currency?: string
          id?: string
          price_cents?: number | null
          product_id?: string | null
          read?: boolean
          store_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "price_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      pantry_items: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          name: string
          product_id: string | null
          quantity: number
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          name: string
          product_id?: string | null
          quantity?: number
          unit?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          name?: string
          product_id?: string | null
          quantity?: number
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pantry_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      price_alerts: {
        Row: {
          active: boolean
          city_id: string
          created_at: string
          currency: string
          id: string
          notified_at: string | null
          product_id: string
          target_cents: number
          user_id: string
        }
        Insert: {
          active?: boolean
          city_id: string
          created_at?: string
          currency?: string
          id?: string
          notified_at?: string | null
          product_id: string
          target_cents: number
          user_id: string
        }
        Update: {
          active?: boolean
          city_id?: string
          created_at?: string
          currency?: string
          id?: string
          notified_at?: string | null
          product_id?: string
          target_cents?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_alerts_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      price_reports: {
        Row: {
          created_at: string
          currency: string
          id: string
          price_cents: number
          product_id: string
          status: string
          store_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          price_cents: number
          product_id: string
          status?: string
          store_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          price_cents?: number
          product_id?: string
          status?: string
          store_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_reports_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_reports_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      price_sources: {
        Row: {
          active: boolean
          catalog_url: string | null
          chain: string
          country_code: string
          created_at: string
          currency: string
          deals_url: string | null
          id: string
          item_selector: string
          name_selector: string
          price_selector: string
          unit_selector: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          catalog_url?: string | null
          chain: string
          country_code?: string
          created_at?: string
          currency?: string
          deals_url?: string | null
          id?: string
          item_selector: string
          name_selector: string
          price_selector: string
          unit_selector?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          catalog_url?: string | null
          chain?: string
          country_code?: string
          created_at?: string
          currency?: string
          deals_url?: string | null
          id?: string
          item_selector?: string
          name_selector?: string
          price_selector?: string
          unit_selector?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      price_sync_runs: {
        Row: {
          chain: string
          error: string | null
          finished_at: string | null
          id: string
          offers_found: number
          offers_upserted: number
          prices_updated: number
          started_at: string
          status: string
        }
        Insert: {
          chain: string
          error?: string | null
          finished_at?: string | null
          id?: string
          offers_found?: number
          offers_upserted?: number
          prices_updated?: number
          started_at?: string
          status?: string
        }
        Update: {
          chain?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          offers_found?: number
          offers_upserted?: number
          prices_updated?: number
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      prices: {
        Row: {
          currency: string
          id: string
          price_cents: number
          product_id: string
          store_id: string
        }
        Insert: {
          currency?: string
          id?: string
          price_cents: number
          product_id: string
          store_id: string
        }
        Update: {
          currency?: string
          id?: string
          price_cents?: number
          product_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          brand: string | null
          category: string
          eco_alternative_id: string | null
          eco_score: string | null
          id: string
          image_url: string | null
          name: string
          unit: string
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          category: string
          eco_alternative_id?: string | null
          eco_score?: string | null
          id?: string
          image_url?: string | null
          name: string
          unit?: string
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          category?: string
          eco_alternative_id?: string | null
          eco_score?: string | null
          id?: string
          image_url?: string | null
          name?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_eco_alternative_id_fkey"
            columns: ["eco_alternative_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      redemptions: {
        Row: {
          code: string
          created_at: string
          id: string
          points_spent: number
          reward: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          points_spent: number
          reward: string
          user_id?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          points_spent?: number
          reward?: string
          user_id?: string
        }
        Relationships: []
      }
      scraped_offers: {
        Row: {
          chain: string
          country_code: string
          created_at: string
          currency: string
          id: string
          kind: string
          name: string
          name_norm: string
          price_cents: number
          product_id: string | null
          scraped_at: string
          source_url: string | null
          unit: string | null
        }
        Insert: {
          chain: string
          country_code?: string
          created_at?: string
          currency?: string
          id?: string
          kind?: string
          name: string
          name_norm: string
          price_cents: number
          product_id?: string | null
          scraped_at?: string
          source_url?: string | null
          unit?: string | null
        }
        Update: {
          chain?: string
          country_code?: string
          created_at?: string
          currency?: string
          id?: string
          kind?: string
          name?: string
          name_norm?: string
          price_cents?: number
          product_id?: string | null
          scraped_at?: string
          source_url?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scraped_offers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_lists: {
        Row: {
          city_id: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          city_id?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          city_id?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_lists_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      store_assortment: {
        Row: {
          available: boolean
          created_at: string
          id: string
          product_id: string
          store_id: string
        }
        Insert: {
          available?: boolean
          created_at?: string
          id?: string
          product_id: string
          store_id: string
        }
        Update: {
          available?: boolean
          created_at?: string
          id?: string
          product_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_assortment_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_assortment_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          address: string
          chain: string
          city_id: string
          id: string
          lat: number | null
          lng: number | null
        }
        Insert: {
          address: string
          chain: string
          city_id: string
          id?: string
          lat?: number | null
          lng?: number | null
        }
        Update: {
          address?: string
          chain?: string
          city_id?: string
          id?: string
          lat?: number | null
          lng?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stores_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      user_points: {
        Row: {
          points: number
          updated_at: string
          user_id: string
        }
        Insert: {
          points?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          points?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          created_at: string
          dietary_prefs: string[]
          favorite_store_chains: string[]
          household_size: number
          onboarded_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dietary_prefs?: string[]
          favorite_store_chains?: string[]
          household_size?: number
          onboarded_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dietary_prefs?: string[]
          favorite_store_chains?: string[]
          household_size?: number
          onboarded_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_list_member: {
        Args: { _list_id: string; _user_id: string }
        Returns: boolean
      }
      is_list_owner: {
        Args: { _list_id: string; _user_id: string }
        Returns: boolean
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      branch_products: {
        Row: {
          branch_id: string
          custom_price: number | null
          is_available: boolean
          product_id: string
        }
        Insert: {
          branch_id: string
          custom_price?: number | null
          is_available?: boolean
          product_id: string
        }
        Update: {
          branch_id?: string
          custom_price?: number | null
          is_available?: boolean
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_products_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_stocks: {
        Row: {
          branch_id: string
          current_qty: number
          ingredient_id: string
          min_threshold: number
        }
        Insert: {
          branch_id: string
          current_qty?: number
          ingredient_id: string
          min_threshold?: number
        }
        Update: {
          branch_id?: string
          current_qty?: number
          ingredient_id?: string
          min_threshold?: number
        }
        Relationships: [
          {
            foreignKeyName: "branch_stocks_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_stocks_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string
          code: string
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          phone: string
          receipt_footer: string
          service_charge_rate: number
          status: Database["public"]["Enums"]["branch_status"]
          tax_rate: number
        }
        Insert: {
          address?: string
          code: string
          created_at?: string
          deleted_at?: string | null
          id: string
          name: string
          phone?: string
          receipt_footer?: string
          service_charge_rate?: number
          status?: Database["public"]["Enums"]["branch_status"]
          tax_rate?: number
        }
        Update: {
          address?: string
          code?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          phone?: string
          receipt_footer?: string
          service_charge_rate?: number
          status?: Database["public"]["Enums"]["branch_status"]
          tax_rate?: number
        }
        Relationships: []
      }
      categories: {
        Row: {
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          id: string
          name: string
          sort_order?: number
        }
        Update: {
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      ingredients: {
        Row: {
          cost_per_unit: number
          id: string
          name: string
          sku: string
          unit: string
        }
        Insert: {
          cost_per_unit?: number
          id: string
          name: string
          sku: string
          unit?: string
        }
        Update: {
          cost_per_unit?: number
          id?: string
          name?: string
          sku?: string
          unit?: string
        }
        Relationships: []
      }
      kala_users: {
        Row: {
          branch_id: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          password_hash: string
          pin_hash: string
          role: Database["public"]["Enums"]["kalapos_role"]
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          is_active?: boolean
          password_hash: string
          pin_hash: string
          role?: Database["public"]["Enums"]["kalapos_role"]
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          password_hash?: string
          pin_hash?: string
          role?: Database["public"]["Enums"]["kalapos_role"]
        }
        Relationships: [
          {
            foreignKeyName: "kala_users_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_groups: {
        Row: {
          id: string
          name: string
          required: boolean
        }
        Insert: {
          id: string
          name: string
          required?: boolean
        }
        Update: {
          id?: string
          name?: string
          required?: boolean
        }
        Relationships: []
      }
      modifier_options: {
        Row: {
          group_id: string
          id: string
          ingredient_id: string | null
          name: string
          price_delta: number
          qty_required: number
        }
        Insert: {
          group_id: string
          id: string
          ingredient_id?: string | null
          name: string
          price_delta?: number
          qty_required?: number
        }
        Update: {
          group_id?: string
          id?: string
          ingredient_id?: string | null
          name?: string
          price_delta?: number
          qty_required?: number
        }
        Relationships: [
          {
            foreignKeyName: "modifier_options_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modifier_options_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          barista_notes: string
          id: string
          modifiers_snapshot: Json
          order_id: string
          product_id: string | null
          product_name_snapshot: string
          qty: number
          subtotal: number
          unit_cogs_snapshot: number
          unit_price_snapshot: number
        }
        Insert: {
          barista_notes?: string
          id: string
          modifiers_snapshot?: Json
          order_id: string
          product_id?: string | null
          product_name_snapshot: string
          qty: number
          subtotal: number
          unit_cogs_snapshot?: number
          unit_price_snapshot: number
        }
        Update: {
          barista_notes?: string
          id?: string
          modifiers_snapshot?: Json
          order_id?: string
          product_id?: string | null
          product_name_snapshot?: string
          qty?: number
          subtotal?: number
          unit_cogs_snapshot?: number
          unit_price_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          branch_id: string
          cashier_id: string | null
          change_amount: number | null
          completed_at: string | null
          created_at: string
          customer_name: string
          discount: number
          discount_reason: string | null
          id: string
          idempotency_key: string
          order_number: string
          order_type: Database["public"]["Enums"]["order_type"]
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          queue_number: string
          service_charge: number
          shift_id: string | null
          split_payments: Json | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          table_number: string | null
          tax_amount: number
          tendered_amount: number | null
          total: number
          void_reason: string | null
          voided_by: string | null
        }
        Insert: {
          branch_id: string
          cashier_id?: string | null
          change_amount?: number | null
          completed_at?: string | null
          created_at?: string
          customer_name?: string
          discount?: number
          discount_reason?: string | null
          id: string
          idempotency_key: string
          order_number: string
          order_type?: Database["public"]["Enums"]["order_type"]
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          queue_number: string
          service_charge?: number
          shift_id?: string | null
          split_payments?: Json | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          table_number?: string | null
          tax_amount?: number
          tendered_amount?: number | null
          total?: number
          void_reason?: string | null
          voided_by?: string | null
        }
        Update: {
          branch_id?: string
          cashier_id?: string | null
          change_amount?: number | null
          completed_at?: string | null
          created_at?: string
          customer_name?: string
          discount?: number
          discount_reason?: string | null
          id?: string
          idempotency_key?: string
          order_number?: string
          order_type?: Database["public"]["Enums"]["order_type"]
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          queue_number?: string
          service_charge?: number
          shift_id?: string | null
          split_payments?: Json | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          table_number?: string | null
          tax_amount?: number
          tendered_amount?: number | null
          total?: number
          void_reason?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      product_modifier_groups: {
        Row: {
          group_id: string
          product_id: string
          sort_order: number
        }
        Insert: {
          group_id: string
          product_id: string
          sort_order?: number
        }
        Update: {
          group_id?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_modifier_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_modifier_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_recipes: {
        Row: {
          ingredient_id: string
          product_id: string
          qty_required: number
        }
        Insert: {
          ingredient_id: string
          product_id: string
          qty_required: number
        }
        Update: {
          ingredient_id?: string
          product_id?: string
          qty_required?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_recipes_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_recipes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          base_price: number
          branch_id: string | null
          category_id: string
          created_at: string
          id: string
          is_active: boolean
          is_customizable: boolean
          mark: string
          name: string
          sku: string
          tone: Database["public"]["Enums"]["product_tone"]
        }
        Insert: {
          base_price: number
          branch_id?: string | null
          category_id: string
          created_at?: string
          id: string
          is_active?: boolean
          is_customizable?: boolean
          mark?: string
          name: string
          sku: string
          tone?: Database["public"]["Enums"]["product_tone"]
        }
        Update: {
          base_price?: number
          branch_id?: string | null
          category_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_customizable?: boolean
          mark?: string
          name?: string
          sku?: string
          tone?: Database["public"]["Enums"]["product_tone"]
        }
        Relationships: [
          {
            foreignKeyName: "products_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          actual_cash: number | null
          branch_id: string
          closed_at: string | null
          closing_stocks: Json | null
          expected_cash: number
          id: string
          notes: string
          opened_at: string
          opening_cash: number
          opening_stocks: Json
          status: Database["public"]["Enums"]["shift_status"]
          user_id: string
        }
        Insert: {
          actual_cash?: number | null
          branch_id: string
          closed_at?: string | null
          closing_stocks?: Json | null
          expected_cash?: number
          id: string
          notes?: string
          opened_at?: string
          opening_cash?: number
          opening_stocks?: Json
          status?: Database["public"]["Enums"]["shift_status"]
          user_id: string
        }
        Update: {
          actual_cash?: number | null
          branch_id?: string
          closed_at?: string | null
          closing_stocks?: Json | null
          expected_cash?: number
          id?: string
          notes?: string
          opened_at?: string
          opening_cash?: number
          opening_stocks?: Json
          status?: Database["public"]["Enums"]["shift_status"]
          user_id?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          balance_after: number
          branch_id: string
          created_at: string
          created_by: string | null
          id: string
          ingredient_id: string
          notes: string
          qty_delta: number
          reference_id: string | null
          shift_id: string | null
          type: Database["public"]["Enums"]["stock_movement_type"]
        }
        Insert: {
          balance_after: number
          branch_id: string
          created_at?: string
          created_by?: string | null
          id: string
          ingredient_id: string
          notes?: string
          qty_delta: number
          reference_id?: string | null
          shift_id?: string | null
          type: Database["public"]["Enums"]["stock_movement_type"]
        }
        Update: {
          balance_after?: number
          branch_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          ingredient_id?: string
          notes?: string
          qty_delta?: number
          reference_id?: string | null
          shift_id?: string | null
          type: Database["public"]["Enums"]["stock_movement_type"]
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          from_branch_id: string
          id: string
          ingredient_id: string
          notes: string
          qty: number
          status: Database["public"]["Enums"]["stock_transfer_status"]
          to_branch_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          from_branch_id: string
          id: string
          ingredient_id: string
          notes?: string
          qty: number
          status?: Database["public"]["Enums"]["stock_transfer_status"]
          to_branch_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          from_branch_id?: string
          id?: string
          ingredient_id?: string
          notes?: string
          qty?: number
          status?: Database["public"]["Enums"]["stock_transfer_status"]
          to_branch_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_branch_stock: {
        Args: {
          p_branch_id: string
          p_ingredient_id: string
          p_movement_id: string
          p_notes: string
          p_qty: number
          p_shift_id: string | null
          p_type: Database["public"]["Enums"]["stock_movement_type"]
          p_user_id: string | null
        }
        Returns: Json
      }
      process_pos_checkout: {
        Args: {
          p_branch_id: string
          p_cashier_id: string | null
          p_customer_name: string
          p_discount?: number
          p_discount_reason?: string | null
          p_held_order_id?: string | null
          p_idempotency_key?: string | null
          p_items?: Json
          p_order_id: string
          p_order_type: Database["public"]["Enums"]["order_type"]
          p_payment_method: Database["public"]["Enums"]["payment_method"]
          p_split_payments?: Json | null
          p_table_number: string | null
          p_tendered_amount?: number | null
        }
        Returns: Json
      }
      transfer_branch_stock: {
        Args: {
          p_from_branch_id: string
          p_from_shift_id?: string | null
          p_in_movement_id: string
          p_ingredient_id: string
          p_notes?: string
          p_out_movement_id: string
          p_qty: number
          p_to_branch_id: string
          p_to_shift_id?: string | null
          p_transfer_id: string
          p_user_id?: string | null
        }
        Returns: Json
      }
    }
    Enums: {
      branch_status: "ACTIVE" | "RENOVATION" | "INACTIVE"
      kalapos_role: "OWNER" | "MANAGER" | "CASHIER" | "BARISTA"
      order_status: "HOLD" | "QUEUED" | "PREPARING" | "READY" | "COMPLETED" | "VOID"
      order_type: "DINE_IN" | "TAKEAWAY"
      payment_method: "CASH" | "QRIS" | "CARD"
      product_tone: "sand" | "rose" | "olive" | "tan" | "slate"
      shift_status: "OPEN" | "CLOSED"
      stock_movement_type:
        | "SALE_DEDUCT"
        | "MANUAL_OUT"
        | "RESTOCK"
        | "TRANSFER_IN"
        | "TRANSFER_OUT"
        | "WASTE"
        | "OPNAME"
      stock_transfer_status: "PENDING" | "COMPLETED" | "CANCELLED"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

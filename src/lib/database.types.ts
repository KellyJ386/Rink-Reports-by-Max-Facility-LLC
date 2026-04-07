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
      daily_report_checklists: {
        Row: {
          created_at: string
          facility_id: string
          id: string
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          facility_id: string
          id?: string
          name: string
          position?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          facility_id?: string
          id?: string
          name?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_report_checklists_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_report_items: {
        Row: {
          checklist_id: string
          created_at: string
          id: string
          label: string
          options: Json | null
          position: number
          required: boolean
          type: string
          updated_at: string
        }
        Insert: {
          checklist_id: string
          created_at?: string
          id?: string
          label: string
          options?: Json | null
          position?: number
          required?: boolean
          type: string
          updated_at?: string
        }
        Update: {
          checklist_id?: string
          created_at?: string
          id?: string
          label?: string
          options?: Json | null
          position?: number
          required?: boolean
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_report_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "daily_report_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_reports: {
        Row: {
          answers: Json
          checklist_id: string
          created_at: string
          facility_id: string
          id: string
          local_id: string | null
          submitted_at: string
          submitted_by: string
        }
        Insert: {
          answers: Json
          checklist_id: string
          created_at?: string
          facility_id: string
          id?: string
          local_id?: string | null
          submitted_at?: string
          submitted_by: string
        }
        Update: {
          answers?: Json
          checklist_id?: string
          created_at?: string
          facility_id?: string
          id?: string
          local_id?: string | null
          submitted_at?: string
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_reports_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "daily_report_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_reports_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      facilities: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      facility_config: {
        Row: {
          created_at: string
          facility_id: string
          key: string
          module: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          facility_id: string
          key: string
          module: string
          updated_at?: string
          value: Json
        }
        Update: {
          created_at?: string
          facility_id?: string
          key?: string
          module?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "facility_config_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      facility_modules: {
        Row: {
          created_at: string
          enabled: boolean
          facility_id: string
          module: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          facility_id: string
          module: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          facility_id?: string
          module?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "facility_modules_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      ice_equipment: {
        Row: {
          active: boolean
          created_at: string
          facility_id: string
          id: string
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          facility_id: string
          id?: string
          name: string
          position?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          facility_id?: string
          id?: string
          name?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ice_equipment_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      ice_operation_type_fields: {
        Row: {
          created_at: string
          id: string
          label: string
          operation_type_id: string
          options: Json | null
          position: number
          required: boolean
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          operation_type_id: string
          options?: Json | null
          position?: number
          required?: boolean
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          operation_type_id?: string
          options?: Json | null
          position?: number
          required?: boolean
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ice_operation_type_fields_operation_type_id_fkey"
            columns: ["operation_type_id"]
            isOneToOne: false
            referencedRelation: "ice_operation_types"
            referencedColumns: ["id"]
          },
        ]
      }
      ice_operation_types: {
        Row: {
          created_at: string
          facility_id: string
          id: string
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          facility_id: string
          id?: string
          name: string
          position?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          facility_id?: string
          id?: string
          name?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ice_operation_types_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      ice_operations: {
        Row: {
          answers: Json
          created_at: string
          equipment_id: string
          facility_id: string
          id: string
          local_id: string | null
          operation_type_id: string
          submitted_at: string
          submitted_by: string
        }
        Insert: {
          answers: Json
          created_at?: string
          equipment_id: string
          facility_id: string
          id?: string
          local_id?: string | null
          operation_type_id: string
          submitted_at?: string
          submitted_by: string
        }
        Update: {
          answers?: Json
          created_at?: string
          equipment_id?: string
          facility_id?: string
          id?: string
          local_id?: string | null
          operation_type_id?: string
          submitted_at?: string
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "ice_operations_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "ice_equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ice_operations_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ice_operations_operation_type_id_fkey"
            columns: ["operation_type_id"]
            isOneToOne: false
            referencedRelation: "ice_operation_types"
            referencedColumns: ["id"]
          },
        ]
      }
      refrigeration_compressors: {
        Row: {
          active: boolean
          created_at: string
          facility_id: string
          id: string
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          facility_id: string
          id?: string
          name: string
          position?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          facility_id?: string
          id?: string
          name?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refrigeration_compressors_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      refrigeration_readings: {
        Row: {
          brine_flow: number | null
          brine_return: number | null
          brine_supply: number | null
          compressor_readings: Json
          condenser_temp: number | null
          created_at: string
          facility_id: string
          ice_surface_temp: number | null
          id: string
          local_id: string | null
          submitted_at: string
          submitted_by: string
        }
        Insert: {
          brine_flow?: number | null
          brine_return?: number | null
          brine_supply?: number | null
          compressor_readings?: Json
          condenser_temp?: number | null
          created_at?: string
          facility_id: string
          ice_surface_temp?: number | null
          id?: string
          local_id?: string | null
          submitted_at?: string
          submitted_by: string
        }
        Update: {
          brine_flow?: number | null
          brine_return?: number | null
          brine_supply?: number | null
          compressor_readings?: Json
          condenser_temp?: number | null
          created_at?: string
          facility_id?: string
          ice_surface_temp?: number | null
          id?: string
          local_id?: string | null
          submitted_at?: string
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "refrigeration_readings_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_log: {
        Row: {
          client_id: string
          created_at: string
          error: string | null
          facility_id: string
          id: string
          module: string
          payload: Json
          status: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          error?: string | null
          facility_id: string
          id?: string
          module: string
          payload: Json
          status: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          error?: string | null
          facility_id?: string
          id?: string
          module?: string
          payload?: Json
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_log_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          facility_id: string
          full_name: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          facility_id: string
          full_name?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          facility_id?: string
          full_name?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_facility_id: { Args: never; Returns: string }
      get_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      known_modules: { Args: never; Returns: string[] }
      list_facility_users: {
        Args: never
        Returns: {
          email: string
          full_name: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }[]
      }
    }
    Enums: {
      user_role: "admin" | "manager" | "staff"
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
    Enums: {
      user_role: ["admin", "manager", "staff"],
    },
  },
} as const

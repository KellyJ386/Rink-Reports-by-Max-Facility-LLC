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
      alerts: {
        Row: {
          id: string
          facility_id: string
          alert_type: string
          severity: string
          target_identifier: string | null
          title: string
          description: string
          metadata: Json
          resolved_at: string | null
          resolved_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          facility_id: string
          alert_type: string
          severity: string
          target_identifier?: string | null
          title: string
          description: string
          metadata?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          facility_id?: string
          alert_type?: string
          severity?: string
          target_identifier?: string | null
          title?: string
          description?: string
          metadata?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notification_prefs: {
        Row: {
          id: string
          user_id: string
          facility_id: string
          email_enabled: boolean
          sms_enabled: boolean
          push_enabled: boolean
          phone_number: string | null
          min_severity: string
          alert_types: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          facility_id: string
          email_enabled?: boolean
          sms_enabled?: boolean
          push_enabled?: boolean
          phone_number?: string | null
          min_severity?: string
          alert_types?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          facility_id?: string
          email_enabled?: boolean
          sms_enabled?: boolean
          push_enabled?: boolean
          phone_number?: string | null
          min_severity?: string
          alert_types?: string[]
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          facility_id: string
          subscription: Json
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          facility_id: string
          subscription: Json
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          facility_id?: string
          subscription?: Json
          created_at?: string
        }
        Relationships: []
      }
      air_quality_readings: {
        Row: {
          co_ppm: number
          created_at: string
          facility_id: string
          id: string
          local_id: string | null
          no2_ppm: number
          notes: string | null
          submitted_at: string
          submitted_by: string
          tier: string
        }
        Insert: {
          co_ppm: number
          created_at?: string
          facility_id: string
          id?: string
          local_id?: string | null
          no2_ppm: number
          notes?: string | null
          submitted_at?: string
          submitted_by: string
          tier: string
        }
        Update: {
          co_ppm?: number
          created_at?: string
          facility_id?: string
          id?: string
          local_id?: string | null
          no2_ppm?: number
          notes?: string | null
          submitted_at?: string
          submitted_by?: string
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "air_quality_readings_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
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
          address_line1: string | null
          address_line2: string | null
          city: string | null
          contact_email: string | null
          contact_phone: string | null
          country: string
          created_at: string
          id: string
          length_unit: string
          name: string
          postal_code: string | null
          slug: string
          state: string | null
          temp_unit: string
          timezone: string
          updated_at: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string
          created_at?: string
          id?: string
          length_unit?: string
          name: string
          postal_code?: string | null
          slug: string
          state?: string | null
          temp_unit?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string
          created_at?: string
          id?: string
          length_unit?: string
          name?: string
          postal_code?: string | null
          slug?: string
          state?: string | null
          temp_unit?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      facility_branding: {
        Row: {
          accent_color: string
          created_at: string
          facility_id: string
          logo_path: string | null
          pdf_header_text: string | null
          primary_color: string
          secondary_color: string
          updated_at: string
        }
        Insert: {
          accent_color?: string
          created_at?: string
          facility_id: string
          logo_path?: string | null
          pdf_header_text?: string | null
          primary_color?: string
          secondary_color?: string
          updated_at?: string
        }
        Update: {
          accent_color?: string
          created_at?: string
          facility_id?: string
          logo_path?: string | null
          pdf_header_text?: string | null
          primary_color?: string
          secondary_color?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "facility_branding_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: true
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      facility_shifts: {
        Row: {
          created_at: string
          end_time: string
          facility_id: string
          id: string
          name: string
          position: number
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_time: string
          facility_id: string
          id?: string
          name: string
          position?: number
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_time?: string
          facility_id?: string
          id?: string
          name?: string
          position?: number
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "facility_shifts_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      facility_config: {
        Row: {
          created_at: string
          facility_id: string
          key: string
          module: string
          retention_policies: Json | null
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          facility_id: string
          key: string
          module: string
          retention_policies?: Json | null
          updated_at?: string
          value: Json
        }
        Update: {
          created_at?: string
          facility_id?: string
          key?: string
          module?: string
          retention_policies?: Json | null
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
      facility_subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          facility_id: string
          plan: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_end: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          facility_id: string
          plan?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          facility_id?: string
          plan?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "facility_subscriptions_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: true
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
      ice_depth_sessions: {
        Row: {
          created_at: string
          facility_id: string
          id: string
          local_id: string | null
          measurements: Json
          notes: string | null
          resurfacing_status: string | null
          status: string
          submitted_at: string
          submitted_by: string
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          facility_id: string
          id?: string
          local_id?: string | null
          measurements?: Json
          notes?: string | null
          resurfacing_status?: string | null
          status?: string
          submitted_at?: string
          submitted_by: string
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          facility_id?: string
          id?: string
          local_id?: string | null
          measurements?: Json
          notes?: string | null
          resurfacing_status?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ice_depth_sessions_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ice_depth_sessions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "ice_depth_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      ice_depth_templates: {
        Row: {
          created_at: string
          facility_id: string
          id: string
          name: string
          points: Json
          position: number
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          facility_id: string
          id?: string
          name: string
          points?: Json
          position?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          facility_id?: string
          id?: string
          name?: string
          points?: Json
          position?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ice_depth_templates_facility_id_fkey"
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
      message_recipients: {
        Row: {
          message_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          message_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          message_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_recipients_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_label: string | null
          attachment_path: string | null
          body: string
          created_at: string
          facility_id: string
          id: string
          sender_id: string
          sent_at: string
          subject: string
        }
        Insert: {
          attachment_label?: string | null
          attachment_path?: string | null
          body?: string
          created_at?: string
          facility_id: string
          id?: string
          sender_id: string
          sent_at?: string
          subject: string
        }
        Update: {
          attachment_label?: string | null
          attachment_path?: string | null
          body?: string
          created_at?: string
          facility_id?: string
          id?: string
          sender_id?: string
          sent_at?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          created_at: string
          data: Json
          description: string
          facility_id: string
          id: string
          incident_type: string
          kind: string
          local_id: string | null
          location: string
          occurred_at: string
          submitted_at: string
          submitted_by: string
        }
        Insert: {
          created_at?: string
          data?: Json
          description: string
          facility_id: string
          id?: string
          incident_type: string
          kind: string
          local_id?: string | null
          location: string
          occurred_at: string
          submitted_at?: string
          submitted_by: string
        }
        Update: {
          created_at?: string
          data?: Json
          description?: string
          facility_id?: string
          id?: string
          incident_type?: string
          kind?: string
          local_id?: string | null
          location?: string
          occurred_at?: string
          submitted_at?: string
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
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
      scheduling_availability: {
        Row: {
          blocks: Json
          created_at: string
          facility_id: string
          id: string
          recurring: boolean
          updated_at: string
          user_id: string
          week_start: string | null
        }
        Insert: {
          blocks?: Json
          created_at?: string
          facility_id: string
          id?: string
          recurring?: boolean
          updated_at?: string
          user_id: string
          week_start?: string | null
        }
        Update: {
          blocks?: Json
          created_at?: string
          facility_id?: string
          id?: string
          recurring?: boolean
          updated_at?: string
          user_id?: string
          week_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_availability_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduling_certifications: {
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
            foreignKeyName: "scheduling_certifications_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduling_position_certifications: {
        Row: {
          certification_id: string
          position_id: string
        }
        Insert: {
          certification_id: string
          position_id: string
        }
        Update: {
          certification_id?: string
          position_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_position_certifications_certification_id_fkey"
            columns: ["certification_id"]
            isOneToOne: false
            referencedRelation: "scheduling_certifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduling_position_certifications_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "scheduling_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduling_positions: {
        Row: {
          color: string
          created_at: string
          facility_id: string
          id: string
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          facility_id: string
          id?: string
          name: string
          position?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          facility_id?: string
          id?: string
          name?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_positions_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduling_schedules: {
        Row: {
          created_at: string
          created_by: string
          facility_id: string
          id: string
          published_at: string | null
          status: string
          updated_at: string
          week_start: string
        }
        Insert: {
          created_at?: string
          created_by: string
          facility_id: string
          id?: string
          published_at?: string | null
          status?: string
          updated_at?: string
          week_start: string
        }
        Update: {
          created_at?: string
          created_by?: string
          facility_id?: string
          id?: string
          published_at?: string | null
          status?: string
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_schedules_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduling_shifts: {
        Row: {
          created_at: string
          end_at: string
          id: string
          notes: string | null
          position_id: string
          schedule_id: string
          start_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_at: string
          id?: string
          notes?: string | null
          position_id: string
          schedule_id: string
          start_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          end_at?: string
          id?: string
          notes?: string | null
          position_id?: string
          schedule_id?: string
          start_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_shifts_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "scheduling_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduling_shifts_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "scheduling_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduling_staff_certifications: {
        Row: {
          certification_id: string
          granted_at: string
          user_id: string
        }
        Insert: {
          certification_id: string
          granted_at?: string
          user_id: string
        }
        Update: {
          certification_id?: string
          granted_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_staff_certifications_certification_id_fkey"
            columns: ["certification_id"]
            isOneToOne: false
            referencedRelation: "scheduling_certifications"
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
      create_facility: {
        Args: { p_name: string; p_timezone?: string }
        Returns: string
      }
      get_user_facility_id: { Args: never; Returns: string }
      get_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      is_admin_or_higher: { Args: never; Returns: boolean }
      is_manager_or_admin: { Args: never; Returns: boolean }
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
      user_role: "super_admin" | "admin" | "manager" | "staff" | "viewer"
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
      user_role: ["super_admin", "admin", "manager", "staff", "viewer"],
    },
  },
} as const

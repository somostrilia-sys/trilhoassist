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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      beneficiaries: {
        Row: {
          active: boolean
          client_id: string
          cooperativa: string | null
          cpf: string | null
          created_at: string
          id: string
          name: string
          phone: string | null
          plan_id: string | null
          updated_at: string
          vehicle_chassis: string | null
          vehicle_model: string | null
          vehicle_plate: string | null
          vehicle_year: number | null
        }
        Insert: {
          active?: boolean
          client_id: string
          cooperativa?: string | null
          cpf?: string | null
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          plan_id?: string | null
          updated_at?: string
          vehicle_chassis?: string | null
          vehicle_model?: string | null
          vehicle_plate?: string | null
          vehicle_year?: number | null
        }
        Update: {
          active?: boolean
          client_id?: string
          cooperativa?: string | null
          cpf?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          plan_id?: string | null
          updated_at?: string
          vehicle_chassis?: string | null
          vehicle_model?: string | null
          vehicle_plate?: string | null
          vehicle_year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "beneficiaries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beneficiaries_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          active: boolean
          api_endpoint: string | null
          api_key: string | null
          auto_sync_enabled: boolean | null
          billing_model: string
          cnpj: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          id: string
          km_margin: number | null
          name: string
          sync_interval_minutes: number | null
          tenant_id: string | null
          updated_at: string
          whatsapp_group_id: string | null
        }
        Insert: {
          active?: boolean
          api_endpoint?: string | null
          api_key?: string | null
          auto_sync_enabled?: boolean | null
          billing_model?: string
          cnpj?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          km_margin?: number | null
          name: string
          sync_interval_minutes?: number | null
          tenant_id?: string | null
          updated_at?: string
          whatsapp_group_id?: string | null
        }
        Update: {
          active?: boolean
          api_endpoint?: string | null
          api_key?: string | null
          auto_sync_enabled?: boolean | null
          billing_model?: string
          cnpj?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          km_margin?: number | null
          name?: string
          sync_interval_minutes?: number | null
          tenant_id?: string | null
          updated_at?: string
          whatsapp_group_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      collision_media: {
        Row: {
          created_at: string
          file_name: string
          file_size: number | null
          file_type: string
          file_url: string
          id: string
          mime_type: string | null
          service_request_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number | null
          file_type: string
          file_url: string
          id?: string
          mime_type?: string | null
          service_request_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number | null
          file_type?: string
          file_url?: string
          id?: string
          mime_type?: string | null
          service_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collision_media_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatches: {
        Row: {
          accepted_at: string | null
          beneficiary_arrived_at: string | null
          completed_at: string | null
          created_at: string
          distance_km: number | null
          estimated_arrival_min: number | null
          final_amount: number | null
          id: string
          notes: string | null
          provider_arrived_at: string | null
          provider_id: string | null
          provider_token: string | null
          quoted_amount: number | null
          service_request_id: string
          status: Database["public"]["Enums"]["dispatch_status"]
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          beneficiary_arrived_at?: string | null
          completed_at?: string | null
          created_at?: string
          distance_km?: number | null
          estimated_arrival_min?: number | null
          final_amount?: number | null
          id?: string
          notes?: string | null
          provider_arrived_at?: string | null
          provider_id?: string | null
          provider_token?: string | null
          quoted_amount?: number | null
          service_request_id: string
          status?: Database["public"]["Enums"]["dispatch_status"]
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          beneficiary_arrived_at?: string | null
          completed_at?: string | null
          created_at?: string
          distance_km?: number | null
          estimated_arrival_min?: number | null
          final_amount?: number | null
          id?: string
          notes?: string | null
          provider_arrived_at?: string | null
          provider_id?: string | null
          provider_token?: string | null
          quoted_amount?: number | null
          service_request_id?: string
          status?: Database["public"]["Enums"]["dispatch_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatches_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatches_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_field_mappings: {
        Row: {
          client_id: string
          created_at: string
          erp_value: string
          field_type: string
          id: string
          tenant_id: string
          trilho_id: string | null
          trilho_value: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          erp_value: string
          field_type: string
          id?: string
          tenant_id: string
          trilho_id?: string | null
          trilho_value?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          erp_value?: string
          field_type?: string
          id?: string
          tenant_id?: string
          trilho_id?: string | null
          trilho_value?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_field_mappings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_field_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_sync_logs: {
        Row: {
          client_id: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          records_created: number | null
          records_found: number | null
          records_updated: number | null
          started_at: string
          status: string
          sync_type: string
          tenant_id: string
        }
        Insert: {
          client_id: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          records_created?: number | null
          records_found?: number | null
          records_updated?: number | null
          started_at?: string
          status?: string
          sync_type?: string
          tenant_id: string
        }
        Update: {
          client_id?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          records_created?: number | null
          records_found?: number | null
          records_updated?: number | null
          started_at?: string
          status?: string
          sync_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_sync_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_sync_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_closing_items: {
        Row: {
          closing_id: string
          created_at: string
          id: string
          provider_cost: number
          service_request_id: string
        }
        Insert: {
          closing_id: string
          created_at?: string
          id?: string
          provider_cost?: number
          service_request_id: string
        }
        Update: {
          closing_id?: string
          created_at?: string
          id?: string
          provider_cost?: number
          service_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_closing_items_closing_id_fkey"
            columns: ["closing_id"]
            isOneToOne: false
            referencedRelation: "financial_closings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_closing_items_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_closings: {
        Row: {
          closed_at: string | null
          created_at: string
          id: string
          notes: string | null
          paid_at: string | null
          period_end: string
          period_start: string
          provider_id: string
          status: string
          tenant_id: string
          total_provider_cost: number
          total_services: number
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          period_end: string
          period_start: string
          provider_id: string
          status?: string
          tenant_id: string
          total_provider_cost?: number
          total_services?: number
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          period_end?: string
          period_start?: string
          provider_id?: string
          status?: string
          tenant_id?: string
          total_provider_cost?: number
          total_services?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_closings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_closings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          charged_amount: number
          created_at: string
          id: string
          invoice_id: string
          provider_cost: number
          service_request_id: string
        }
        Insert: {
          charged_amount?: number
          created_at?: string
          id?: string
          invoice_id: string
          provider_cost?: number
          service_request_id: string
        }
        Update: {
          charged_amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          provider_cost?: number
          service_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          client_id: string
          created_at: string
          due_date: string | null
          id: string
          markup_amount: number
          notes: string | null
          paid_at: string | null
          period_end: string
          period_start: string
          sent_at: string | null
          status: string
          tenant_id: string
          total_charged: number
          total_provider_cost: number
          total_services: number
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          markup_amount?: number
          notes?: string | null
          paid_at?: string | null
          period_end: string
          period_start: string
          sent_at?: string | null
          status?: string
          tenant_id: string
          total_charged?: number
          total_provider_cost?: number
          total_services?: number
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          markup_amount?: number
          notes?: string | null
          paid_at?: string | null
          period_end?: string
          period_start?: string
          sent_at?: string | null
          status?: string
          tenant_id?: string
          total_charged?: number
          total_provider_cost?: number
          total_services?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      nps_responses: {
        Row: {
          beneficiary_token: string
          comment: string | null
          created_at: string
          id: string
          score: number
          service_request_id: string
          tenant_id: string
        }
        Insert: {
          beneficiary_token: string
          comment?: string | null
          created_at?: string
          id?: string
          score: number
          service_request_id: string
          tenant_id: string
        }
        Update: {
          beneficiary_token?: string
          comment?: string | null
          created_at?: string
          id?: string
          score?: number
          service_request_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nps_responses_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_responses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_coverages: {
        Row: {
          active: boolean
          created_at: string
          id: string
          lodging_max_value: number | null
          lodging_per: string | null
          max_km: number | null
          max_uses: number
          period_days: number | null
          period_type: string
          plan_id: string
          service_type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          lodging_max_value?: number | null
          lodging_per?: string | null
          max_km?: number | null
          max_uses?: number
          period_days?: number | null
          period_type?: string
          plan_id: string
          service_type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          lodging_max_value?: number | null
          lodging_per?: string | null
          max_km?: number | null
          max_uses?: number
          period_days?: number | null
          period_type?: string
          plan_id?: string
          service_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_coverages_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_usage_exceptions: {
        Row: {
          beneficiary_id: string
          created_at: string
          granted_by: string
          id: string
          justification: string
          service_request_id: string | null
          service_type: string
          used_at: string | null
        }
        Insert: {
          beneficiary_id: string
          created_at?: string
          granted_by: string
          id?: string
          justification: string
          service_request_id?: string | null
          service_type: string
          used_at?: string | null
        }
        Update: {
          beneficiary_id?: string
          created_at?: string
          granted_by?: string
          id?: string
          justification?: string
          service_request_id?: string | null
          service_type?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_usage_exceptions_beneficiary_id_fkey"
            columns: ["beneficiary_id"]
            isOneToOne: false
            referencedRelation: "beneficiaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_usage_exceptions_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          client_id: string
          created_at: string
          id: string
          max_dispatches_per_year: number | null
          max_tow_km: number | null
          name: string
          plate_fee: number | null
          services: Json | null
        }
        Insert: {
          active?: boolean
          client_id: string
          created_at?: string
          id?: string
          max_dispatches_per_year?: number | null
          max_tow_km?: number | null
          name: string
          plate_fee?: number | null
          services?: Json | null
        }
        Update: {
          active?: boolean
          client_id?: string
          created_at?: string
          id?: string
          max_dispatches_per_year?: number | null
          max_tow_km?: number | null
          name?: string
          plate_fee?: number | null
          services?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      provider_blacklist: {
        Row: {
          active: boolean
          blocked_at: string
          blocked_by: string | null
          created_at: string
          id: string
          provider_id: string
          reason: string
          tenant_id: string
          unblocked_at: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          blocked_at?: string
          blocked_by?: string | null
          created_at?: string
          id?: string
          provider_id: string
          reason: string
          tenant_id: string
          unblocked_at?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          blocked_at?: string
          blocked_by?: string | null
          created_at?: string
          id?: string
          provider_id?: string
          reason?: string
          tenant_id?: string
          unblocked_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_blacklist_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_blacklist_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_tracking: {
        Row: {
          accuracy: number | null
          created_at: string
          dispatch_id: string
          heading: number | null
          id: string
          latitude: number
          longitude: number
          speed: number | null
        }
        Insert: {
          accuracy?: number | null
          created_at?: string
          dispatch_id: string
          heading?: number | null
          id?: string
          latitude: number
          longitude: number
          speed?: number | null
        }
        Update: {
          accuracy?: number | null
          created_at?: string
          dispatch_id?: string
          heading?: number | null
          id?: string
          latitude?: number
          longitude?: number
          speed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_tracking_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "dispatches"
            referencedColumns: ["id"]
          },
        ]
      }
      providers: {
        Row: {
          active: boolean
          address_number: string | null
          bank_account: string | null
          bank_agency: string | null
          bank_name: string | null
          city: string | null
          cnpj: string | null
          created_at: string
          email: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          neighborhood: string | null
          phone: string
          pix_key: string | null
          services: string[] | null
          state: string | null
          street: string | null
          tenant_id: string | null
          updated_at: string
          user_id: string | null
          zip_code: string | null
        }
        Insert: {
          active?: boolean
          address_number?: string | null
          bank_account?: string | null
          bank_agency?: string | null
          bank_name?: string | null
          city?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          neighborhood?: string | null
          phone: string
          pix_key?: string | null
          services?: string[] | null
          state?: string | null
          street?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id?: string | null
          zip_code?: string | null
        }
        Update: {
          active?: boolean
          address_number?: string | null
          bank_account?: string | null
          bank_agency?: string | null
          bank_name?: string | null
          city?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          neighborhood?: string | null
          phone?: string
          pix_key?: string | null
          services?: string[] | null
          state?: string | null
          street?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "providers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          module: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          module: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          module?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      service_request_events: {
        Row: {
          created_at: string
          description: string
          event_type: string
          id: string
          new_value: string | null
          old_value: string | null
          service_request_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description: string
          event_type: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          service_request_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          event_type?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          service_request_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_request_events_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      service_requests: {
        Row: {
          beneficiary_id: string | null
          beneficiary_token: string | null
          charged_amount: number | null
          client_id: string | null
          completed_at: string | null
          created_at: string
          destination_address: string | null
          destination_lat: number | null
          destination_lng: number | null
          difficult_access: boolean | null
          estimated_km: number | null
          event_type: Database["public"]["Enums"]["event_type"]
          financial_status: string | null
          id: string
          notes: string | null
          operator_id: string | null
          origin_address: string | null
          origin_lat: number | null
          origin_lng: number | null
          payment_method: string | null
          payment_received_at: string | null
          payment_term: string | null
          plan_id: string | null
          protocol: string
          provider_cost: number | null
          requester_email: string | null
          requester_name: string
          requester_phone: string
          requester_phone_secondary: string | null
          service_type: Database["public"]["Enums"]["service_type"]
          share_token: string | null
          status: Database["public"]["Enums"]["request_status"]
          tenant_id: string | null
          updated_at: string
          vehicle_category: string | null
          vehicle_lowered: boolean | null
          vehicle_model: string | null
          vehicle_plate: string | null
          vehicle_year: number | null
          verification_answers: Json | null
        }
        Insert: {
          beneficiary_id?: string | null
          beneficiary_token?: string | null
          charged_amount?: number | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          destination_address?: string | null
          destination_lat?: number | null
          destination_lng?: number | null
          difficult_access?: boolean | null
          estimated_km?: number | null
          event_type?: Database["public"]["Enums"]["event_type"]
          financial_status?: string | null
          id?: string
          notes?: string | null
          operator_id?: string | null
          origin_address?: string | null
          origin_lat?: number | null
          origin_lng?: number | null
          payment_method?: string | null
          payment_received_at?: string | null
          payment_term?: string | null
          plan_id?: string | null
          protocol: string
          provider_cost?: number | null
          requester_email?: string | null
          requester_name: string
          requester_phone: string
          requester_phone_secondary?: string | null
          service_type?: Database["public"]["Enums"]["service_type"]
          share_token?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          tenant_id?: string | null
          updated_at?: string
          vehicle_category?: string | null
          vehicle_lowered?: boolean | null
          vehicle_model?: string | null
          vehicle_plate?: string | null
          vehicle_year?: number | null
          verification_answers?: Json | null
        }
        Update: {
          beneficiary_id?: string | null
          beneficiary_token?: string | null
          charged_amount?: number | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          destination_address?: string | null
          destination_lat?: number | null
          destination_lng?: number | null
          difficult_access?: boolean | null
          estimated_km?: number | null
          event_type?: Database["public"]["Enums"]["event_type"]
          financial_status?: string | null
          id?: string
          notes?: string | null
          operator_id?: string | null
          origin_address?: string | null
          origin_lat?: number | null
          origin_lng?: number | null
          payment_method?: string | null
          payment_received_at?: string | null
          payment_term?: string | null
          plan_id?: string | null
          protocol?: string
          provider_cost?: number | null
          requester_email?: string | null
          requester_name?: string
          requester_phone?: string
          requester_phone_secondary?: string | null
          service_type?: Database["public"]["Enums"]["service_type"]
          share_token?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          tenant_id?: string | null
          updated_at?: string
          vehicle_category?: string | null
          vehicle_lowered?: boolean | null
          vehicle_model?: string | null
          vehicle_plate?: string | null
          vehicle_year?: number | null
          verification_answers?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_beneficiary_id_fkey"
            columns: ["beneficiary_id"]
            isOneToOne: false
            referencedRelation: "beneficiaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          accent_color: string | null
          active: boolean
          address_number: string | null
          alert_dispatch_minutes: number
          alert_late_minutes: number
          city: string | null
          cnpj: string | null
          created_at: string
          custom_labels: Json | null
          email: string | null
          evolution_api_key: string | null
          evolution_api_url: string | null
          favicon_url: string | null
          followup_max_retries: number
          followup_timeout_minutes: number
          google_api_key: string | null
          id: string
          logo_url: string | null
          name: string
          neighborhood: string | null
          notification_settings: Json | null
          phone: string | null
          primary_color: string | null
          secondary_color: string | null
          slug: string
          state: string | null
          street: string | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          accent_color?: string | null
          active?: boolean
          address_number?: string | null
          alert_dispatch_minutes?: number
          alert_late_minutes?: number
          city?: string | null
          cnpj?: string | null
          created_at?: string
          custom_labels?: Json | null
          email?: string | null
          evolution_api_key?: string | null
          evolution_api_url?: string | null
          favicon_url?: string | null
          followup_max_retries?: number
          followup_timeout_minutes?: number
          google_api_key?: string | null
          id?: string
          logo_url?: string | null
          name: string
          neighborhood?: string | null
          notification_settings?: Json | null
          phone?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          slug: string
          state?: string | null
          street?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          accent_color?: string | null
          active?: boolean
          address_number?: string | null
          alert_dispatch_minutes?: number
          alert_late_minutes?: number
          city?: string | null
          cnpj?: string | null
          created_at?: string
          custom_labels?: Json | null
          email?: string | null
          evolution_api_key?: string | null
          evolution_api_url?: string | null
          favicon_url?: string | null
          followup_max_retries?: number
          followup_timeout_minutes?: number
          google_api_key?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          neighborhood?: string | null
          notification_settings?: Json | null
          phone?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          slug?: string
          state?: string | null
          street?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_tenants: {
        Row: {
          created_at: string
          id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_tenants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversation_notes: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversation_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversations: {
        Row: {
          assigned_to: string | null
          beneficiary_id: string | null
          contact_name: string | null
          created_at: string
          destination_address: string | null
          destination_lat: number | null
          destination_lng: number | null
          detected_beneficiary_name: string | null
          detected_event_type: string | null
          detected_plate: string | null
          detected_service_type: string | null
          detected_vehicle_category: string | null
          detected_vehicle_model: string | null
          detected_vehicle_year: number | null
          detected_verification_answers: Json | null
          followup_count: number
          id: string
          last_followup_at: string | null
          last_message_at: string | null
          origin_lat: number | null
          origin_lng: number | null
          phone: string
          priority: string | null
          service_request_id: string | null
          status: string
          tags: string[] | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          beneficiary_id?: string | null
          contact_name?: string | null
          created_at?: string
          destination_address?: string | null
          destination_lat?: number | null
          destination_lng?: number | null
          detected_beneficiary_name?: string | null
          detected_event_type?: string | null
          detected_plate?: string | null
          detected_service_type?: string | null
          detected_vehicle_category?: string | null
          detected_vehicle_model?: string | null
          detected_vehicle_year?: number | null
          detected_verification_answers?: Json | null
          followup_count?: number
          id?: string
          last_followup_at?: string | null
          last_message_at?: string | null
          origin_lat?: number | null
          origin_lng?: number | null
          phone: string
          priority?: string | null
          service_request_id?: string | null
          status?: string
          tags?: string[] | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          beneficiary_id?: string | null
          contact_name?: string | null
          created_at?: string
          destination_address?: string | null
          destination_lat?: number | null
          destination_lng?: number | null
          detected_beneficiary_name?: string | null
          detected_event_type?: string | null
          detected_plate?: string | null
          detected_service_type?: string | null
          detected_vehicle_category?: string | null
          detected_vehicle_model?: string | null
          detected_vehicle_year?: number | null
          detected_verification_answers?: Json | null
          followup_count?: number
          id?: string
          last_followup_at?: string | null
          last_message_at?: string | null
          origin_lat?: number | null
          origin_lng?: number | null
          phone?: string
          priority?: string | null
          service_request_id?: string | null
          status?: string
          tags?: string[] | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_beneficiary_id_fkey"
            columns: ["beneficiary_id"]
            isOneToOne: false
            referencedRelation: "beneficiaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          direction: string
          external_id: string | null
          id: string
          latitude: number | null
          longitude: number | null
          media_url: string | null
          message_type: string
          raw_payload: Json | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          direction?: string
          external_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          media_url?: string | null
          message_type?: string
          raw_payload?: Json | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          direction?: string
          external_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          media_url?: string | null
          message_type?: string
          raw_payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_quick_replies: {
        Row: {
          category: string | null
          created_at: string
          id: string
          message: string
          sort_order: number | null
          tenant_id: string
          title: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          message: string
          sort_order?: number | null
          tenant_id: string
          title: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          message?: string
          sort_order?: number | null
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_quick_replies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          active: boolean
          body_text: string
          category: string
          created_at: string
          footer_text: string | null
          header_text: string | null
          id: string
          language: string
          meta_template_name: string
          name: string
          tenant_id: string
          updated_at: string
          variables: Json | null
        }
        Insert: {
          active?: boolean
          body_text: string
          category?: string
          created_at?: string
          footer_text?: string | null
          header_text?: string | null
          id?: string
          language?: string
          meta_template_name: string
          name: string
          tenant_id: string
          updated_at?: string
          variables?: Json | null
        }
        Update: {
          active?: boolean
          body_text?: string
          category?: string
          created_at?: string
          footer_text?: string | null
          header_text?: string | null
          id?: string
          language?: string
          meta_template_name?: string
          name?: string
          tenant_id?: string
          updated_at?: string
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_beneficiary_usage: {
        Args: { _beneficiary_id: string; _service_type: string }
        Returns: Json
      }
      get_user_tenant_ids: { Args: { _user_id: string }; Returns: string[] }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      user_belongs_to_tenant: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "operator" | "provider" | "client" | "super_admin"
      dispatch_status:
        | "pending"
        | "sent"
        | "accepted"
        | "rejected"
        | "expired"
        | "cancelled"
        | "completed"
      event_type:
        | "mechanical_failure"
        | "accident"
        | "theft"
        | "flat_tire"
        | "locked_out"
        | "battery_dead"
        | "fuel_empty"
        | "other"
      request_status:
        | "open"
        | "awaiting_dispatch"
        | "dispatched"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "refunded"
      service_type:
        | "tow_light"
        | "tow_heavy"
        | "tow_motorcycle"
        | "locksmith"
        | "tire_change"
        | "battery"
        | "fuel"
        | "lodging"
        | "other"
        | "collision"
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
      app_role: ["admin", "operator", "provider", "client", "super_admin"],
      dispatch_status: [
        "pending",
        "sent",
        "accepted",
        "rejected",
        "expired",
        "cancelled",
        "completed",
      ],
      event_type: [
        "mechanical_failure",
        "accident",
        "theft",
        "flat_tire",
        "locked_out",
        "battery_dead",
        "fuel_empty",
        "other",
      ],
      request_status: [
        "open",
        "awaiting_dispatch",
        "dispatched",
        "in_progress",
        "completed",
        "cancelled",
        "refunded",
      ],
      service_type: [
        "tow_light",
        "tow_heavy",
        "tow_motorcycle",
        "locksmith",
        "tire_change",
        "battery",
        "fuel",
        "lodging",
        "other",
        "collision",
      ],
    },
  },
} as const

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
          cnpj: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          api_endpoint?: string | null
          api_key?: string | null
          cnpj?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          api_endpoint?: string | null
          api_key?: string | null
          cnpj?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      dispatches: {
        Row: {
          accepted_at: string | null
          completed_at: string | null
          created_at: string
          distance_km: number | null
          estimated_arrival_min: number | null
          final_amount: number | null
          id: string
          notes: string | null
          provider_id: string | null
          quoted_amount: number | null
          service_request_id: string
          status: Database["public"]["Enums"]["dispatch_status"]
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          completed_at?: string | null
          created_at?: string
          distance_km?: number | null
          estimated_arrival_min?: number | null
          final_amount?: number | null
          id?: string
          notes?: string | null
          provider_id?: string | null
          quoted_amount?: number | null
          service_request_id: string
          status?: Database["public"]["Enums"]["dispatch_status"]
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          completed_at?: string | null
          created_at?: string
          distance_km?: number | null
          estimated_arrival_min?: number | null
          final_amount?: number | null
          id?: string
          notes?: string | null
          provider_id?: string | null
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
      plans: {
        Row: {
          active: boolean
          client_id: string
          created_at: string
          id: string
          max_dispatches_per_year: number | null
          max_tow_km: number | null
          name: string
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
      providers: {
        Row: {
          active: boolean
          city: string | null
          cnpj: string | null
          created_at: string
          email: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          phone: string
          services: string[] | null
          state: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          city?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          phone: string
          services?: string[] | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          city?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          phone?: string
          services?: string[] | null
          state?: string | null
          updated_at?: string
        }
        Relationships: []
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
      service_requests: {
        Row: {
          beneficiary_id: string | null
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
          id: string
          notes: string | null
          operator_id: string | null
          origin_address: string | null
          origin_lat: number | null
          origin_lng: number | null
          plan_id: string | null
          protocol: string
          provider_cost: number | null
          requester_email: string | null
          requester_name: string
          requester_phone: string
          requester_phone_secondary: string | null
          service_type: Database["public"]["Enums"]["service_type"]
          status: Database["public"]["Enums"]["request_status"]
          updated_at: string
          vehicle_lowered: boolean | null
          vehicle_model: string | null
          vehicle_plate: string | null
          vehicle_year: number | null
        }
        Insert: {
          beneficiary_id?: string | null
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
          id?: string
          notes?: string | null
          operator_id?: string | null
          origin_address?: string | null
          origin_lat?: number | null
          origin_lng?: number | null
          plan_id?: string | null
          protocol: string
          provider_cost?: number | null
          requester_email?: string | null
          requester_name: string
          requester_phone: string
          requester_phone_secondary?: string | null
          service_type?: Database["public"]["Enums"]["service_type"]
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
          vehicle_lowered?: boolean | null
          vehicle_model?: string | null
          vehicle_plate?: string | null
          vehicle_year?: number | null
        }
        Update: {
          beneficiary_id?: string | null
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
          id?: string
          notes?: string | null
          operator_id?: string | null
          origin_address?: string | null
          origin_lat?: number | null
          origin_lng?: number | null
          plan_id?: string | null
          protocol?: string
          provider_cost?: number | null
          requester_email?: string | null
          requester_name?: string
          requester_phone?: string
          requester_phone_secondary?: string | null
          service_type?: Database["public"]["Enums"]["service_type"]
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
          vehicle_lowered?: boolean | null
          vehicle_model?: string | null
          vehicle_plate?: string | null
          vehicle_year?: number | null
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
        ]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "operator" | "provider" | "client"
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
      app_role: ["admin", "operator", "provider", "client"],
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
      ],
    },
  },
} as const

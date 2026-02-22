import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useTenantId() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["user-tenant-id", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_tenants")
        .select("tenant_id")
        .eq("user_id", user!.id)
        .limit(1)
        .single();
      return data?.tenant_id ?? null;
    },
    enabled: !!user,
  });
}

export function useCompletedRequests(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["completed-requests-for-finance", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_requests")
        .select(`
          id, protocol, requester_name, vehicle_plate, vehicle_model,
          service_type, origin_address, destination_address,
          provider_cost, charged_amount, financial_status,
          completed_at, created_at,
          client_id, clients (id, name),
          beneficiary_id, beneficiaries (id, name)
        `)
        .eq("tenant_id", tenantId!)
        .eq("status", "completed")
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });
}

export function useProviders(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["providers-for-finance", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("providers")
        .select("id, name")
        .eq("tenant_id", tenantId!)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });
}

export function useClients(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["clients-for-finance", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, billing_model")
        .eq("tenant_id", tenantId!)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });
}

export function useFinancialClosings(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["financial-closings", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_closings")
        .select(`
          *,
          providers (id, name)
        `)
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });
}

export function useInvoices(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["invoices", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(`
          *,
          clients (id, name)
        `)
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });
}

export const SERVICE_TYPE_LABELS: Record<string, string> = {
  tow_light: "Guincho Leve",
  tow_heavy: "Guincho Pesado",
  tow_motorcycle: "Guincho Moto",
  locksmith: "Chaveiro",
  tire_change: "Troca de Pneu",
  battery: "Bateria",
  fuel: "Combustível",
  lodging: "Hospedagem",
  other: "Outro",
};

export const CLOSING_STATUS_LABELS: Record<string, string> = {
  open: "Aberto",
  closed: "Fechado",
  paid: "Pago",
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  sent: "Enviada",
  paid: "Paga",
  overdue: "Vencida",
};

export function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value ?? 0);
}

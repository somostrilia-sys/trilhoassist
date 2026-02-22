import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useClientData() {
  const { user } = useAuth();

  // Get the client record linked to the current user's tenant
  // The client user sees clients in their tenant
  const { data: clients = [], isLoading: clientsLoading } = useQuery({
    queryKey: ["client-portal-clients", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*");
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // For client role, they see service_requests where client_id matches their clients
  const clientIds = clients.map((c) => c.id);

  const { data: serviceRequests = [], isLoading: requestsLoading } = useQuery({
    queryKey: ["client-portal-requests", clientIds],
    queryFn: async () => {
      if (clientIds.length === 0) return [];
      const { data, error } = await supabase
        .from("service_requests")
        .select("*")
        .in("client_id", clientIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: clientIds.length > 0,
  });

  // Beneficiaries for plate tracking
  const { data: beneficiaries = [], isLoading: beneficiariesLoading } = useQuery({
    queryKey: ["client-portal-beneficiaries", clientIds],
    queryFn: async () => {
      if (clientIds.length === 0) return [];
      const { data, error } = await supabase
        .from("beneficiaries")
        .select("*")
        .in("client_id", clientIds);
      if (error) throw error;
      return data;
    },
    enabled: clientIds.length > 0,
  });

  // Financial summary (client sees charged_amount, NOT provider_cost)
  const financialSummary = serviceRequests.reduce(
    (acc, sr) => {
      acc.totalRequests += 1;
      acc.totalCharged += Number(sr.charged_amount || 0);
      if (sr.status === "completed") acc.completed += 1;
      if (sr.status === "cancelled") acc.cancelled += 1;
      if (sr.status === "open" || sr.status === "awaiting_dispatch" || sr.status === "dispatched" || sr.status === "in_progress") acc.active += 1;
      return acc;
    },
    { totalRequests: 0, totalCharged: 0, completed: 0, cancelled: 0, active: 0 }
  );

  // Monthly breakdown
  const monthlyData = serviceRequests.reduce((acc: Record<string, {
    month: string;
    requests: number;
    completed: number;
    charged: number;
  }>, sr) => {
    const dt = new Date(sr.created_at);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    if (!acc[key]) acc[key] = { month: key, requests: 0, completed: 0, charged: 0 };
    acc[key].requests += 1;
    if (sr.status === "completed") {
      acc[key].completed += 1;
      acc[key].charged += Number(sr.charged_amount || 0);
    }
    return acc;
  }, {});

  // Plates active/inactive
  const activePlates = beneficiaries.filter((b) => b.active).length;
  const inactivePlates = beneficiaries.filter((b) => !b.active).length;

  return {
    clients,
    serviceRequests,
    beneficiaries,
    financialSummary,
    monthlyData: Object.values(monthlyData).sort((a, b) => b.month.localeCompare(a.month)),
    activePlates,
    inactivePlates,
    isLoading: clientsLoading || requestsLoading || beneficiariesLoading,
  };
}

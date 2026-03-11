import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useClientData() {
  const { user, clientId } = useAuth();

  // If user has a clientId (association user), fetch only that client
  // Otherwise fetch all accessible clients (admin/operator)
  const { data: clients = [], isLoading: clientsLoading } = useQuery({
    queryKey: ["client-portal-clients", user?.id, clientId],
    queryFn: async () => {
      let query = supabase.from("clients").select("*");
      if (clientId) {
        query = query.eq("id", clientId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

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

  // Fetch dispatches with provider info for reports
  const serviceRequestIds = serviceRequests.map((sr) => sr.id);

  const { data: dispatches = [], isLoading: dispatchesLoading } = useQuery({
    queryKey: ["client-portal-dispatches", serviceRequestIds.slice(0, 50)],
    queryFn: async () => {
      if (serviceRequestIds.length === 0) return [];
      const allDispatches: any[] = [];
      for (let i = 0; i < serviceRequestIds.length; i += 100) {
        const batch = serviceRequestIds.slice(i, i + 100);
        const { data, error } = await supabase
          .from("dispatches")
          .select("id, service_request_id, provider_id, status, accepted_at, provider_arrived_at, completed_at, providers(name)")
          .in("service_request_id", batch)
          .in("status", ["accepted", "completed", "sent"]);
        if (error) throw error;
        if (data) allDispatches.push(...data);
      }
      return allDispatches;
    },
    enabled: serviceRequestIds.length > 0,
  });

  // Fetch representatives for filters
  const { data: representatives = [] } = useQuery({
    queryKey: ["client-portal-representatives", clientIds],
    queryFn: async () => {
      if (clientIds.length === 0) return [];
      const { data, error } = await supabase
        .from("client_representatives" as any)
        .select("*")
        .in("client_id", clientIds)
        .order("name");
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: clientIds.length > 0,
  });

  // Build dispatch map: service_request_id -> dispatch info
  const dispatchMap: Record<string, any> = {};
  dispatches.forEach((d: any) => {
    if (!dispatchMap[d.service_request_id] || d.status === "completed") {
      dispatchMap[d.service_request_id] = d;
    }
  });

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

  const activePlates = beneficiaries.filter((b) => b.active).length;
  const inactivePlates = beneficiaries.filter((b) => !b.active).length;

  // Extract unique cooperativas
  const cooperativas = [...new Set(beneficiaries.map(b => (b as any).cooperativa).filter(Boolean))].sort();

  // Extract unique providers from dispatches
  const providerNames = [...new Set(dispatches.map((d: any) => (d.providers as any)?.name).filter(Boolean))].sort();

  return {
    clients,
    clientId,
    serviceRequests,
    beneficiaries,
    dispatches,
    dispatchMap,
    representatives,
    cooperativas,
    providerNames,
    financialSummary,
    monthlyData: Object.values(monthlyData).sort((a, b) => b.month.localeCompare(a.month)),
    activePlates,
    inactivePlates,
    isLoading: clientsLoading || requestsLoading || beneficiariesLoading,
  };
}

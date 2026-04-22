import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useProviderData() {
  const { user } = useAuth();

  // Get the provider record for the current user
  const { data: provider, isLoading: providerLoading, error: providerError } = useQuery({
    queryKey: ["provider-profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("providers")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    retry: false,
  });

  const notLinked = !providerLoading && !provider && !!user?.id;

  // Get dispatches for this provider
  // Regra: ocultar cancelados, recusados, expirados e atendimentos sem custo (provider_cost / final_amount = 0).
  // Sempre exibir valores na ótica do prestador (provider_cost), não o que cobramos da empresa (charged_amount).
  const { data: dispatches = [], isLoading: dispatchesLoading } = useQuery({
    queryKey: ["provider-dispatches", provider?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dispatches")
        .select(`
          *,
          service_requests (
            id, protocol, requester_name, requester_phone, 
            vehicle_model, vehicle_plate, origin_address, destination_address,
            service_type, event_type, status, created_at, completed_at,
            vehicle_category, verification_answers, estimated_km, provider_cost,
            client_id, clients (id, name),
            beneficiary_id, beneficiaries (id, name)
          )
        `)
        .eq("provider_id", provider!.id)
        .not("status", "in", "(cancelled,rejected,expired)")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Filtra atendimentos sem custo do prestador (zerados ou nulos em ambas as colunas)
      return (data || []).filter((d: any) => {
        const sr = d.service_requests as any;
        const providerCost = Number(d.final_amount ?? sr?.provider_cost ?? 0);
        return providerCost > 0;
      });
    },
    enabled: !!provider?.id,
  });

  // Financial summary grouped by client
  const financialByClient = dispatches.reduce((acc: Record<string, {
    client_name: string;
    client_id: string;
    total_services: number;
    completed_services: number;
    total_amount: number;
    pending_amount: number;
  }>, dispatch) => {
    const sr = dispatch.service_requests as any;
    if (!sr) return acc;
    const clientId = sr.client_id || "sem_cliente";
    const clientName = sr.clients?.name || "Sem Cliente";
    
    if (!acc[clientId]) {
      acc[clientId] = {
        client_name: clientName,
        client_id: clientId,
        total_services: 0,
        completed_services: 0,
        total_amount: 0,
        pending_amount: 0,
      };
    }

    acc[clientId].total_services += 1;
    // Valor SEMPRE na ótica do prestador (o que ele recebe), nunca o que cobramos da empresa
    const amount = Number(
      dispatch.final_amount ?? sr?.provider_cost ?? dispatch.quoted_amount ?? 0
    );

    if (dispatch.status === "completed") {
      acc[clientId].completed_services += 1;
      acc[clientId].total_amount += amount;
    } else {
      acc[clientId].pending_amount += amount;
    }

    return acc;
  }, {});

  // Status counts
  const statusCounts = dispatches.reduce((acc: Record<string, number>, d) => {
    acc[d.status] = (acc[d.status] || 0) + 1;
    return acc;
  }, {});

  return {
    provider,
    providerLoading,
    notLinked,
    dispatches,
    dispatchesLoading,
    financialByClient: Object.values(financialByClient),
    statusCounts,
    isLoading: providerLoading || dispatchesLoading,
  };
}

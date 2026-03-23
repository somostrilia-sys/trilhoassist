import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API_URL = "https://ecaduzwautlpzpvjognr.supabase.co/functions/v1/trilho-financeiro";
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function callApi(body: Record<string, unknown>) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `HTTP ${res.status}`);
  }
  return res.json();
}

export function useFinanceiroDashboard(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: ["fin-dashboard", dateFrom, dateTo],
    queryFn: () => callApi({ action: "dashboard", date_from: dateFrom, date_to: dateTo }),
    enabled: !!dateFrom && !!dateTo,
  });
}

export function useListarFechamentos(mesReferencia: string, search?: string, status?: string) {
  return useQuery({
    queryKey: ["fin-fechamentos", mesReferencia, search, status],
    queryFn: () =>
      callApi({
        action: "listar_fechamentos",
        mes_referencia: mesReferencia,
        ...(search ? { search } : {}),
        ...(status && status !== "todos" ? { status } : {}),
      }),
    enabled: !!mesReferencia,
  });
}

export function useGerarFechamentos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { mes_referencia: string; date_from: string; date_to: string }) =>
      callApi({ action: "gerar_todos", ...params }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fin-fechamentos"] }),
  });
}

export function useAjustarFechamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { fechamento_id: string; tipo: string; descricao: string; valor: number }) =>
      callApi({ action: "ajustar", ...params }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-fechamentos"] });
      qc.invalidateQueries({ queryKey: ["fin-dashboard"] });
    },
  });
}

export function useAprovarFechamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { fechamento_id: string; aprovado_por: string }) =>
      callApi({ action: "aprovar", ...params }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fin-fechamentos"] }),
  });
}

export function usePagarFechamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { fechamento_id: string; comprovante?: string }) =>
      callApi({ action: "pagar", ...params }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fin-fechamentos"] }),
  });
}

export function useCancelarFechamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { fechamento_id: string; observacoes?: string }) =>
      callApi({ action: "cancelar", ...params }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fin-fechamentos"] }),
  });
}

export function useExportFechamentos() {
  return useMutation({
    mutationFn: (mesReferencia: string) =>
      callApi({ action: "export_fechamentos", mes_referencia: mesReferencia }),
  });
}

export function useRegistrarCusto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { categoria: string; descricao: string; valor: number; data: string }) =>
      callApi({ action: "registrar_custo", ...params }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-dashboard"] });
      qc.invalidateQueries({ queryKey: ["fin-custos"] });
    },
  });
}

export function useListarCustos(dateFrom: string, dateTo: string, categoria?: string) {
  return useQuery({
    queryKey: ["fin-custos", dateFrom, dateTo, categoria],
    queryFn: () =>
      callApi({
        action: "listar_custos",
        date_from: dateFrom,
        date_to: dateTo,
        ...(categoria && categoria !== "todos" ? { categoria } : {}),
      }),
    enabled: !!dateFrom && !!dateTo,
  });
}

export const CATEGORIAS_CUSTO = [
  { value: "guincho", label: "Guincho" },
  { value: "chaveiro", label: "Chaveiro" },
  { value: "eletricista", label: "Eletricista" },
  { value: "mecanico", label: "Mecânico" },
  { value: "combustivel", label: "Combustível" },
  { value: "pedagio", label: "Pedágio" },
  { value: "outros", label: "Outros" },
];

export function formatCurrencyBR(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value ?? 0);
}

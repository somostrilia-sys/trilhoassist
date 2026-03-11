import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Clock, MapPin, Car, Truck, AlertCircle, RefreshCw } from "lucide-react";

const SERVICE_LABELS: Record<string, string> = {
  tow_light: "Guincho Leve", tow_heavy: "Guincho Pesado", tow_motorcycle: "Guincho Moto",
  locksmith: "Chaveiro", tire_change: "Troca de Pneu", battery: "Bateria",
  fuel: "Pane Seca", lodging: "Hospedagem", collision: "Colisão", other: "Outro",
};

const STATUS_COLORS: Record<string, string> = {
  open: "border-l-amber-500 bg-amber-500/5",
  awaiting_dispatch: "border-l-amber-500 bg-amber-500/5",
  dispatched: "border-l-blue-500 bg-blue-500/5",
  in_progress: "border-l-emerald-500 bg-emerald-500/5",
};

const STATUS_BADGES: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  open: { label: "🟡 Aberto", variant: "outline" },
  awaiting_dispatch: { label: "🟡 Aguard. Acionamento", variant: "secondary" },
  dispatched: { label: "🔵 Acionado", variant: "secondary" },
  in_progress: { label: "🟢 Em Andamento", variant: "default" },
};

function timeAgo(dateStr: string): string {
  const mins = (Date.now() - new Date(dateStr).getTime()) / 60000;
  if (mins < 1) return "Agora";
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h < 24) return m > 0 ? `${h}h ${m}min` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export default function ClientDispatches() {
  const { clientId } = useAuth();
  const [now, setNow] = useState(Date.now());

  // Tick every 30s to update "time ago"
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(iv);
  }, []);

  const { data: activeRequests = [], isLoading, refetch } = useQuery({
    queryKey: ["client-active-dispatches", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from("service_requests")
        .select("*")
        .eq("client_id", clientId)
        .in("status", ["open", "awaiting_dispatch", "dispatched", "in_progress"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!clientId,
    refetchInterval: 30000,
  });

  // Fetch dispatches for these requests to get provider name
  const reqIds = activeRequests.map((r) => r.id);
  const { data: dispatches = [] } = useQuery({
    queryKey: ["client-active-dispatches-providers", reqIds.slice(0, 20)],
    queryFn: async () => {
      if (reqIds.length === 0) return [];
      const { data, error } = await supabase
        .from("dispatches")
        .select("service_request_id, status, providers(name)")
        .in("service_request_id", reqIds)
        .in("status", ["sent", "accepted"]);
      if (error) throw error;
      return data || [];
    },
    enabled: reqIds.length > 0,
  });

  const dispatchMap = useMemo(() => {
    const map: Record<string, any> = {};
    dispatches.forEach((d: any) => {
      if (!map[d.service_request_id] || d.status === "accepted") {
        map[d.service_request_id] = d;
      }
    });
    return map;
  }, [dispatches]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertCircle className="h-6 w-6 text-primary" />
            Acionamentos Ativos
          </h1>
          <p className="text-muted-foreground">
            {activeRequests.length === 0
              ? "Nenhum acionamento ativo no momento"
              : `${activeRequests.length} acionamento(s) em andamento`}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          Atualizado há {timeAgo(new Date(now - 30000).toISOString())}
        </button>
      </div>

      {activeRequests.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-lg font-medium text-muted-foreground">Tudo tranquilo!</p>
            <p className="text-sm text-muted-foreground">Não há acionamentos ativos para sua associação.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activeRequests.map((sr) => {
            const statusInfo = STATUS_BADGES[sr.status] || { label: sr.status, variant: "outline" as const };
            const colorClass = STATUS_COLORS[sr.status] || "";
            const dispatch = dispatchMap[sr.id];
            const providerName = (dispatch?.providers as any)?.name;

            return (
              <Card key={sr.id} className={`border-l-4 ${colorClass} transition-all hover:shadow-md`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-mono text-xs text-muted-foreground">{sr.protocol}</p>
                      <Badge variant={statusInfo.variant} className="mt-1">
                        {statusInfo.label}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {timeAgo(sr.created_at)}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Car className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium">{sr.requester_name}</span>
                      {sr.vehicle_plate && (
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{sr.vehicle_plate}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-xs">
                        {SERVICE_LABELS[sr.service_type] || sr.service_type}
                      </span>
                    </div>

                    {sr.origin_address && (
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span className="text-xs text-muted-foreground line-clamp-2">{sr.origin_address}</span>
                      </div>
                    )}

                    {sr.destination_address && (
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                        <span className="text-xs text-muted-foreground line-clamp-2">{sr.destination_address}</span>
                      </div>
                    )}

                    {providerName && (
                      <div className="pt-2 border-t">
                        <span className="text-xs text-muted-foreground">Prestador: </span>
                        <span className="text-xs font-medium">{providerName}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

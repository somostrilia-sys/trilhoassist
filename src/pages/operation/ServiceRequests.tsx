import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Clock, CheckCircle, AlertCircle, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  open: { label: "Aberto", variant: "default", icon: AlertCircle },
  awaiting_dispatch: { label: "Aguardando Acionamento", variant: "outline", icon: Clock },
  dispatched: { label: "Acionado", variant: "secondary", icon: Clock },
  in_progress: { label: "Em Andamento", variant: "default", icon: Clock },
  completed: { label: "Finalizado", variant: "secondary", icon: CheckCircle },
  cancelled: { label: "Cancelado", variant: "destructive", icon: XCircle },
  refunded: { label: "Reembolso", variant: "destructive", icon: XCircle },
};

const serviceTypeMap: Record<string, string> = {
  tow_light: "R. Leve",
  tow_heavy: "R. Pesado",
  tow_motorcycle: "R. Moto",
  locksmith: "Chaveiro",
  tire_change: "Troca Pneu",
  battery: "Bateria",
  fuel: "Combustível",
  lodging: "Hospedagem",
  other: "Outro",
};

export default function ServiceRequests() {
  const [requests, setRequests] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadRequests();

    const channel = supabase
      .channel("requests-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "service_requests" }, () => loadRequests())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadRequests = async () => {
    const { data } = await supabase
      .from("service_requests")
      .select("*")
      .order("created_at", { ascending: false });
    setRequests(data || []);
    setLoading(false);
  };

  const filtered = requests.filter((r) => {
    const matchesSearch = !search ||
      r.protocol?.toLowerCase().includes(search.toLowerCase()) ||
      r.requester_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.vehicle_plate?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusCounts = requests.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Atendimentos</h1>
          <p className="text-sm text-muted-foreground">Visualize e acompanhe todos os atendimentos</p>
        </div>
        <Button onClick={() => navigate("/operation/new")} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Atendimento
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por protocolo, nome ou placa..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={statusFilter === "all" ? "default" : "outline"}
          onClick={() => setStatusFilter("all")}
        >
          Todos ({requests.length})
        </Button>
        {Object.entries(statusMap).map(([key, val]) => {
          const count = statusCounts[key] || 0;
          if (count === 0) return null;
          return (
            <Button
              key={key}
              size="sm"
              variant={statusFilter === key ? "default" : "outline"}
              onClick={() => setStatusFilter(key)}
            >
              {val.label} ({count})
            </Button>
          );
        })}
      </div>

      <div className="space-y-3">
        {loading ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              Nenhum atendimento encontrado.
            </CardContent>
          </Card>
        ) : (
          filtered.map((req) => {
            const st = statusMap[req.status] || statusMap.open;
            const StatusIcon = st.icon;
            return (
              <Card
                key={req.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/operation/requests/${req.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <StatusIcon className={`h-5 w-5 mt-0.5 ${req.status === "completed" ? "text-success" : req.status === "cancelled" ? "text-destructive" : "text-primary"}`} />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{req.vehicle_plate || "Sem placa"}</span>
                          {req.vehicle_model && <span className="text-muted-foreground text-sm">- {req.vehicle_model}</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                          <span>{new Date(req.created_at).toLocaleDateString("pt-BR")} {new Date(req.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                          <span>{serviceTypeMap[req.service_type] || req.service_type}</span>
                          {req.charged_amount > 0 && <span>R$ {Number(req.charged_amount).toFixed(2)}</span>}
                          <span>{req.requester_name}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={st.variant}>{st.label}</Badge>
                      <span className="text-sm font-mono text-muted-foreground">{req.protocol}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

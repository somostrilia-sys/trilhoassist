import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantId } from "@/hooks/useFinancialData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, Clock, Users, MessageSquare, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--accent))",
];

export default function WhatsAppMetrics() {
  const { data: tenantId } = useTenantId();
  const navigate = useNavigate();

  // Fetch conversations
  const { data: conversations = [] } = useQuery({
    queryKey: ["wa-metrics-conversations", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_conversations")
        .select("id, assigned_to, status, priority, created_at, last_message_at")
        .eq("tenant_id", tenantId!);
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  // Fetch messages for response time calculation
  const { data: messages = [] } = useQuery({
    queryKey: ["wa-metrics-messages", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_messages")
        .select("conversation_id, direction, created_at")
        .order("created_at", { ascending: true })
        .limit(1000);
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  // Fetch operator names
  const { data: operators = [] } = useQuery({
    queryKey: ["wa-metrics-operators"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name");
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const getOperatorName = (id: string | null) => {
    if (!id) return "Sem atendente";
    return operators.find((o: any) => o.user_id === id)?.full_name || "Atendente";
  };

  // ---- Metrics Calculation ----

  // 1) Average response time (first outbound after inbound, per conversation)
  const avgResponseTime = useMemo(() => {
    const grouped: Record<string, { direction: string; created_at: string }[]> = {};
    messages.forEach((m: any) => {
      if (!grouped[m.conversation_id]) grouped[m.conversation_id] = [];
      grouped[m.conversation_id].push(m);
    });

    const responseTimes: number[] = [];
    Object.values(grouped).forEach((msgs) => {
      for (let i = 0; i < msgs.length; i++) {
        if (msgs[i].direction === "inbound") {
          // find next outbound
          for (let j = i + 1; j < msgs.length; j++) {
            if (msgs[j].direction === "outbound") {
              const diff = new Date(msgs[j].created_at).getTime() - new Date(msgs[i].created_at).getTime();
              responseTimes.push(diff);
              break;
            }
          }
        }
      }
    });

    if (responseTimes.length === 0) return null;
    const avg = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    return avg;
  }, [messages]);

  const formatDuration = (ms: number | null) => {
    if (ms === null) return "—";
    const totalSec = Math.floor(ms / 1000);
    if (totalSec < 60) return `${totalSec}s`;
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    if (min < 60) return `${min}m ${sec}s`;
    const hrs = Math.floor(min / 60);
    return `${hrs}h ${min % 60}m`;
  };

  // 2) Conversations per operator
  const convByOperator = useMemo(() => {
    const map: Record<string, number> = {};
    conversations.forEach((c: any) => {
      const name = getOperatorName(c.assigned_to);
      map[name] = (map[name] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [conversations, operators]);

  // 3) Conversations by hour of day
  const convByHour = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: `${String(i).padStart(2, "0")}h`, count: 0 }));
    conversations.forEach((c: any) => {
      const h = new Date(c.created_at).getHours();
      hours[h].count++;
    });
    return hours;
  }, [conversations]);

  // 4) Status distribution
  const statusDist = useMemo(() => {
    const STATUS_LABELS: Record<string, string> = {
      open: "Aberto",
      pending_service: "Pré-Atendimento",
      service_created: "Atendimento Criado",
      closed: "Encerrado",
    };
    const map: Record<string, number> = {};
    conversations.forEach((c: any) => {
      const label = STATUS_LABELS[c.status] || c.status;
      map[label] = (map[label] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [conversations]);

  // Summary cards
  const totalConvs = conversations.length;
  const activeConvs = conversations.filter((c: any) => c.status !== "closed").length;
  const urgentConvs = conversations.filter((c: any) => c.priority === "high").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/operation/whatsapp")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Métricas WhatsApp
          </h1>
          <p className="text-sm text-muted-foreground">Visão geral do desempenho do atendimento via WhatsApp</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{totalConvs}</p>
                <p className="text-xs text-muted-foreground">Total de Conversas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{activeConvs}</p>
                <p className="text-xs text-muted-foreground">Conversas Ativas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{formatDuration(avgResponseTime)}</p>
                <p className="text-xs text-muted-foreground">Tempo Médio Resposta</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-8 w-8 text-destructive" />
              <div>
                <p className="text-2xl font-bold">{urgentConvs}</p>
                <p className="text-xs text-muted-foreground">Urgentes</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversations by Hour */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conversas por Hora do Dia</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={convByHour}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    color: "hsl(var(--card-foreground))",
                  }}
                />
                <Bar dataKey="count" name="Conversas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Conversations by Operator */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conversas por Atendente</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={convByOperator} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    color: "hsl(var(--card-foreground))",
                  }}
                />
                <Bar dataKey="count" name="Conversas" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Status Distribution */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Distribuição por Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={statusDist}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                >
                  {statusDist.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    color: "hsl(var(--card-foreground))",
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

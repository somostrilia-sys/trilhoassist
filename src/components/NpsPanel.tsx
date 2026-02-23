import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { SmilePlus, MessageSquare, TrendingUp, Frown, Meh, Smile } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
};

function scoreColor(score: number): string {
  if (score <= 6) return "hsl(var(--destructive))";
  if (score <= 8) return "hsl(var(--warning))";
  return "hsl(var(--success))";
}

function npsCategory(score: number): { label: string; icon: typeof Smile } {
  if (score <= 6) return { label: "Detrator", icon: Frown };
  if (score <= 8) return { label: "Neutro", icon: Meh };
  return { label: "Promotor", icon: Smile };
}

type NpsResponse = {
  id: string;
  score: number;
  comment: string | null;
  created_at: string;
  beneficiary_token: string;
  service_request_id: string;
};

interface NpsPanelProps {
  clientFilter?: string;
  periodDays?: number;
  /** Map of service_request_id → client_id, used to filter by client */
  requestClientMap?: Record<string, string>;
}

export default function NpsPanel({ clientFilter = "all", periodDays = 30, requestClientMap }: NpsPanelProps) {
  const [allResponses, setAllResponses] = useState<NpsResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNps();
  }, []);

  const loadNps = async () => {
    const { data } = await supabase
      .from("nps_responses")
      .select("id, score, comment, created_at, beneficiary_token, service_request_id")
      .order("created_at", { ascending: false })
      .limit(500);
    setAllResponses(data || []);
    setLoading(false);
  };

  // Apply filters
  const responses = useMemo(() => {
    let filtered = allResponses;

    // Period filter
    if (periodDays > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - periodDays);
      cutoff.setHours(0, 0, 0, 0);
      filtered = filtered.filter((r) => new Date(r.created_at) >= cutoff);
    }

    // Client filter via requestClientMap
    if (clientFilter !== "all" && requestClientMap) {
      filtered = filtered.filter((r) => requestClientMap[r.service_request_id] === clientFilter);
    }

    return filtered;
  }, [allResponses, clientFilter, periodDays, requestClientMap]);

  const stats = useMemo(() => {
    if (responses.length === 0) return null;

    const total = responses.length;
    const avg = responses.reduce((s, r) => s + r.score, 0) / total;

    const promoters = responses.filter((r) => r.score >= 9).length;
    const detractors = responses.filter((r) => r.score <= 6).length;
    const npsScore = Math.round(((promoters - detractors) / total) * 100);

    const dist = Array.from({ length: 11 }, (_, i) => ({
      score: String(i),
      quantidade: responses.filter((r) => r.score === i).length,
      color: scoreColor(i),
    }));

    const recentComments = responses
      .filter((r) => r.comment && r.comment.trim().length > 0)
      .slice(0, 8);

    return { total, avg, npsScore, promoters, detractors, neutrals: total - promoters - detractors, dist, recentComments };
  }, [responses]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Carregando NPS…
        </CardContent>
      </Card>
    );
  }

  if (!stats || stats.total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <SmilePlus className="h-5 w-5 text-primary" />
            NPS — Satisfação do Beneficiário
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">Nenhuma resposta NPS no período selecionado</p>
        </CardContent>
      </Card>
    );
  }

  const npsColor = stats.npsScore >= 50 ? "text-success" : stats.npsScore >= 0 ? "text-warning" : "text-destructive";

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">NPS Score</span>
              <TrendingUp className={`h-4 w-4 ${npsColor}`} />
            </div>
            <p className={`text-2xl font-bold ${npsColor}`}>{stats.npsScore}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Média</span>
              <SmilePlus className="h-4 w-4 text-primary" />
            </div>
            <p className="text-2xl font-bold">{stats.avg.toFixed(1)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Respostas</span>
              <MessageSquare className="h-4 w-4 text-info" />
            </div>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Promotores</span>
              <Smile className="h-4 w-4 text-success" />
            </div>
            <p className="text-2xl font-bold text-success">
              {stats.total > 0 ? `${Math.round((stats.promoters / stats.total) * 100)}%` : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.promoters} prom · {stats.neutrals} neut · {stats.detractors} det
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Distribution + Comments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <SmilePlus className="h-5 w-5 text-primary" />
              Distribuição de Notas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats.dist}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="score" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="quantidade" name="Respostas" radius={[4, 4, 0, 0]}>
                  {stats.dist.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Comentários Recentes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {stats.recentComments.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Nenhum comentário</p>
            ) : (
              <div className="divide-y divide-border max-h-[280px] overflow-y-auto">
                {stats.recentComments.map((r) => {
                  const cat = npsCategory(r.score);
                  return (
                    <div key={r.id} className="px-5 py-3 flex gap-3">
                      <div
                        className="shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold"
                        style={{ backgroundColor: scoreColor(r.score), color: "white" }}
                      >
                        {r.score}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">{r.comment}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(r.created_at).toLocaleDateString("pt-BR")} · {cat.label}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useFinanceiroDashboard, formatCurrencyBR } from "@/hooks/useTrilhoFinanceiro";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { DollarSign, FileText, Clock, CheckCircle, AlertTriangle, TrendingUp } from "lucide-react";

const COLORS = ["#2563eb", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#6b7280"];

const periodOptions = [
  { value: "this_month", label: "Este mês" },
  { value: "last_month", label: "Mês passado" },
  { value: "custom", label: "Personalizado" },
];

export default function FinanceiroDashboard() {
  const [period, setPeriod] = useState("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const { dateFrom, dateTo } = useMemo(() => {
    const now = new Date();
    if (period === "this_month") {
      return { dateFrom: format(startOfMonth(now), "yyyy-MM-dd"), dateTo: format(endOfMonth(now), "yyyy-MM-dd") };
    }
    if (period === "last_month") {
      const last = subMonths(now, 1);
      return { dateFrom: format(startOfMonth(last), "yyyy-MM-dd"), dateTo: format(endOfMonth(last), "yyyy-MM-dd") };
    }
    return { dateFrom: customFrom, dateTo: customTo };
  }, [period, customFrom, customTo]);

  const { data, isLoading } = useFinanceiroDashboard(dateFrom, dateTo);

  const kpis = [
    { label: "Total Atendimentos", value: data?.total_atendimentos ?? 0, icon: FileText, fmt: false, color: "text-primary" },
    { label: "Custo Prestadores", value: data?.custo_prestadores ?? 0, icon: DollarSign, fmt: true, color: "text-blue-600" },
    { label: "Custos Operacionais", value: data?.custos_operacionais ?? 0, icon: TrendingUp, fmt: true, color: "text-amber-600" },
    { label: "Total Pago", value: data?.total_pago ?? 0, icon: CheckCircle, fmt: true, color: "text-emerald-600" },
    { label: "Pendente Aprovação", value: data?.pendente_aprovacao ?? 0, icon: Clock, fmt: true, color: "text-yellow-600" },
    { label: "Em Aberto", value: data?.em_aberto ?? 0, icon: AlertTriangle, fmt: true, color: "text-red-600" },
  ];

  const pieData = useMemo(() => {
    if (!data?.custos_por_categoria) return [];
    return Object.entries(data.custos_por_categoria).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value: value as number,
    }));
  }, [data]);

  const topProviders: { nome: string; valor: number }[] = data?.top_prestadores ?? [];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Dashboard Financeiro</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periodOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {period === "custom" && (
            <>
              <input type="date" className="border rounded-md px-3 py-2 text-sm bg-background" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              <input type="date" className="border rounded-md px-3 py-2 text-sm bg-background" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <k.icon className={`h-4 w-4 ${k.color}`} />
                <span className="text-xs text-muted-foreground font-medium">{k.label}</span>
              </div>
              {isLoading ? (
                <Skeleton className="h-7 w-20" />
              ) : (
                <p className={`text-xl font-bold ${k.color}`}>
                  {k.fmt ? formatCurrencyBR(k.value) : k.value}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <Card>
          <CardHeader><CardTitle className="text-base">Custos por Categoria</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : pieData.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-12">Sem dados no período</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrencyBR(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top 5 */}
        <Card>
          <CardHeader><CardTitle className="text-base">Top 5 Prestadores</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : topProviders.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-12">Sem dados no período</p>
            ) : (
              <div className="space-y-3">
                {topProviders.map((p, i) => {
                  const max = topProviders[0]?.valor || 1;
                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-foreground">{p.nome}</span>
                        <span className="font-semibold text-primary">{formatCurrencyBR(p.valor)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(p.valor / max) * 100}%` }} />
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

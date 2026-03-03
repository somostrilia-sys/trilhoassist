import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Plus, FileCheck, DollarSign, Clock, CheckCircle, Download, AlertTriangle, Banknote, ListChecks, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  useTenantId, useFinancialClosings, useProviders,
  CLOSING_STATUS_LABELS, SERVICE_TYPE_LABELS, formatCurrency,
} from "@/hooks/useFinancialData";
import { format, subDays } from "date-fns";
import { generateFinancialPdf } from "@/lib/generateFinancialPdf";
import { ProviderInvoiceReview } from "@/components/provider/ProviderInvoiceReview";

const isTermPayment = (method: string | null | undefined) => {
  if (!method) return true;
  return method.toLowerCase().trim() === "boleto";
};

export default function FinancialClosing() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [dueDateFilter, setDueDateFilter] = useState<string>("all");
  const [pendingProviderFilter, setPendingProviderFilter] = useState<string>("all");
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(new Set());
  const [showConfirmBulk, setShowConfirmBulk] = useState(false);
  const [bulkTarget, setBulkTarget] = useState<"selected" | "all">("all");

  const { data: tenantId } = useTenantId();
  const { data: closings = [], isLoading } = useFinancialClosings(tenantId);
  const { data: providers = [] } = useProviders(tenantId);

  // Fetch ALL pending term dispatches (last 30 days) for the new Pendentes tab
  const thirtyDaysAgo = useMemo(() => subDays(new Date(), 30).toISOString(), []);
  const { data: allPendingTerm = [], isLoading: pendingLoading } = useQuery({
    queryKey: ["all-pending-term", tenantId, thirtyDaysAgo],
    queryFn: async () => {
      const { data: dispatches, error } = await supabase
        .from("dispatches")
        .select(`
          id, final_amount, quoted_amount, provider_id,
          providers (id, name),
          service_requests!inner (
            id, protocol, requester_name, vehicle_plate, service_type,
            provider_cost, completed_at, financial_status, tenant_id, status,
            payment_method, payment_term, client_id, clients (id, name)
          )
        `)
        .eq("status", "completed");
      if (error) throw error;
      return (dispatches ?? []).filter((d: any) => {
        const sr = d.service_requests;
        if (!sr || sr.tenant_id !== tenantId || sr.status !== "completed") return false;
        if (sr.financial_status !== "pending") return false;
        if (!isTermPayment(sr.payment_method)) return false;
        if (!sr.completed_at) return false;
        return new Date(sr.completed_at) >= new Date(thirtyDaysAgo);
      });
    },
    enabled: !!tenantId,
  });

  // Group pending by provider
  const pendingByProvider = useMemo(() => {
    const map = new Map<string, { provider_id: string; provider_name: string; dispatches: any[]; total: number }>();
    allPendingTerm.forEach((d: any) => {
      const pid = d.provider_id || "unknown";
      const pname = (d.providers as any)?.name || "Sem prestador";
      if (!map.has(pid)) map.set(pid, { provider_id: pid, provider_name: pname, dispatches: [], total: 0 });
      const group = map.get(pid)!;
      const amount = Number(d.final_amount || d.quoted_amount || d.service_requests?.provider_cost || 0);
      group.dispatches.push(d);
      group.total += amount;
    });
    return Array.from(map.values()).sort((a, b) => a.provider_name.localeCompare(b.provider_name));
  }, [allPendingTerm]);

  const filteredPending = pendingProviderFilter === "all"
    ? allPendingTerm
    : allPendingTerm.filter((d: any) => d.provider_id === pendingProviderFilter);

  const filteredPendingByProvider = pendingProviderFilter === "all"
    ? pendingByProvider
    : pendingByProvider.filter((g) => g.provider_id === pendingProviderFilter);

  const pendingTotal = filteredPending.reduce((s: number, d: any) => s + Number(d.final_amount || d.quoted_amount || d.service_requests?.provider_cost || 0), 0);

  // Fetch cash payments for the cash tab
  const { data: allCashPayments = [] } = useQuery({
    queryKey: ["cash-payments", tenantId],
    queryFn: async () => {
      const { data: dispatches, error } = await supabase
        .from("dispatches")
        .select(`
          id, final_amount, quoted_amount, provider_id,
          providers (id, name),
          service_requests!inner (
            id, protocol, requester_name, vehicle_plate, service_type,
            provider_cost, completed_at, financial_status, tenant_id, status,
            payment_method, payment_term
          )
        `)
        .eq("status", "completed");
      if (error) throw error;
      return (dispatches ?? []).filter((d: any) => {
        const sr = d.service_requests;
        if (!sr || sr.tenant_id !== tenantId || sr.status !== "completed") return false;
        const method = (sr.payment_method || "").toLowerCase().trim();
        return method !== "boleto" && method !== "";
      });
    },
    enabled: !!tenantId,
  });

  // Bulk closing mutation
  const bulkClosingMutation = useMutation({
    mutationFn: async (providerIds: string[]) => {
      const targetGroups = pendingByProvider.filter((g) => providerIds.includes(g.provider_id));
      if (targetGroups.length === 0) throw new Error("Nenhum prestador selecionado.");

      const today = format(new Date(), "yyyy-MM-dd");
      const periodStart = format(subDays(new Date(), 30), "yyyy-MM-dd");

      for (const group of targetGroups) {
        const totalCost = group.dispatches.reduce((sum: number, d: any) =>
          sum + Number(d.final_amount || d.quoted_amount || d.service_requests?.provider_cost || 0), 0);

        const { data: closing, error: closingError } = await supabase
          .from("financial_closings")
          .insert({
            tenant_id: tenantId!,
            provider_id: group.provider_id,
            period_start: periodStart,
            period_end: today,
            total_services: group.dispatches.length,
            total_provider_cost: totalCost,
            status: "open",
          })
          .select()
          .single();

        if (closingError) throw closingError;

        const items = group.dispatches.map((d: any) => ({
          closing_id: closing.id,
          service_request_id: d.service_requests.id,
          provider_cost: Number(d.final_amount || d.quoted_amount || d.service_requests?.provider_cost || 0),
        }));

        const { error: itemsError } = await supabase
          .from("financial_closing_items")
          .insert(items);
        if (itemsError) throw itemsError;

        const srIds = group.dispatches.map((d: any) => d.service_requests.id);
        const { error: updateError } = await supabase
          .from("service_requests")
          .update({ financial_status: "closing_included" })
          .in("id", srIds);
        if (updateError) throw updateError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial-closings"] });
      queryClient.invalidateQueries({ queryKey: ["all-pending-term"] });
      toast({ title: "Fechamento(s) criado(s) com sucesso!" });
      setShowConfirmBulk(false);
      setSelectedProviders(new Set());
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: any = { status };
      if (status === "closed") updates.closed_at = new Date().toISOString();
      if (status === "paid") updates.paid_at = new Date().toISOString();
      const { error } = await supabase.from("financial_closings").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial-closings"] });
      toast({ title: "Status atualizado!" });
    },
  });

  const getDueDate = (closing: any) => {
    const dueDate = new Date(closing.period_end);
    dueDate.setDate(dueDate.getDate() + 30);
    return dueDate;
  };

  const filtered = closings.filter((c: any) => {
    const q = search.toLowerCase();
    const providerName = c.providers?.name ?? "";
    if (!providerName.toLowerCase().includes(q)) return false;
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (providerFilter !== "all" && c.providers?.id !== providerFilter) return false;
    if (dueDateFilter === "overdue") {
      if (c.status === "paid") return false;
      return new Date() > getDueDate(c);
    }
    if (dueDateFilter === "due_soon") {
      if (c.status === "paid") return false;
      const remaining = Math.ceil((getDueDate(c).getTime() - new Date().getTime()) / 86400000);
      return remaining >= 0 && remaining <= 7;
    }
    if (dueDateFilter === "on_time") {
      if (c.status === "paid") return true;
      const remaining = Math.ceil((getDueDate(c).getTime() - new Date().getTime()) / 86400000);
      return remaining > 7;
    }
    return true;
  });

  const openCount = closings.filter((c: any) => c.status === "open").length;
  const paidCount = closings.filter((c: any) => c.status === "paid").length;
  const overdueCount = closings.filter((c: any) => {
    if (c.status === "paid") return false;
    const dueDate = new Date(c.period_end);
    dueDate.setDate(dueDate.getDate() + 30);
    return new Date() > dueDate;
  }).length;
  const totalValue = closings.reduce((sum: number, c: any) => sum + Number(c.total_provider_cost), 0);

  const statusVariant = (status: string) => {
    if (status === "paid") return "default" as const;
    if (status === "closed") return "secondary" as const;
    return "outline" as const;
  };

  const toggleProvider = (pid: string) => {
    setSelectedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid); else next.add(pid);
      return next;
    });
  };

  const selectAllProviders = () => {
    if (selectedProviders.size === filteredPendingByProvider.length) {
      setSelectedProviders(new Set());
    } else {
      setSelectedProviders(new Set(filteredPendingByProvider.map((g) => g.provider_id)));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fechamento Financeiro</h1>
          <p className="text-sm text-muted-foreground">Controle de pagamentos a prestadores</p>
        </div>
      </div>

      {overdueCount > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>{overdueCount}</strong> fechamento{overdueCount !== 1 ? "s" : ""} com pagamento vencido.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <ListChecks className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pendentes</p>
              <p className="text-2xl font-bold">{allPendingTerm.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Abertos</p>
              <p className="text-2xl font-bold">{openCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={overdueCount > 0 ? "border-destructive/50" : ""}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Vencidos</p>
              <p className="text-2xl font-bold text-destructive">{overdueCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pagos</p>
              <p className="text-2xl font-bold">{paidCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Valor Total</p>
              <p className="text-xl font-bold">{formatCurrency(totalValue)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending" className="gap-1">
            <ListChecks className="h-4 w-4" />
            Pendentes
            {allPendingTerm.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{allPendingTerm.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="closings">Fechamentos</TabsTrigger>
          <TabsTrigger value="cash" className="gap-1">
            <Banknote className="h-4 w-4" />
            À Vista
            {allCashPayments.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{allCashPayments.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ===== PENDENTES TAB ===== */}
        <TabsContent value="pending">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <Select value={pendingProviderFilter} onValueChange={setPendingProviderFilter}>
                <SelectTrigger className="w-full sm:w-72"><SelectValue placeholder="Filtrar por prestador" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os prestadores</SelectItem>
                  {pendingByProvider.map((g) => (
                    <SelectItem key={g.provider_id} value={g.provider_id}>
                      {g.provider_name} ({g.dispatches.length})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex gap-2">
                {selectedProviders.size > 0 && (
                  <Button
                    className="gap-2"
                    onClick={() => { setBulkTarget("selected"); setShowConfirmBulk(true); }}
                  >
                    <FileCheck className="h-4 w-4" />
                    Fechar {selectedProviders.size} prestador{selectedProviders.size > 1 ? "es" : ""}
                  </Button>
                )}
                {filteredPendingByProvider.length > 0 && (
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => { setBulkTarget("all"); setShowConfirmBulk(true); }}
                  >
                    <Plus className="h-4 w-4" />
                    Fechar Todos
                  </Button>
                )}
              </div>
            </div>

            {/* Summary bar */}
            <div className="flex items-center gap-6 p-3 rounded-lg bg-muted/40 border text-sm">
              <span><strong>{filteredPending.length}</strong> atendimentos pendentes</span>
              <span><strong>{filteredPendingByProvider.length}</strong> prestadores</span>
              <span className="font-semibold">{formatCurrency(pendingTotal)}</span>
            </div>

            {pendingLoading ? (
              <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
              </div>
            ) : filteredPendingByProvider.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">Nenhum atendimento a prazo pendente nos últimos 30 dias.</div>
            ) : (
              <div className="space-y-4">
                {filteredPendingByProvider.map((group) => (
                  <Card key={group.provider_id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={selectedProviders.has(group.provider_id)}
                            onCheckedChange={() => toggleProvider(group.provider_id)}
                          />
                          <CardTitle className="text-base">{group.provider_name}</CardTitle>
                          <Badge variant="outline">{group.dispatches.length} atendimento{group.dispatches.length > 1 ? "s" : ""}</Badge>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold">{formatCurrency(group.total)}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => {
                              setSelectedProviders(new Set([group.provider_id]));
                              setBulkTarget("selected");
                              setShowConfirmBulk(true);
                            }}
                          >
                            <FileCheck className="h-3.5 w-3.5" />
                            Fechar
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Protocolo</TableHead>
                            <TableHead>Beneficiário</TableHead>
                            <TableHead>Placa</TableHead>
                            <TableHead>Empresa</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Data</TableHead>
                            <TableHead>Valor</TableHead>
                            <TableHead>NF</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.dispatches.map((d: any) => {
                            const sr = d.service_requests;
                            return (
                              <TableRow key={d.id}>
                                <TableCell className="font-mono text-xs">{sr?.protocol}</TableCell>
                                <TableCell className="text-sm">{sr?.requester_name}</TableCell>
                                <TableCell className="font-mono text-xs">{sr?.vehicle_plate || "—"}</TableCell>
                                <TableCell className="text-sm">{sr?.clients?.name || "—"}</TableCell>
                                <TableCell className="text-xs">
                                  <Badge variant="outline" className="text-xs">
                                    {SERVICE_TYPE_LABELS[sr?.service_type] || sr?.service_type}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {sr?.completed_at ? format(new Date(sr.completed_at), "dd/MM/yyyy") : "—"}
                                </TableCell>
                                <TableCell className="font-medium">
                                  {formatCurrency(Number(d.final_amount || d.quoted_amount || sr?.provider_cost || 0))}
                                </TableCell>
                                <TableCell>
                                  <ProviderInvoiceReview dispatchId={d.id} />
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                        <TableFooter>
                          <TableRow>
                            <TableCell colSpan={6} className="text-right font-medium">Total</TableCell>
                            <TableCell className="font-bold">{formatCurrency(group.total)}</TableCell>
                            <TableCell />
                          </TableRow>
                        </TableFooter>
                      </Table>
                    </CardContent>
                  </Card>
                ))}

                {/* Select all bar */}
                <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                  <Checkbox
                    checked={selectedProviders.size === filteredPendingByProvider.length && filteredPendingByProvider.length > 0}
                    onCheckedChange={selectAllProviders}
                  />
                  <span className="text-sm text-muted-foreground">Selecionar todos os prestadores</span>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ===== FECHAMENTOS TAB ===== */}
        <TabsContent value="closings">
          <div className="space-y-4">
            <div className="flex flex-col gap-3">
              <div className="relative w-full sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por prestador..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Select value={providerFilter} onValueChange={setProviderFilter}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Prestador" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os prestadores</SelectItem>
                    {providers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="open">Aberto</SelectItem>
                    <SelectItem value="closed">Fechado</SelectItem>
                    <SelectItem value="paid">Pago</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={dueDateFilter} onValueChange={setDueDateFilter}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Vencimento" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="overdue">Vencidos</SelectItem>
                    <SelectItem value="due_soon">Vence em 7 dias</SelectItem>
                    <SelectItem value="on_time">Em dia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-8 text-center text-muted-foreground">Carregando...</div>
                ) : filtered.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">Nenhum fechamento encontrado.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Prestador</TableHead>
                        <TableHead>Período</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Serviços</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((closing: any) => (
                        <TableRow key={closing.id}>
                          <TableCell className="font-medium">{closing.providers?.name ?? "—"}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {format(new Date(closing.period_start), "dd/MM/yyyy")} - {format(new Date(closing.period_end), "dd/MM/yyyy")}
                          </TableCell>
                          <TableCell className="text-sm">
                            {(() => {
                              const dueDate = getDueDate(closing);
                              const now = new Date();
                              const isPaid = closing.status === "paid";
                              if (isPaid) return <span className="text-muted-foreground">{format(dueDate, "dd/MM/yyyy")}</span>;
                              if (now > dueDate) {
                                const overdueDays = Math.floor((now.getTime() - dueDate.getTime()) / 86400000);
                                return (
                                  <span className="flex items-center gap-1 text-destructive font-medium">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    {format(dueDate, "dd/MM/yyyy")} ({overdueDays}d atraso)
                                  </span>
                                );
                              }
                              const remaining = Math.ceil((dueDate.getTime() - now.getTime()) / 86400000);
                              if (remaining <= 7) {
                                return (
                                  <span className="flex items-center gap-1 text-amber-600 font-medium">
                                    <Clock className="h-3.5 w-3.5" />
                                    {format(dueDate, "dd/MM/yyyy")} ({remaining}d)
                                  </span>
                                );
                              }
                              return <span>{format(dueDate, "dd/MM/yyyy")}</span>;
                            })()}
                          </TableCell>
                          <TableCell>{closing.total_services}</TableCell>
                          <TableCell className="font-medium">{formatCurrency(closing.total_provider_cost)}</TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(closing.status)}>
                              {CLOSING_STATUS_LABELS[closing.status] || closing.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" className="gap-1" onClick={async () => {
                                const { data: items } = await supabase
                                  .from("financial_closing_items")
                                  .select("service_request_id, provider_cost, service_requests (protocol, requester_name, vehicle_plate, vehicle_model, service_type, completed_at, origin_address, destination_address, estimated_km, beneficiary_id)")
                                  .eq("closing_id", closing.id);
                                const beneficiaryIds = [...new Set((items || []).map((it: any) => it.service_requests?.beneficiary_id).filter(Boolean))];
                                const beneficiaryCoopMap: Record<string, string> = {};
                                if (beneficiaryIds.length > 0) {
                                  const { data: benefs } = await supabase.from("beneficiaries").select("id, cooperativa").in("id", beneficiaryIds);
                                  (benefs || []).forEach((b: any) => { beneficiaryCoopMap[b.id] = b.cooperativa || "Sem Cooperativa"; });
                                }
                                const mappedItems = (items || []).map((it: any) => ({
                                  protocol: it.service_requests?.protocol || "",
                                  date: it.service_requests?.completed_at ? format(new Date(it.service_requests.completed_at), "dd/MM/yyyy") : "",
                                  requesterName: it.service_requests?.requester_name || "",
                                  vehiclePlate: it.service_requests?.vehicle_plate || "",
                                  vehicleModel: it.service_requests?.vehicle_model || "",
                                  serviceType: SERVICE_TYPE_LABELS[it.service_requests?.service_type] || it.service_requests?.service_type || "",
                                  chargedAmount: Number(it.provider_cost || 0),
                                  originAddress: it.service_requests?.origin_address || "",
                                  destinationAddress: it.service_requests?.destination_address || "",
                                  estimatedKm: it.service_requests?.estimated_km ?? null,
                                  cooperativa: beneficiaryCoopMap[it.service_requests?.beneficiary_id] || "Sem Cooperativa",
                                }));
                                const coopGroupMap = new Map<string, { items: typeof mappedItems }>();
                                mappedItems.forEach((item) => {
                                  const coop = item.cooperativa;
                                  if (!coopGroupMap.has(coop)) coopGroupMap.set(coop, { items: [] });
                                  coopGroupMap.get(coop)!.items.push(item);
                                });
                                const cooperativaGroups = Array.from(coopGroupMap.entries())
                                  .map(([cooperativa, data]) => ({ cooperativa, plates: 0, plateValue: 0, items: data.items, totalCharged: data.items.reduce((s, it) => s + it.chargedAmount, 0) }))
                                  .sort((a, b) => a.cooperativa.localeCompare(b.cooperativa));
                                generateFinancialPdf({
                                  providerName: closing.providers?.name || "", periodStart: closing.period_start, periodEnd: closing.period_end,
                                  items: mappedItems, totalServices: closing.total_services, totalCharged: Number(closing.total_provider_cost),
                                  totalProviderCost: Number(closing.total_provider_cost), markupAmount: 0, clientName: closing.providers?.name || "",
                                  notes: closing.notes || undefined, type: "closing",
                                  cooperativaGroups: cooperativaGroups.length > 1 ? cooperativaGroups : undefined,
                                });
                              }}>
                                <Download className="h-3 w-3" /> PDF
                              </Button>
                              {closing.status === "open" && (
                                <Button size="sm" variant="outline" onClick={() => updateStatusMutation.mutate({ id: closing.id, status: "closed" })}>Fechar</Button>
                              )}
                              {closing.status === "closed" && (
                                <Button size="sm" variant="outline" onClick={() => updateStatusMutation.mutate({ id: closing.id, status: "paid" })}>Marcar Pago</Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ===== CASH TAB ===== */}
        <TabsContent value="cash">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Banknote className="h-5 w-5" />
                Pagamentos à Vista
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {allCashPayments.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">Nenhum pagamento à vista encontrado.</div>
              ) : (
                <>
                  <div className="p-4 border-b bg-muted/30">
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-muted-foreground">Total: <strong>{allCashPayments.length}</strong> atendimentos</span>
                      <span className="text-sm font-semibold">
                        {formatCurrency(allCashPayments.reduce((s: number, d: any) => s + Number(d.final_amount || d.quoted_amount || d.service_requests?.provider_cost || 0), 0))}
                      </span>
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Protocolo</TableHead>
                        <TableHead>Prestador</TableHead>
                        <TableHead>Beneficiário</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>NF</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allCashPayments.map((d: any) => {
                        const sr = d.service_requests;
                        return (
                          <TableRow key={d.id}>
                            <TableCell className="font-mono text-xs">{sr?.protocol}</TableCell>
                            <TableCell>{(d.providers as any)?.name || "—"}</TableCell>
                            <TableCell>{sr?.requester_name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {sr?.completed_at ? format(new Date(sr.completed_at), "dd/MM/yyyy") : "—"}
                            </TableCell>
                            <TableCell className="font-medium">
                              {formatCurrency(Number(d.final_amount || d.quoted_amount || sr?.provider_cost || 0))}
                            </TableCell>
                            <TableCell>
                              <ProviderInvoiceReview dispatchId={d.id} />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Bulk Closing Confirm Dialog */}
      <Dialog open={showConfirmBulk} onOpenChange={setShowConfirmBulk}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirmar Fechamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {(() => {
              const targetIds = bulkTarget === "all"
                ? filteredPendingByProvider.map((g) => g.provider_id)
                : Array.from(selectedProviders);
              const targetGroups = pendingByProvider.filter((g) => targetIds.includes(g.provider_id));
              const totalDispatches = targetGroups.reduce((s, g) => s + g.dispatches.length, 0);
              const totalAmount = targetGroups.reduce((s, g) => s + g.total, 0);
              return (
                <>
                  <p className="text-sm">
                    Serão criados <strong>{targetGroups.length}</strong> fechamento{targetGroups.length > 1 ? "s" : ""} com
                    um total de <strong>{totalDispatches}</strong> atendimentos e valor de <strong>{formatCurrency(totalAmount)}</strong>.
                  </p>
                  <div className="max-h-60 overflow-auto space-y-1 border rounded-lg p-3">
                    {targetGroups.map((g) => (
                      <div key={g.provider_id} className="flex justify-between text-sm border-b py-1.5 last:border-0">
                        <span>{g.provider_name} <span className="text-muted-foreground">({g.dispatches.length} atd.)</span></span>
                        <span className="font-mono font-medium">{formatCurrency(g.total)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Período: últimos 30 dias até hoje</p>
                </>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmBulk(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                const targetIds = bulkTarget === "all"
                  ? filteredPendingByProvider.map((g) => g.provider_id)
                  : Array.from(selectedProviders);
                bulkClosingMutation.mutate(targetIds);
              }}
              disabled={bulkClosingMutation.isPending}
            >
              {bulkClosingMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Processando...</>
              ) : "Confirmar Fechamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

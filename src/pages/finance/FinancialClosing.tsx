import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Search, Plus, FileCheck, DollarSign, Clock, CheckCircle, Download, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  useTenantId, useFinancialClosings, useProviders,
  CLOSING_STATUS_LABELS, SERVICE_TYPE_LABELS, formatCurrency,
} from "@/hooks/useFinancialData";
import { format } from "date-fns";
import { generateFinancialPdf } from "@/lib/generateFinancialPdf";

export default function FinancialClosing() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [dueDateFilter, setDueDateFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [newClosing, setNewClosing] = useState({
    provider_id: "",
    period_start: "",
    period_end: "",
  });

  const { data: tenantId } = useTenantId();
  const { data: closings = [], isLoading } = useFinancialClosings(tenantId);
  const { data: providers = [] } = useProviders(tenantId);

  // Get completed service requests with dispatches for selected provider
  const { data: providerRequests = [] } = useQuery({
    queryKey: ["provider-closing-requests", tenantId, newClosing.provider_id, newClosing.period_start, newClosing.period_end],
    queryFn: async () => {
      if (!newClosing.provider_id || !newClosing.period_start || !newClosing.period_end) return [];
      
      // Get dispatches for this provider in the period
      const { data: dispatches, error } = await supabase
        .from("dispatches")
        .select(`
          id, final_amount, quoted_amount, provider_id,
            service_requests!inner (
            id, protocol, requester_name, vehicle_plate, service_type,
            provider_cost, completed_at, financial_status, tenant_id, status,
            payment_method, payment_term
          )
        `)
        .eq("provider_id", newClosing.provider_id)
        .eq("status", "completed");

      if (error) throw error;
      
      // Filter by period and tenant
      return (dispatches ?? []).filter((d: any) => {
        const sr = d.service_requests;
        if (!sr || sr.tenant_id !== tenantId) return false;
        if (sr.status !== "completed") return false;
        if (sr.financial_status !== "pending") return false;
        const completedAt = sr.completed_at ? new Date(sr.completed_at) : null;
        if (!completedAt) return false;
        return completedAt >= new Date(newClosing.period_start) && completedAt <= new Date(newClosing.period_end + "T23:59:59");
      });
    },
    enabled: !!tenantId && !!newClosing.provider_id && !!newClosing.period_start && !!newClosing.period_end,
  });

  const createClosingMutation = useMutation({
    mutationFn: async () => {
      if (providerRequests.length === 0) throw new Error("Nenhum atendimento encontrado no período.");

      const totalCost = providerRequests.reduce((sum: number, d: any) => {
        return sum + Number(d.final_amount || d.quoted_amount || d.service_requests?.provider_cost || 0);
      }, 0);

      const { data: closing, error: closingError } = await supabase
        .from("financial_closings")
        .insert({
          tenant_id: tenantId!,
          provider_id: newClosing.provider_id,
          period_start: newClosing.period_start,
          period_end: newClosing.period_end,
          total_services: providerRequests.length,
          total_provider_cost: totalCost,
          status: "open",
        })
        .select()
        .single();

      if (closingError) throw closingError;

      // Insert closing items
      const items = providerRequests.map((d: any) => ({
        closing_id: closing.id,
        service_request_id: d.service_requests.id,
        provider_cost: Number(d.final_amount || d.quoted_amount || d.service_requests?.provider_cost || 0),
      }));

      const { error: itemsError } = await supabase
        .from("financial_closing_items")
        .insert(items);

      if (itemsError) throw itemsError;

      // Update financial_status on service_requests
      const srIds = providerRequests.map((d: any) => d.service_requests.id);
      const { error: updateError } = await supabase
        .from("service_requests")
        .update({ financial_status: "closing_included" })
        .in("id", srIds);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial-closings"] });
      queryClient.invalidateQueries({ queryKey: ["provider-closing-requests"] });
      toast({ title: "Fechamento criado com sucesso!" });
      setShowCreate(false);
      setNewClosing({ provider_id: "", period_start: "", period_end: "" });
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

      const { error } = await supabase
        .from("financial_closings")
        .update(updates)
        .eq("id", id);
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
      const dueDate = getDueDate(c);
      const remaining = Math.ceil((dueDate.getTime() - new Date().getTime()) / 86400000);
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
  const closedCount = closings.filter((c: any) => c.status === "closed").length;
  const paidCount = closings.filter((c: any) => c.status === "paid").length;
  const overdueCount = closings.filter((c: any) => {
    if (c.status === "paid") return false;
    const dueDate = new Date(c.period_end);
    dueDate.setDate(dueDate.getDate() + 30); // 30 days after period end
    return new Date() > dueDate;
  }).length;
  const totalValue = closings.reduce((sum: number, c: any) => sum + Number(c.total_provider_cost), 0);

  const statusVariant = (status: string) => {
    if (status === "paid") return "default" as const;
    if (status === "closed") return "secondary" as const;
    return "outline" as const;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fechamento Financeiro</h1>
          <p className="text-sm text-muted-foreground">Controle de pagamentos a prestadores</p>
        </div>
        <Button className="gap-2" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          Novo Fechamento
        </Button>
      </div>

      {overdueCount > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>{overdueCount}</strong> fechamento{overdueCount !== 1 ? "s" : ""} com pagamento vencido (mais de 30 dias após o fim do período sem registro de pagamento).
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{closings.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-10 w-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-yellow-600" />
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
            <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-600" />
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
                        if (isPaid) {
                          return <span className="text-muted-foreground">{format(dueDate, "dd/MM/yyyy")}</span>;
                        }
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
                            <span className="flex items-center gap-1 text-yellow-600 font-medium">
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
                      <div className="flex items-center gap-2">
                        <Badge variant={statusVariant(closing.status)}>
                          {CLOSING_STATUS_LABELS[closing.status] || closing.status}
                        </Badge>
                        {closing.status !== "paid" && (() => {
                          const dueDate = new Date(closing.period_end);
                          dueDate.setDate(dueDate.getDate() + 30);
                          const now = new Date();
                          if (now > dueDate) {
                            const overdueDays = Math.floor((now.getTime() - dueDate.getTime()) / 86400000);
                            return (
                              <span className="flex items-center gap-1 text-destructive text-xs font-medium" title={`Vencido há ${overdueDays} dias`}>
                                <AlertTriangle className="h-3.5 w-3.5" /> {overdueDays}d
                              </span>
                            );
                          }
                          const remaining = Math.ceil((dueDate.getTime() - now.getTime()) / 86400000);
                          if (remaining <= 7) {
                            return (
                              <span className="flex items-center gap-1 text-yellow-600 text-xs font-medium" title={`Vence em ${remaining} dias`}>
                                <Clock className="h-3.5 w-3.5" /> {remaining}d
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="gap-1" onClick={async () => {
                          // Fetch closing items
                          const { data: items } = await supabase
                            .from("financial_closing_items")
                            .select("service_request_id, provider_cost, service_requests (protocol, requester_name, vehicle_plate, service_type, completed_at)")
                            .eq("closing_id", closing.id);
                          generateFinancialPdf({
                            providerName: closing.providers?.name || "",
                            periodStart: closing.period_start,
                            periodEnd: closing.period_end,
                            items: (items || []).map((it: any) => ({
                              protocol: it.service_requests?.protocol || "",
                              date: it.service_requests?.completed_at ? format(new Date(it.service_requests.completed_at), "dd/MM/yyyy") : "",
                              requesterName: it.service_requests?.requester_name || "",
                              vehiclePlate: it.service_requests?.vehicle_plate || "",
                              serviceType: SERVICE_TYPE_LABELS[it.service_requests?.service_type] || it.service_requests?.service_type || "",
                              chargedAmount: Number(it.provider_cost || 0),
                            })),
                            totalServices: closing.total_services,
                            totalCharged: Number(closing.total_provider_cost),
                            totalProviderCost: Number(closing.total_provider_cost),
                            markupAmount: 0,
                            clientName: closing.providers?.name || "",
                            notes: closing.notes || undefined,
                            type: "closing",
                          });
                        }}>
                          <Download className="h-3 w-3" /> PDF
                        </Button>
                        {closing.status === "open" && (
                          <Button size="sm" variant="outline" onClick={() => updateStatusMutation.mutate({ id: closing.id, status: "closed" })}>
                            Fechar
                          </Button>
                        )}
                        {closing.status === "closed" && (
                          <Button size="sm" variant="outline" onClick={() => updateStatusMutation.mutate({ id: closing.id, status: "paid" })}>
                            Marcar Pago
                          </Button>
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

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Fechamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Prestador</Label>
              <Select value={newClosing.provider_id} onValueChange={(v) => setNewClosing(prev => ({ ...prev, provider_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o prestador" /></SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Início do período</Label>
                <Input type="date" value={newClosing.period_start} onChange={(e) => setNewClosing(prev => ({ ...prev, period_start: e.target.value }))} />
              </div>
              <div>
                <Label>Fim do período</Label>
                <Input type="date" value={newClosing.period_end} onChange={(e) => setNewClosing(prev => ({ ...prev, period_end: e.target.value }))} />
              </div>
            </div>

            {providerRequests.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Resumo</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  <p>Atendimentos encontrados: <strong>{providerRequests.length}</strong></p>
                  <p>Valor total: <strong>{formatCurrency(providerRequests.reduce((sum: number, d: any) => sum + Number(d.final_amount || d.quoted_amount || d.service_requests?.provider_cost || 0), 0))}</strong></p>
                  {(() => {
                    const methods = providerRequests.reduce((acc: Record<string, number>, d: any) => {
                      const m = d.service_requests?.payment_method || "undefined";
                      acc[m] = (acc[m] || 0) + 1;
                      return acc;
                    }, {});
                    const labels: Record<string, string> = { cash: "À Vista", invoiced: "Faturado", undefined: "Sem definição" };
                    return (
                      <div className="flex gap-2 flex-wrap mt-1">
                        {Object.entries(methods).map(([k, v]) => (
                          <Badge key={k} variant="outline" className="text-xs">{labels[k] || k}: {v}</Badge>
                        ))}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            )}

            {newClosing.provider_id && newClosing.period_start && newClosing.period_end && providerRequests.length === 0 && (
              <p className="text-sm text-muted-foreground text-center">Nenhum atendimento pendente encontrado para este período.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={() => createClosingMutation.mutate()} disabled={providerRequests.length === 0 || createClosingMutation.isPending}>
              {createClosingMutation.isPending ? "Criando..." : "Criar Fechamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

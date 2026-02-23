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
import { Separator } from "@/components/ui/separator";
import { Search, Plus, Receipt, DollarSign, Clock, CheckCircle, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useTenantId, useInvoices, useClients,
  INVOICE_STATUS_LABELS, SERVICE_TYPE_LABELS, formatCurrency,
} from "@/hooks/useFinancialData";
import { format } from "date-fns";
import { generateFinancialPdf } from "@/lib/generateFinancialPdf";

export default function Billing() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newInvoice, setNewInvoice] = useState({
    client_id: "",
    period_start: "",
    period_end: "",
    due_date: "",
  });

  const { data: tenantId } = useTenantId();
  const { data: invoices = [], isLoading } = useInvoices(tenantId);
  const { data: clients = [] } = useClients(tenantId);

  // Get selected client's billing model
  const selectedClient = clients.find((c) => c.id === newInvoice.client_id);
  const billingModel = (selectedClient as any)?.billing_model || "plate_plus_service";

  // Get completed service requests for selected client in period
  const { data: clientRequests = [] } = useQuery({
    queryKey: ["client-billing-requests", tenantId, newInvoice.client_id, newInvoice.period_start, newInvoice.period_end],
    queryFn: async () => {
      if (!newInvoice.client_id || !newInvoice.period_start || !newInvoice.period_end) return [];
      
      const { data, error } = await supabase
        .from("service_requests")
        .select("id, protocol, requester_name, vehicle_plate, service_type, provider_cost, charged_amount, completed_at, financial_status")
        .eq("tenant_id", tenantId!)
        .eq("client_id", newInvoice.client_id)
        .eq("status", "completed")
        .gte("completed_at", newInvoice.period_start)
        .lte("completed_at", newInvoice.period_end + "T23:59:59");

      if (error) throw error;
      return (data ?? []).filter((sr: any) => sr.financial_status === "pending" || sr.financial_status === "closing_included");
    },
    enabled: !!tenantId && !!newInvoice.client_id && !!newInvoice.period_start && !!newInvoice.period_end,
  });

  // Count active plates (beneficiaries) for selected client
  const { data: activePlates = [] } = useQuery({
    queryKey: ["client-active-plates", newInvoice.client_id, newInvoice.period_start, newInvoice.period_end],
    queryFn: async () => {
      // Fetch all beneficiaries that are currently active OR were created before period end
      const { data, error } = await supabase
        .from("beneficiaries")
        .select("id, name, vehicle_plate, plan_id")
        .eq("client_id", newInvoice.client_id)
        .lte("created_at", newInvoice.period_end + "T23:59:59");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!newInvoice.client_id && !!newInvoice.period_start && !!newInvoice.period_end,
  });

  // Get plans with plate_fee for selected client
  const { data: clientPlans = [] } = useQuery({
    queryKey: ["client-plans-fees", newInvoice.client_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("id, name, plate_fee")
        .eq("client_id", newInvoice.client_id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!newInvoice.client_id,
  });

  // Calculate plate totals
  const plateFeeByPlan = Object.fromEntries(clientPlans.map((p: any) => [p.id, Number(p.plate_fee || 0)]));
  const totalPlateValue = activePlates.reduce((sum, b: any) => {
    const fee = b.plan_id ? (plateFeeByPlan[b.plan_id] || 0) : 0;
    return sum + fee;
  }, 0);
  const totalPlates = activePlates.length;

  const createInvoiceMutation = useMutation({
    mutationFn: async () => {
      const hasPlates = totalPlates > 0;
      const hasRequests = clientRequests.length > 0;

      if (!hasPlates && !hasRequests) throw new Error("Nenhuma placa ou atendimento encontrado no período.");

      const serviceCharged = billingModel === "plate_only"
        ? 0
        : clientRequests.reduce((sum: number, sr: any) => sum + Number(sr.charged_amount || 0), 0);
      const totalProviderCost = clientRequests.reduce((sum: number, sr: any) => sum + Number(sr.provider_cost || 0), 0);
      const totalCharged = totalPlateValue + serviceCharged;
      const markup = totalCharged - totalProviderCost;

      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .insert({
          tenant_id: tenantId!,
          client_id: newInvoice.client_id,
          period_start: newInvoice.period_start,
          period_end: newInvoice.period_end,
          total_services: clientRequests.length,
          total_charged: totalCharged,
          total_provider_cost: totalProviderCost,
          markup_amount: markup,
          due_date: newInvoice.due_date || null,
          status: "draft",
          notes: `Placas: ${totalPlates} (${formatCurrency(totalPlateValue)})${billingModel === "plate_only" ? " | Modelo: Somente Placa" : ""}`,
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Insert invoice items for service requests
      if (clientRequests.length > 0 && billingModel === "plate_plus_service") {
        const items = clientRequests.map((sr: any) => ({
          invoice_id: invoice.id,
          service_request_id: sr.id,
          charged_amount: Number(sr.charged_amount || 0),
          provider_cost: Number(sr.provider_cost || 0),
        }));

        const { error: itemsError } = await supabase.from("invoice_items").insert(items);
        if (itemsError) throw itemsError;
      }

      // Update financial_status
      if (clientRequests.length > 0) {
        const srIds = clientRequests.map((sr: any) => sr.id);
        const { error: updateError } = await supabase
          .from("service_requests")
          .update({ financial_status: "invoice_included" })
          .in("id", srIds);
        if (updateError) throw updateError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["client-billing-requests"] });
      toast({ title: "Fatura criada com sucesso!" });
      setShowCreate(false);
      setNewInvoice({ client_id: "", period_start: "", period_end: "", due_date: "" });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: any = { status };
      if (status === "sent") updates.sent_at = new Date().toISOString();
      if (status === "paid") updates.paid_at = new Date().toISOString();

      const { error } = await supabase.from("invoices").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "Status atualizado!" });
    },
  });

  const filtered = invoices.filter((inv: any) => {
    const q = search.toLowerCase();
    return (inv.clients?.name ?? "").toLowerCase().includes(q);
  });

  const draftCount = invoices.filter((i: any) => i.status === "draft").length;
  const sentCount = invoices.filter((i: any) => i.status === "sent").length;
  const paidCount = invoices.filter((i: any) => i.status === "paid").length;
  const totalCharged = invoices.reduce((sum: number, i: any) => sum + Number(i.total_charged), 0);

  const statusVariant = (status: string) => {
    if (status === "paid") return "default" as const;
    if (status === "sent") return "secondary" as const;
    if (status === "overdue") return "destructive" as const;
    return "outline" as const;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Faturamento</h1>
          <p className="text-sm text-muted-foreground">Faturas para clientes</p>
        </div>
        <Button className="gap-2" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          Nova Fatura
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Faturas</p>
              <p className="text-2xl font-bold">{invoices.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-10 w-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Rascunhos</p>
              <p className="text-2xl font-bold">{draftCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pagas</p>
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
              <p className="text-sm text-muted-foreground">Faturado</p>
              <p className="text-xl font-bold">{formatCurrency(totalCharged)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nenhuma fatura encontrada.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Serviços</TableHead>
                  <TableHead>Valor Faturado</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((inv: any) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.clients?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(inv.period_start), "dd/MM/yyyy")} - {format(new Date(inv.period_end), "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell>{inv.total_services}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(inv.total_charged)}</TableCell>
                    <TableCell className="text-sm">{inv.due_date ? format(new Date(inv.due_date), "dd/MM/yyyy") : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(inv.status)}>
                        {INVOICE_STATUS_LABELS[inv.status] || inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="gap-1" onClick={async () => {
                          // Fetch invoice items
                          const { data: items } = await supabase
                            .from("invoice_items")
                            .select("service_request_id, charged_amount, provider_cost, service_requests (protocol, requester_name, vehicle_plate, service_type, completed_at)")
                            .eq("invoice_id", inv.id);
                          generateFinancialPdf({
                            clientName: inv.clients?.name || "",
                            billingModel: inv.notes?.includes("Somente Placa") ? "plate_only" : "plate_plus_service",
                            periodStart: inv.period_start,
                            periodEnd: inv.period_end,
                            dueDate: inv.due_date,
                            totalPlates: parseInt(inv.notes?.match(/Placas: (\d+)/)?.[1] || "0"),
                            totalPlateValue: parseFloat(inv.notes?.match(/R\$\s?([\d.,]+)/)?.[1]?.replace(".", "").replace(",", ".") || "0"),
                            items: (items || []).map((it: any) => ({
                              protocol: it.service_requests?.protocol || "",
                              date: it.service_requests?.completed_at ? format(new Date(it.service_requests.completed_at), "dd/MM/yyyy") : "",
                              requesterName: it.service_requests?.requester_name || "",
                              vehiclePlate: it.service_requests?.vehicle_plate || "",
                              serviceType: SERVICE_TYPE_LABELS[it.service_requests?.service_type] || it.service_requests?.service_type || "",
                              chargedAmount: Number(it.charged_amount || 0),
                            })),
                            totalServices: inv.total_services,
                            totalCharged: Number(inv.total_charged),
                            totalProviderCost: Number(inv.total_provider_cost),
                            markupAmount: Number(inv.markup_amount),
                            notes: inv.notes || undefined,
                            type: "invoice",
                          });
                        }}>
                          <Download className="h-3 w-3" /> PDF
                        </Button>
                        {inv.status === "draft" && (
                          <Button size="sm" variant="outline" onClick={() => updateStatusMutation.mutate({ id: inv.id, status: "sent" })}>
                            Enviar
                          </Button>
                        )}
                        {inv.status === "sent" && (
                          <Button size="sm" variant="outline" onClick={() => updateStatusMutation.mutate({ id: inv.id, status: "paid" })}>
                            Marcar Paga
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

      {/* Create Invoice Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Fatura</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Cliente</Label>
              <Select value={newInvoice.client_id} onValueChange={(v) => setNewInvoice(prev => ({ ...prev, client_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedClient && (
                <p className="text-xs text-muted-foreground mt-1">
                  Modelo: <strong>{billingModel === "plate_only" ? "Somente Placa" : "Placa + Serviço"}</strong>
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Início do período</Label>
                <Input type="date" value={newInvoice.period_start} onChange={(e) => setNewInvoice(prev => ({ ...prev, period_start: e.target.value }))} />
              </div>
              <div>
                <Label>Fim do período</Label>
                <Input type="date" value={newInvoice.period_end} onChange={(e) => setNewInvoice(prev => ({ ...prev, period_end: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Vencimento</Label>
              <Input type="date" value={newInvoice.due_date} onChange={(e) => setNewInvoice(prev => ({ ...prev, due_date: e.target.value }))} />
            </div>

            {newInvoice.client_id && newInvoice.period_start && newInvoice.period_end && (totalPlates > 0 || clientRequests.length > 0) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Resumo da Fatura</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  {/* Plate section */}
                  <div className="space-y-1">
                    <p className="font-medium text-muted-foreground">Placas</p>
                    <p>Placas no período: <strong>{totalPlates}</strong></p>
                    <p>Valor total placas: <strong>{formatCurrency(totalPlateValue)}</strong></p>
                  </div>

                  <Separator />

                  {/* Service section */}
                   <div className="space-y-1">
                    <p className="font-medium text-muted-foreground">Serviços</p>
                    <p>Atendimentos: <strong>{clientRequests.length}</strong></p>
                    {billingModel === "plate_plus_service" ? (
                      <p>Valor serviços: <strong>{formatCurrency(clientRequests.reduce((s: number, r: any) => s + Number(r.charged_amount || 0), 0))}</strong></p>
                    ) : (
                      <p className="text-muted-foreground italic">Serviços inclusos no valor da placa</p>
                    )}
                  </div>

                  <Separator />

                  {/* Total */}
                  <div className="space-y-1 pt-1">
                    {(() => {
                      const serviceCharged = billingModel === "plate_only" ? 0 : clientRequests.reduce((s: number, r: any) => s + Number(r.charged_amount || 0), 0);
                      const total = totalPlateValue + serviceCharged;
                      return (
                        <p className="font-semibold">Total faturado: <strong>{formatCurrency(total)}</strong></p>
                      );
                    })()}
                  </div>
                </CardContent>
              </Card>
            )}

            {newInvoice.client_id && newInvoice.period_start && newInvoice.period_end && totalPlates === 0 && clientRequests.length === 0 && (
              <p className="text-sm text-muted-foreground text-center">Nenhuma placa ou atendimento encontrado para este período.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button
              onClick={() => createInvoiceMutation.mutate()}
              disabled={(totalPlates === 0 && clientRequests.length === 0) || createInvoiceMutation.isPending}
            >
              {createInvoiceMutation.isPending ? "Criando..." : "Criar Fatura"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

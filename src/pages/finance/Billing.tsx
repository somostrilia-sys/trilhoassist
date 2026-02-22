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
import { Search, Plus, Receipt, DollarSign, Clock, CheckCircle, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useTenantId, useInvoices, useClients,
  INVOICE_STATUS_LABELS, formatCurrency,
} from "@/hooks/useFinancialData";
import { format } from "date-fns";

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
      // Only include requests not yet invoiced
      return (data ?? []).filter((sr: any) => sr.financial_status === "pending" || sr.financial_status === "closing_included");
    },
    enabled: !!tenantId && !!newInvoice.client_id && !!newInvoice.period_start && !!newInvoice.period_end,
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (clientRequests.length === 0) throw new Error("Nenhum atendimento encontrado no período.");

      const totalCharged = clientRequests.reduce((sum: number, sr: any) => sum + Number(sr.charged_amount || 0), 0);
      const totalProviderCost = clientRequests.reduce((sum: number, sr: any) => sum + Number(sr.provider_cost || 0), 0);
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
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Insert invoice items
      const items = clientRequests.map((sr: any) => ({
        invoice_id: invoice.id,
        service_request_id: sr.id,
        charged_amount: Number(sr.charged_amount || 0),
        provider_cost: Number(sr.provider_cost || 0),
      }));

      const { error: itemsError } = await supabase.from("invoice_items").insert(items);
      if (itemsError) throw itemsError;

      // Update financial_status
      const srIds = clientRequests.map((sr: any) => sr.id);
      const { error: updateError } = await supabase
        .from("service_requests")
        .update({ financial_status: "invoice_included" })
        .in("id", srIds);
      if (updateError) throw updateError;
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
          <p className="text-sm text-muted-foreground">Faturas para clientes com markup</p>
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
                  <TableHead>Markup</TableHead>
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
                    <TableCell className="text-green-600 font-medium">{formatCurrency(inv.markup_amount)}</TableCell>
                    <TableCell className="text-sm">{inv.due_date ? format(new Date(inv.due_date), "dd/MM/yyyy") : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(inv.status)}>
                        {INVOICE_STATUS_LABELS[inv.status] || inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
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

            {clientRequests.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Resumo</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  <p>Atendimentos: <strong>{clientRequests.length}</strong></p>
                  <p>Custo prestadores: <strong>{formatCurrency(clientRequests.reduce((s: number, r: any) => s + Number(r.provider_cost || 0), 0))}</strong></p>
                  <p>Valor faturado: <strong>{formatCurrency(clientRequests.reduce((s: number, r: any) => s + Number(r.charged_amount || 0), 0))}</strong></p>
                  <p className="text-green-600">Markup: <strong>{formatCurrency(
                    clientRequests.reduce((s: number, r: any) => s + Number(r.charged_amount || 0), 0) -
                    clientRequests.reduce((s: number, r: any) => s + Number(r.provider_cost || 0), 0)
                  )}</strong></p>
                </CardContent>
              </Card>
            )}

            {newInvoice.client_id && newInvoice.period_start && newInvoice.period_end && clientRequests.length === 0 && (
              <p className="text-sm text-muted-foreground text-center">Nenhum atendimento pendente encontrado para este período.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={() => createInvoiceMutation.mutate()} disabled={clientRequests.length === 0 || createInvoiceMutation.isPending}>
              {createInvoiceMutation.isPending ? "Criando..." : "Criar Fatura"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

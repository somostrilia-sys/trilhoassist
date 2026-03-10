import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClientData } from "@/hooks/useClientData";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { maskCPF, maskPhone } from "@/lib/masks";
import { Plus, Search, Pencil, Save, Loader2, Upload, X, Users, Car } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface BeneficiaryForm {
  name: string;
  cpf: string;
  phone: string;
  cooperativa: string;
  vehicle_plate: string;
  vehicle_model: string;
  vehicle_year: string;
  vehicle_color: string;
  active: boolean;
}

const emptyForm: BeneficiaryForm = {
  name: "", cpf: "", phone: "", cooperativa: "",
  vehicle_plate: "", vehicle_model: "", vehicle_year: "", vehicle_color: "",
  active: true,
};

export default function ClientBeneficiaries() {
  const { clients, beneficiaries, isLoading } = useClientData();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BeneficiaryForm>(emptyForm);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const clientId = clients.length > 0 ? clients[0].id : null;

  const filtered = beneficiaries.filter((b) => {
    if (statusFilter === "active" && !b.active) return false;
    if (statusFilter === "inactive" && b.active) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      b.name?.toLowerCase().includes(q) ||
      b.vehicle_plate?.toLowerCase().includes(q) ||
      b.vehicle_model?.toLowerCase().includes(q) ||
      b.cpf?.toLowerCase().includes(q) ||
      b.phone?.toLowerCase().includes(q)
    );
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("Cliente não encontrado");
      const payload: any = {
        client_id: clientId,
        name: form.name,
        cpf: form.cpf || null,
        phone: form.phone || null,
        cooperativa: form.cooperativa || null,
        vehicle_plate: form.vehicle_plate || null,
        vehicle_model: form.vehicle_model || null,
        vehicle_year: form.vehicle_year ? Number(form.vehicle_year) : null,
        vehicle_color: form.vehicle_color || null,
        active: form.active,
      };
      if (editingId) {
        const { error } = await supabase.from("beneficiaries").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("beneficiaries").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-portal-beneficiaries"] });
      toast({ title: editingId ? "Beneficiário atualizado!" : "Beneficiário cadastrado!" });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    },
  });

  const openEdit = (b: any) => {
    setEditingId(b.id);
    setForm({
      name: b.name,
      cpf: b.cpf || "",
      phone: b.phone || "",
      cooperativa: b.cooperativa || "",
      vehicle_plate: b.vehicle_plate || "",
      vehicle_model: b.vehicle_model || "",
      vehicle_year: b.vehicle_year?.toString() || "",
      vehicle_color: b.vehicle_color || "",
      active: b.active,
    });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !clientId) return;

    const text = await file.text();
    const lines = text.split("\n").filter(l => l.trim());
    if (lines.length < 2) {
      toast({ title: "Arquivo vazio ou sem dados", variant: "destructive" });
      return;
    }

    const headers = lines[0].split(/[;,]/).map(h => h.trim().toLowerCase());
    const nameIdx = headers.findIndex(h => h.includes("nome"));
    const cpfIdx = headers.findIndex(h => h.includes("cpf"));
    const phoneIdx = headers.findIndex(h => h.includes("telefone") || h.includes("celular") || h.includes("phone"));
    const plateIdx = headers.findIndex(h => h.includes("placa") || h.includes("plate"));
    const modelIdx = headers.findIndex(h => h.includes("modelo") || h.includes("model"));
    const yearIdx = headers.findIndex(h => h.includes("ano") || h.includes("year"));
    const colorIdx = headers.findIndex(h => h.includes("cor") || h.includes("color"));
    const coopIdx = headers.findIndex(h => h.includes("cooperativa") || h.includes("filial") || h.includes("unidade"));

    if (nameIdx === -1) {
      toast({ title: "Coluna 'Nome' não encontrada no CSV", variant: "destructive" });
      return;
    }

    const rows = lines.slice(1).map(line => {
      const cols = line.split(/[;,]/).map(c => c.trim().replace(/^"|"$/g, ""));
      return {
        client_id: clientId,
        name: cols[nameIdx] || "",
        cpf: cpfIdx >= 0 ? cols[cpfIdx] || null : null,
        phone: phoneIdx >= 0 ? cols[phoneIdx] || null : null,
        vehicle_plate: plateIdx >= 0 ? cols[plateIdx]?.toUpperCase() || null : null,
        vehicle_model: modelIdx >= 0 ? cols[modelIdx] || null : null,
        vehicle_year: yearIdx >= 0 && cols[yearIdx] ? Number(cols[yearIdx]) || null : null,
        vehicle_color: colorIdx >= 0 ? cols[colorIdx] || null : null,
        cooperativa: coopIdx >= 0 ? cols[coopIdx] || null : null,
      };
    }).filter(r => r.name);

    if (rows.length === 0) {
      toast({ title: "Nenhum registro válido encontrado", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("beneficiaries").insert(rows);
    if (error) {
      toast({ title: "Erro na importação", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${rows.length} beneficiários importados com sucesso!` });
      queryClient.invalidateQueries({ queryKey: ["client-portal-beneficiaries"] });
    }
    e.target.value = "";
    setImportDialogOpen(false);
  };

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;
  }

  const activeCount = beneficiaries.filter(b => b.active).length;
  const inactiveCount = beneficiaries.filter(b => !b.active).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Beneficiários & Veículos</h1>
          <p className="text-muted-foreground">Cadastre e gerencie os beneficiários da sua associação</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportDialogOpen(true)} className="gap-1">
            <Upload className="h-4 w-4" /> Importar CSV
          </Button>
          <Button onClick={openNew} className="gap-1">
            <Plus className="h-4 w-4" /> Novo Beneficiário
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="cursor-pointer" onClick={() => setStatusFilter("all")}>
          <CardContent className="pt-6 text-center">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">{beneficiaries.length.toLocaleString("pt-BR")}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer" onClick={() => setStatusFilter("active")}>
          <CardContent className="pt-6 text-center">
            <p className="text-xs text-muted-foreground">Ativos</p>
            <p className="text-2xl font-bold text-primary">{activeCount.toLocaleString("pt-BR")}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer" onClick={() => setStatusFilter("inactive")}>
          <CardContent className="pt-6 text-center">
            <p className="text-xs text-muted-foreground">Inativos</p>
            <p className="text-2xl font-bold text-destructive">{inactiveCount.toLocaleString("pt-BR")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar nome, placa, CPF, telefone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Nome</th>
                  <th className="text-left p-3 font-medium">CPF</th>
                  <th className="text-left p-3 font-medium">Telefone</th>
                  <th className="text-left p-3 font-medium">Placa</th>
                  <th className="text-left p-3 font-medium">Modelo</th>
                  <th className="text-left p-3 font-medium">Cooperativa</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-muted-foreground">
                      Nenhum beneficiário encontrado.
                    </td>
                  </tr>
                ) : (
                  filtered.slice(0, 100).map((b) => (
                    <tr key={b.id} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-medium">{b.name}</td>
                      <td className="p-3 text-muted-foreground font-mono text-xs">{b.cpf || "—"}</td>
                      <td className="p-3 text-muted-foreground">{b.phone || "—"}</td>
                      <td className="p-3 font-mono">{b.vehicle_plate || "—"}</td>
                      <td className="p-3">{b.vehicle_model || "—"}</td>
                      <td className="p-3 text-muted-foreground">{(b as any).cooperativa || "—"}</td>
                      <td className="p-3">
                        <Badge variant={b.active ? "default" : "destructive"}>
                          {b.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(b)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* New/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {editingId ? "Editar Beneficiário" : "Novo Beneficiário"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>CPF</Label>
                <Input value={form.cpf} onChange={(e) => setForm(p => ({ ...p, cpf: maskCPF(e.target.value) }))} placeholder="000.000.000-00" />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={(e) => setForm(p => ({ ...p, phone: maskPhone(e.target.value) }))} placeholder="(00) 00000-0000" />
              </div>
              <div className="space-y-2">
                <Label>Cooperativa/Filial</Label>
                <Input value={form.cooperativa} onChange={(e) => setForm(p => ({ ...p, cooperativa: e.target.value }))} />
              </div>
            </div>
            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-3 flex items-center gap-1"><Car className="h-4 w-4" /> Veículo</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Placa</Label>
                  <Input value={form.vehicle_plate} onChange={(e) => setForm(p => ({ ...p, vehicle_plate: e.target.value.toUpperCase() }))} placeholder="ABC1D23" />
                </div>
                <div className="space-y-2">
                  <Label>Modelo</Label>
                  <Input value={form.vehicle_model} onChange={(e) => setForm(p => ({ ...p, vehicle_model: e.target.value }))} placeholder="Ex: Fiat Uno" />
                </div>
                <div className="space-y-2">
                  <Label>Ano</Label>
                  <Input type="number" value={form.vehicle_year} onChange={(e) => setForm(p => ({ ...p, vehicle_year: e.target.value }))} placeholder="2024" />
                </div>
                <div className="space-y-2">
                  <Label>Cor</Label>
                  <Input value={form.vehicle_color} onChange={(e) => setForm(p => ({ ...p, vehicle_color: e.target.value }))} placeholder="Ex: Branco" />
                </div>
              </div>
            </div>
            {editingId && (
              <div className="flex items-center gap-2">
                <Switch checked={form.active} onCheckedChange={(v) => setForm(p => ({ ...p, active: v }))} />
                <Label>{form.active ? "Ativo" : "Inativo"}</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.name || saveMutation.isPending} className="gap-1">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar Beneficiários via CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              O arquivo CSV deve conter as colunas: <strong>Nome</strong> (obrigatório), CPF, Telefone, Placa, Modelo, Ano, Cor, Cooperativa.
              Separador aceito: vírgula ou ponto-e-vírgula.
            </p>
            <Input type="file" accept=".csv,.txt" onChange={handleCsvImport} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

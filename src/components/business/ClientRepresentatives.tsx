import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { maskPhone } from "@/lib/masks";
import { Plus, Trash2, Save, Loader2, Users, Pencil, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

interface Representative {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: string | null;
  active: boolean;
}

interface Props {
  clientId: string;
}

const emptyRep = { name: "", phone: "", email: "", role: "" };

export default function ClientRepresentatives({ clientId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyRep);

  const { data: reps = [], isLoading } = useQuery({
    queryKey: ["client-representatives", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_representatives" as any)
        .select("*")
        .eq("client_id", clientId)
        .order("name");
      if (error) throw error;
      return (data || []) as unknown as Representative[];
    },
    enabled: !!clientId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        client_id: clientId,
        name: form.name,
        phone: form.phone || null,
        email: form.email || null,
        role: form.role || null,
      };

      if (editingId) {
        const { error } = await supabase
          .from("client_representatives" as any)
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("client_representatives" as any)
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-representatives", clientId] });
      toast({ title: editingId ? "Representante atualizado!" : "Representante adicionado!" });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyRep);
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("client_representatives" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-representatives", clientId] });
      toast({ title: "Representante removido" });
    },
  });

  const openEdit = (rep: Representative) => {
    setEditingId(rep.id);
    setForm({
      name: rep.name,
      phone: rep.phone || "",
      email: rep.email || "",
      role: rep.role || "",
    });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingId(null);
    setForm(emptyRep);
    setDialogOpen(true);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" /> Representantes
            </CardTitle>
            <CardDescription>Pessoas de contato desta associação</CardDescription>
          </div>
          <Button onClick={openNew} size="sm" className="gap-1">
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : reps.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum representante cadastrado.
          </p>
        ) : (
          <div className="space-y-2">
            {reps.map((rep) => (
              <div key={rep.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate">{rep.name}</p>
                    {rep.role && (
                      <Badge variant="outline" className="text-xs shrink-0">{rep.role}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    {rep.phone && <span>{rep.phone}</span>}
                    {rep.email && <span>{rep.email}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(rep)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(rep.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Representante" : "Novo Representante"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={(e) => setForm(p => ({ ...p, phone: maskPhone(e.target.value) }))} placeholder="(00) 00000-0000" />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Cargo</Label>
              <Input value={form.role} onChange={(e) => setForm(p => ({ ...p, role: e.target.value }))} placeholder="Ex: Gerente, Coordenador" />
            </div>
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
    </Card>
  );
}

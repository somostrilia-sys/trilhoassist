import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Search, ShieldBan, ShieldCheck, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { maskCNPJ, maskPhone } from "@/lib/masks";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function ProviderBlacklist() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [unblockDialog, setUnblockDialog] = useState<string | null>(null);

  // Fetch user's tenant_id
  const { data: tenantId } = useQuery({
    queryKey: ["user-tenant-id", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_tenants")
        .select("tenant_id")
        .eq("user_id", user!.id)
        .limit(1)
        .single();
      return data?.tenant_id ?? null;
    },
    enabled: !!user,
  });

  // Fetch active blacklist entries with provider info
  const { data: blacklistEntries = [], isLoading } = useQuery({
    queryKey: ["provider-blacklist", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provider_blacklist")
        .select("*, providers(name, cnpj, phone, city, state)")
        .eq("active", true)
        .eq("tenant_id", tenantId!)
        .order("blocked_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  const unblockMutation = useMutation({
    mutationFn: async (blacklistId: string) => {
      const { error } = await supabase
        .from("provider_blacklist")
        .update({ active: false, unblocked_at: new Date().toISOString() })
        .eq("id", blacklistId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provider-blacklist"] });
      queryClient.invalidateQueries({ queryKey: ["admin-providers"] });
      toast({ title: "Prestador desbloqueado com sucesso!" });
      setUnblockDialog(null);
    },
    onError: () => {
      toast({ title: "Erro ao desbloquear", variant: "destructive" });
    },
  });

  const filtered = blacklistEntries.filter((entry: any) => {
    const q = search.toLowerCase();
    const provider = entry.providers;
    return (
      provider?.name?.toLowerCase().includes(q) ||
      provider?.cnpj?.toLowerCase().includes(q) ||
      provider?.phone?.toLowerCase().includes(q) ||
      entry.reason?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldBan className="h-6 w-6 text-destructive" />
          Blacklist de Prestadores
        </h1>
        <p className="text-sm text-muted-foreground">
          Prestadores bloqueados não podem receber novos acionamentos
        </p>
      </div>

      {/* KPI */}
      <Card>
        <CardContent className="flex items-center gap-4 p-4">
          <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Prestadores Bloqueados</p>
            <p className="text-2xl font-bold">{blacklistEntries.length}</p>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, CNPJ, motivo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {search ? "Nenhum registro encontrado." : "Nenhum prestador na blacklist."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prestador</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Bloqueado em</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((entry: any) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">
                      {entry.providers?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-sm">
                      {entry.providers?.cnpj ? maskCNPJ(entry.providers.cnpj) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.providers?.phone ? maskPhone(entry.providers.phone) : "—"}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {entry.reason}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(entry.blocked_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => setUnblockDialog(entry.id)}
                      >
                        <ShieldCheck className="h-4 w-4" />
                        Desbloquear
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Unblock Confirmation Dialog */}
      <Dialog open={!!unblockDialog} onOpenChange={() => setUnblockDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desbloquear Prestador</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover este prestador da blacklist? Ele voltará a poder receber acionamentos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnblockDialog(null)}>
              Cancelar
            </Button>
            <Button onClick={() => unblockDialog && unblockMutation.mutate(unblockDialog)}>
              Confirmar Desbloqueio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
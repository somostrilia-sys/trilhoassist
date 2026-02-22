import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Plus, Users, CheckCircle, XCircle, Pencil, Link, ChevronDown, ShieldBan, ShieldCheck, MoreVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { maskCNPJ, maskPhone } from "@/lib/masks";

const SERVICE_LABELS: Record<string, string> = {
  tow_light: "Guincho Leve",
  tow_heavy: "Guincho Pesado",
  tow_motorcycle: "Guincho Moto",
  locksmith: "Chaveiro",
  tire_change: "Troca de Pneu",
  battery: "Bateria",
  fuel: "Pane Seca",
  other: "Outros",
};

export default function ProvidersList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [blockDialog, setBlockDialog] = useState<{ id: string; name: string } | null>(null);
  const [blockReason, setBlockReason] = useState("");

  // Fetch user's tenant id
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

  // Fetch tenant slug for the registration link
  const { data: tenantSlug } = useQuery({
    queryKey: ["user-tenant-slug", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("tenants")
        .select("slug")
        .eq("id", tenantId!)
        .single();
      return data?.slug ?? null;
    },
    enabled: !!tenantId,
  });

  const { data: providers = [], isLoading } = useQuery({
    queryKey: ["admin-providers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("providers")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch active blacklist entries for current tenant
  const { data: blacklistMap = {} } = useQuery({
    queryKey: ["provider-blacklist-map", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provider_blacklist")
        .select("provider_id, reason")
        .eq("active", true)
        .eq("tenant_id", tenantId!);
      if (error) throw error;
      const map: Record<string, string> = {};
      data?.forEach((entry) => {
        map[entry.provider_id] = entry.reason;
      });
      return map;
    },
    enabled: !!tenantId,
  });

  const blockMutation = useMutation({
    mutationFn: async ({ providerId, reason }: { providerId: string; reason: string }) => {
      const { error } = await supabase
        .from("provider_blacklist")
        .insert({
          provider_id: providerId,
          tenant_id: tenantId!,
          reason,
          blocked_by: user!.id,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provider-blacklist-map"] });
      queryClient.invalidateQueries({ queryKey: ["provider-blacklist"] });
      toast({ title: "Prestador bloqueado com sucesso!" });
      setBlockDialog(null);
      setBlockReason("");
    },
    onError: () => {
      toast({ title: "Erro ao bloquear prestador", variant: "destructive" });
    },
  });

  const unblockMutation = useMutation({
    mutationFn: async (providerId: string) => {
      const { error } = await supabase
        .from("provider_blacklist")
        .update({ active: false, unblocked_at: new Date().toISOString() })
        .eq("provider_id", providerId)
        .eq("tenant_id", tenantId!)
        .eq("active", true);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provider-blacklist-map"] });
      queryClient.invalidateQueries({ queryKey: ["provider-blacklist"] });
      toast({ title: "Prestador desbloqueado com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao desbloquear", variant: "destructive" });
    },
  });

  const copyRegistrationLink = () => {
    if (!tenantSlug) {
      toast({ title: "Erro", description: "Não foi possível obter o link de cadastro.", variant: "destructive" });
      return;
    }
    const link = `${window.location.origin}/cadastro/prestador/${tenantSlug}`;
    navigator.clipboard.writeText(link);
    toast({ title: "Link copiado!", description: "Envie o link ao prestador para que ele se cadastre." });
  };

  const filtered = providers.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.phone?.toLowerCase().includes(q) ||
      p.cnpj?.toLowerCase().includes(q) ||
      p.city?.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q)
    );
  });

  const activeCount = providers.filter((p) => p.active).length;
  const inactiveCount = providers.filter((p) => !p.active).length;
  const blockedCount = Object.keys(blacklistMap).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Prestadores</h1>
          <p className="text-sm text-muted-foreground">Gerencie sua rede de prestadores de serviço</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => navigate("/network/blacklist")}
          >
            <ShieldBan className="h-4 w-4" />
            Blacklist ({blockedCount})
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Novo Prestador
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate("/network/providers/new")}>
                <Pencil className="h-4 w-4 mr-2" />
                Cadastrar manualmente
              </DropdownMenuItem>
              <DropdownMenuItem onClick={copyRegistrationLink}>
                <Link className="h-4 w-4 mr-2" />
                Copiar link de cadastro
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{providers.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ativos</p>
              <p className="text-2xl font-bold">{activeCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
              <XCircle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Inativos</p>
              <p className="text-2xl font-bold">{inactiveCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <ShieldBan className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Bloqueados</p>
              <p className="text-2xl font-bold">{blockedCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, CNPJ, cidade..."
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
              {search ? "Nenhum prestador encontrado." : "Nenhum prestador cadastrado."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Cidade/UF</TableHead>
                  <TableHead>Serviços</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((provider) => {
                  const isBlocked = !!blacklistMap[provider.id];
                  return (
                    <TableRow key={provider.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {provider.name}
                          {isBlocked && (
                            <Badge variant="destructive" className="text-xs gap-1">
                              <ShieldBan className="h-3 w-3" />
                              Bloqueado
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-sm">
                        {provider.cnpj ? maskCNPJ(provider.cnpj) : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{maskPhone(provider.phone)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {provider.city && provider.state
                          ? `${provider.city}/${provider.state}`
                          : provider.city || provider.state || "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(provider.services || []).slice(0, 3).map((s) => (
                            <Badge key={s} variant="secondary" className="text-xs">
                              {SERVICE_LABELS[s] || s}
                            </Badge>
                          ))}
                          {(provider.services || []).length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{(provider.services || []).length - 3}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={provider.active ? "default" : "destructive"}>
                          {provider.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/network/providers/${provider.id}`)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {isBlocked ? (
                              <DropdownMenuItem onClick={() => unblockMutation.mutate(provider.id)}>
                                <ShieldCheck className="h-4 w-4 mr-2" />
                                Desbloquear
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setBlockDialog({ id: provider.id, name: provider.name })}
                              >
                                <ShieldBan className="h-4 w-4 mr-2" />
                                Bloquear
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Block Dialog */}
      <Dialog open={!!blockDialog} onOpenChange={() => { setBlockDialog(null); setBlockReason(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bloquear Prestador</DialogTitle>
            <DialogDescription>
              O prestador <strong>{blockDialog?.name}</strong> será adicionado à blacklist e não poderá receber novos acionamentos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motivo do bloqueio *</Label>
            <Textarea
              placeholder="Descreva o motivo do bloqueio..."
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBlockDialog(null); setBlockReason(""); }}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={!blockReason.trim()}
              onClick={() => blockDialog && blockMutation.mutate({ providerId: blockDialog.id, reason: blockReason })}
            >
              Confirmar Bloqueio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

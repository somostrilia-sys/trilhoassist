import { useState, useMemo, useCallback } from "react";
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Plus, UserCheck, CheckCircle, XCircle, Pencil, MoreVertical, Car, FileSpreadsheet, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { maskCPF, maskPhone } from "@/lib/masks";
import BeneficiaryImport from "@/components/import/BeneficiaryImport";

const PAGE_SIZE = 50;

export default function BeneficiariesList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [importOpen, setImportOpen] = useState(false);
  const [page, setPage] = useState(0);
  const debounceRef = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (debounceRef[0]) clearTimeout(debounceRef[0]);
    debounceRef[0] = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(0);
    }, 400);
  }, [debounceRef]);

  const { data: tenantId } = useQuery({
    queryKey: ["user-tenant-id", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("user_tenants").select("tenant_id").eq("user_id", user!.id).limit(1).single();
      return data?.tenant_id ?? null;
    },
    enabled: !!user,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["admin-clients", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name").eq("tenant_id", tenantId!).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  const clientIds = clients.map((c) => c.id);

  const { data: plans = [] } = useQuery({
    queryKey: ["admin-plans-for-import", clientIds],
    queryFn: async () => {
      if (clientIds.length === 0) return [];
      const { data, error } = await supabase.from("plans").select("id, name, client_id").in("client_id", clientIds);
      if (error) throw error;
      return data;
    },
    enabled: clientIds.length > 0,
  });

  const planMap = useMemo(() => {
    const m = new Map<string, string>();
    plans.forEach(p => m.set(p.name.toLowerCase().trim(), p.id));
    return m;
  }, [plans]);

  // Counts query (lightweight, no pagination)
  const { data: counts } = useQuery({
    queryKey: ["admin-beneficiaries-counts", clientIds, clientFilter],
    queryFn: async () => {
      if (clientIds.length === 0) return { total: 0, active: 0, inactive: 0 };
      const filterIds = clientFilter !== "all" ? [clientFilter] : clientIds;
      const { count: total } = await supabase.from("beneficiaries").select("id", { count: "exact", head: true }).in("client_id", filterIds);
      const { count: active } = await supabase.from("beneficiaries").select("id", { count: "exact", head: true }).in("client_id", filterIds).eq("active", true);
      return { total: total || 0, active: active || 0, inactive: (total || 0) - (active || 0) };
    },
    enabled: clientIds.length > 0,
  });

  // Server-side paginated + filtered query
  const { data: queryResult, isLoading } = useQuery<{ data: any[]; count: number }>({
    queryKey: ["admin-beneficiaries", clientIds, clientFilter, debouncedSearch, page],
    queryFn: async () => {
      if (clientIds.length === 0) return { data: [], count: 0 };

      const filterClientIds = clientFilter !== "all" ? [clientFilter] : clientIds;
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("beneficiaries")
        .select("*", { count: "exact" })
        .in("client_id", filterClientIds)
        .order("name")
        .range(from, to);

      if (debouncedSearch) {
        const q = `%${debouncedSearch}%`;
        query = query.or(`name.ilike.${q},vehicle_plate.ilike.${q},cpf.ilike.${q},cooperativa.ilike.${q}`);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: data || [], count: count || 0 };
    },
    enabled: clientIds.length > 0,
  });

  const beneficiaries = queryResult?.data || [];
  const totalFiltered = queryResult?.count || 0;
  const totalPages = Math.ceil(totalFiltered / PAGE_SIZE);

  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c.name]));

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("beneficiaries").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-beneficiaries"] });
      queryClient.invalidateQueries({ queryKey: ["admin-beneficiaries-counts"] });
      toast({ title: "Status atualizado!" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Beneficiários</h1>
          <p className="text-sm text-muted-foreground">Gerencie beneficiários e veículos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet className="h-4 w-4" />
            Importar Planilha
          </Button>
          <Button className="gap-2" onClick={() => navigate("/business/beneficiaries/new")}>
            <Plus className="h-4 w-4" />
            Novo Beneficiário
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <UserCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{counts?.total ?? "—"}</p>
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
              <p className="text-2xl font-bold">{counts?.active ?? "—"}</p>
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
              <p className="text-2xl font-bold">{counts?.inactive ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, placa, CPF, cooperativa..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={clientFilter} onValueChange={(v) => { setClientFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Todos os clientes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os clientes</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {clientFilter !== "all" && counts && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-sm px-3 py-1">
              {counts.total.toLocaleString("pt-BR")} beneficiários
            </Badge>
            <Badge variant="outline" className="text-sm px-2 py-1 text-green-600 border-green-300">
              {counts.active.toLocaleString("pt-BR")} ativos
            </Badge>
            <Badge variant="outline" className="text-sm px-2 py-1 text-destructive border-destructive/30">
              {counts.inactive.toLocaleString("pt-BR")} inativos
            </Badge>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && beneficiaries.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Carregando...</div>
          ) : beneficiaries.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {search || clientFilter !== "all" ? "Nenhum beneficiário encontrado." : "Nenhum beneficiário cadastrado."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Placa</TableHead>
                  <TableHead>Veículo</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Cooperativa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {beneficiaries.map((b) => (
                  <TableRow key={b.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-sm">
                      {b.cpf ? maskCPF(b.cpf) : "—"}
                    </TableCell>
                    <TableCell>
                      {b.vehicle_plate ? (
                        <Badge variant="outline" className="gap-1 font-mono">
                          <Car className="h-3 w-3" />
                          {b.vehicle_plate}
                        </Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {b.vehicle_model ? `${b.vehicle_model}${b.vehicle_year ? ` ${b.vehicle_year}` : ""}` : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {clientMap[b.client_id] || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {(b as any).cooperativa || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={b.active ? "default" : "destructive"}>
                        {b.active ? "Ativo" : "Inativo"}
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
                          <DropdownMenuItem onClick={() => navigate(`/business/beneficiaries/${b.id}`)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => toggleActiveMutation.mutate({ id: b.id, active: !b.active })}
                          >
                            {b.active ? (
                              <><XCircle className="h-4 w-4 mr-2" /> Desativar</>
                            ) : (
                              <><CheckCircle className="h-4 w-4 mr-2" /> Ativar</>
                            )}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalFiltered)} de {totalFiltered}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              Próxima <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      <BeneficiaryImport
        open={importOpen}
        onOpenChange={setImportOpen}
        clientId={clientFilter !== "all" ? clientFilter : (clientIds[0] || "")}
        planMap={planMap}
        onComplete={() => {
          queryClient.invalidateQueries({ queryKey: ["admin-beneficiaries"] });
          queryClient.invalidateQueries({ queryKey: ["admin-beneficiaries-counts"] });
        }}
      />
    </div>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, Plus, Users, CheckCircle, XCircle, Pencil } from "lucide-react";

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
  const [search, setSearch] = useState("");

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Prestadores</h1>
          <p className="text-sm text-muted-foreground">Gerencie sua rede de prestadores de serviço</p>
        </div>
        <Button onClick={() => navigate("/network/providers/new")} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Prestador
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                {filtered.map((provider) => (
                  <TableRow key={provider.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell className="font-medium">{provider.name}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-sm">
                      {provider.cnpj || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{provider.phone}</TableCell>
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
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate(`/network/providers/${provider.id}`)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

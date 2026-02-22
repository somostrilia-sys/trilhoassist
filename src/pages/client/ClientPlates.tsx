import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useClientData } from "@/hooks/useClientData";
import { useState } from "react";
import { Search } from "lucide-react";

export default function ClientPlates() {
  const { beneficiaries, isLoading } = useClientData();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;
  }

  const filtered = beneficiaries.filter((b) => {
    if (filter === "active" && !b.active) return false;
    if (filter === "inactive" && b.active) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      b.name?.toLowerCase().includes(q) ||
      b.vehicle_plate?.toLowerCase().includes(q) ||
      b.vehicle_model?.toLowerCase().includes(q) ||
      b.cpf?.toLowerCase().includes(q)
    );
  });

  const activePlates = beneficiaries.filter((b) => b.active).length;
  const inactivePlates = beneficiaries.filter((b) => !b.active).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Placas / Beneficiários</h1>
        <p className="text-muted-foreground">Gestão de veículos e beneficiários ativos</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="cursor-pointer" onClick={() => setFilter("all")}>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">{beneficiaries.length}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer" onClick={() => setFilter("active")}>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">Ativas</p>
            <p className="text-2xl font-bold text-primary">{activePlates}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer" onClick={() => setFilter("inactive")}>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">Inativas</p>
            <p className="text-2xl font-bold text-destructive">{inactivePlates}</p>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, placa, modelo, CPF..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Nome</th>
                  <th className="text-left p-3 font-medium">CPF</th>
                  <th className="text-left p-3 font-medium">Placa</th>
                  <th className="text-left p-3 font-medium">Modelo</th>
                  <th className="text-left p-3 font-medium">Ano</th>
                  <th className="text-left p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                      Nenhum beneficiário encontrado.
                    </td>
                  </tr>
                ) : (
                  filtered.map((b) => (
                    <tr key={b.id} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-medium">{b.name}</td>
                      <td className="p-3 text-muted-foreground">{b.cpf || "—"}</td>
                      <td className="p-3 font-mono">{b.vehicle_plate || "—"}</td>
                      <td className="p-3">{b.vehicle_model || "—"}</td>
                      <td className="p-3">{b.vehicle_year || "—"}</td>
                      <td className="p-3">
                        <Badge variant={b.active ? "default" : "destructive"}>
                          {b.active ? "Ativa" : "Inativa"}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

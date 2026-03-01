import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { Search, Plus, Award, Pencil, MoreVertical, ArrowLeft, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PLAN_VEHICLE_CATEGORY_LABELS } from "@/lib/vehicleClassification";

export default function PlansList() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: client } = useQuery({
    queryKey: ["client-detail", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["client-plans", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .eq("client_id", clientId!)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  // Fetch coverage counts per plan
  const planIds = plans.map((p) => p.id);
  const { data: coverageCounts = {} } = useQuery({
    queryKey: ["plan-coverage-counts", planIds],
    queryFn: async () => {
      if (planIds.length === 0) return {};
      const { data, error } = await supabase
        .from("plan_coverages" as any)
        .select("plan_id")
        .in("plan_id", planIds);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data as any[])?.forEach((c: any) => {
        counts[c.plan_id] = (counts[c.plan_id] || 0) + 1;
      });
      return counts;
    },
    enabled: planIds.length > 0,
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("plans").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-plans"] });
      toast({ title: "Status atualizado!" });
    },
  });

  const filtered = plans.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/business/clients")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Planos</h1>
          <p className="text-sm text-muted-foreground">
            {client?.name ? `Planos de ${client.name}` : "Gerenciar planos do cliente"}
          </p>
        </div>
        <Button className="gap-2" onClick={() => navigate(`/business/clients/${clientId}/plans/new`)}>
          <Plus className="h-4 w-4" />
          Novo Plano
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar plano..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {search ? "Nenhum plano encontrado." : "Nenhum plano cadastrado."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                 <TableRow>
                   <TableHead>Nome do Plano</TableHead>
                   <TableHead>Categoria</TableHead>
                   <TableHead>Coberturas</TableHead>
                   <TableHead>KM Guincho</TableHead>
                   <TableHead>Acionamentos/Ano</TableHead>
                   <TableHead>Status</TableHead>
                   <TableHead className="w-12"></TableHead>
                 </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((plan) => (
                  <TableRow key={plan.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Award className="h-4 w-4 text-primary" />
                        {plan.name}
                      </div>
                     </TableCell>
                     <TableCell>
                       <Badge variant="outline" className="text-xs">
                         {PLAN_VEHICLE_CATEGORY_LABELS[(plan as any).vehicle_category || "all"] || "Todos"}
                       </Badge>
                     </TableCell>
                     <TableCell>
                       <Badge variant="secondary">{coverageCounts[plan.id] || 0} regras</Badge>
                     </TableCell>
                     <TableCell className="text-muted-foreground">
                      {plan.max_tow_km ? `${plan.max_tow_km} km` : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {plan.max_dispatches_per_year ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={plan.active ? "default" : "destructive"}>
                        {plan.active ? "Ativo" : "Inativo"}
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
                          <DropdownMenuItem onClick={() => navigate(`/business/clients/${clientId}/plans/${plan.id}`)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => toggleActiveMutation.mutate({ id: plan.id, active: !plan.active })}
                          >
                            {plan.active ? (
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
    </div>
  );
}

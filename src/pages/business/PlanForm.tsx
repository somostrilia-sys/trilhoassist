import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Save, Plus, Trash2 } from "lucide-react";
import { PLAN_VEHICLE_CATEGORIES } from "@/lib/vehicleClassification";

const SERVICE_OPTIONS = [
  { value: "tow_light", label: "Reboque Leve" },
  { value: "tow_heavy", label: "Reboque Pesado" },
  { value: "tow_motorcycle", label: "Reboque Moto" },
  { value: "tow_utility", label: "Reboque Utilitário" },
  { value: "locksmith", label: "Chaveiro Automotivo" },
  { value: "tire_change", label: "Troca de Pneu" },
  { value: "battery", label: "Recarga de Bateria" },
  { value: "fuel", label: "Envio de Combustível" },
  { value: "lodging", label: "Hospedagem" },
  { value: "return_home", label: "Retorno ao Domicílio" },
  { value: "driver_friend", label: "Motorista Amigo" },
  { value: "collision", label: "Colisão" },
  { value: "other", label: "Outros" },
];

const SERVICE_LABELS: Record<string, string> = Object.fromEntries(
  SERVICE_OPTIONS.map((s) => [s.value, s.label])
);

// Service types that support value limits (per person / total)
const VALUE_SERVICE_TYPES = ["lodging", "return_home"];

interface CoverageRow {
  id?: string;
  service_type: string;
  max_uses: number;
  period_type: "days" | "calendar_month";
  period_days: number | null;
  max_km: number | null;
  lodging_max_value: number | null;
  lodging_per: "person" | "vehicle" | null;
  lodging_max_total: number | null;
  notes: string | null;
  active: boolean;
}

const emptyCoverage: CoverageRow = {
  service_type: "",
  max_uses: 1,
  period_type: "days",
  period_days: 30,
  max_km: null,
  lodging_max_value: null,
  lodging_per: null,
  lodging_max_total: null,
  notes: null,
  active: true,
};

export default function PlanForm() {
  const { clientId, planId } = useParams<{ clientId: string; planId: string }>();
  const isEdit = !!planId;
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [vehicleCategory, setVehicleCategory] = useState("all");
  const [active, setActive] = useState(true);
  const [maxTowKm, setMaxTowKm] = useState<number | "">(100);
  const [maxDispatches, setMaxDispatches] = useState<number | "">(4);
  const [plateFee, setPlateFee] = useState<number | "">(0);
  const [coverages, setCoverages] = useState<CoverageRow[]>([]);

  const { data: client } = useQuery({
    queryKey: ["client-detail", clientId],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("name").eq("id", clientId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  const { data: plan, isLoading } = useQuery({
    queryKey: ["plan-detail", planId],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("*").eq("id", planId!).single();
      if (error) throw error;
      return data;
    },
    enabled: isEdit,
  });

  const { data: existingCoverages = [] } = useQuery({
    queryKey: ["plan-coverages", planId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plan_coverages" as any)
        .select("*")
        .eq("plan_id", planId!);
      if (error) throw error;
      return data as any[];
    },
    enabled: isEdit,
  });

  useEffect(() => {
    if (plan) {
      setName(plan.name);
      setVehicleCategory((plan as any).vehicle_category || "all");
      setActive(plan.active);
      setMaxTowKm(plan.max_tow_km ?? "");
      setMaxDispatches(plan.max_dispatches_per_year ?? "");
      setPlateFee((plan as any).plate_fee ?? 0);
    }
  }, [plan]);

  useEffect(() => {
    if (existingCoverages.length > 0) {
      setCoverages(existingCoverages.map((c: any) => ({
        id: c.id,
        service_type: c.service_type,
        max_uses: c.max_uses,
        period_type: c.period_type,
        period_days: c.period_days,
        max_km: c.max_km,
        lodging_max_value: c.lodging_max_value,
        lodging_per: c.lodging_per,
        lodging_max_total: c.lodging_max_total ?? null,
        notes: c.notes ?? null,
        active: c.active,
      })));
    }
  }, [existingCoverages]);

  const addCoverage = () => {
    setCoverages((prev) => [...prev, { ...emptyCoverage }]);
  };

  const removeCoverage = (index: number) => {
    setCoverages((prev) => prev.filter((_, i) => i !== index));
  };

  const updateCoverage = (index: number, field: keyof CoverageRow, value: any) => {
    setCoverages((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  };

  const usedServiceTypes = coverages.map((c) => c.service_type);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const planPayload = {
        name,
        active,
        vehicle_category: vehicleCategory,
        max_tow_km: maxTowKm === "" ? null : Number(maxTowKm),
        max_dispatches_per_year: maxDispatches === "" ? null : Number(maxDispatches),
        plate_fee: plateFee === "" ? 0 : Number(plateFee),
        client_id: clientId!,
      } as any;

      let savedPlanId = planId;

      if (isEdit) {
        const { error } = await supabase.from("plans").update(planPayload).eq("id", planId!);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("plans").insert(planPayload).select("id").single();
        if (error) throw error;
        savedPlanId = data.id;
      }

      // Upsert coverages: delete all existing then insert new
      if (isEdit) {
        await supabase.from("plan_coverages" as any).delete().eq("plan_id", planId!);
      }

      if (coverages.length > 0) {
        const coveragePayload = coverages
          .filter((c) => c.service_type)
          .map((c) => ({
            plan_id: savedPlanId!,
            service_type: c.service_type,
            max_uses: c.max_uses,
            period_type: c.period_type,
            period_days: c.period_type === "days" ? c.period_days : null,
            max_km: c.max_km,
            lodging_max_value: c.lodging_max_value,
            lodging_per: c.lodging_per,
            lodging_max_total: c.lodging_max_total,
            notes: c.notes,
            active: c.active,
          }));

        if (coveragePayload.length > 0) {
          const { error } = await supabase.from("plan_coverages" as any).insert(coveragePayload);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-plans"] });
      queryClient.invalidateQueries({ queryKey: ["plan-coverages"] });
      toast({ title: isEdit ? "Plano atualizado!" : "Plano cadastrado!" });
      navigate(`/business/clients/${clientId}/plans`);
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) {
      toast({ title: "Preencha o nome do plano", variant: "destructive" });
      return;
    }
    saveMutation.mutate();
  };

  if (isEdit && isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/business/clients/${clientId}/plans`)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{isEdit ? "Editar Plano" : "Novo Plano"}</h1>
          <p className="text-sm text-muted-foreground">
            {client?.name ? `Plano para ${client.name}` : "Configure as regras do plano"}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {isEdit && (
          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">Status do Plano</p>
                <p className="text-sm text-muted-foreground">{active ? "Plano ativo" : "Plano inativo"}</p>
              </div>
              <Switch checked={active} onCheckedChange={setActive} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Dados Gerais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome do Plano *</Label>
                <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Plano Gold" />
              </div>
              <div className="space-y-2">
                <Label>Categoria de Veículo *</Label>
                <Select value={vehicleCategory} onValueChange={setVehicleCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {PLAN_VEHICLE_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="plateFee">Valor por Placa (R$)</Label>
                <Input id="plateFee" type="number" step="0.01" min="0" value={plateFee} onChange={(e) => setPlateFee(e.target.value === "" ? "" : Number(e.target.value))} placeholder="Ex: 29.90" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxTowKm">KM Máx. Guincho (padrão)</Label>
                <Input id="maxTowKm" type="number" value={maxTowKm} onChange={(e) => setMaxTowKm(e.target.value === "" ? "" : Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxDispatches">Acionamentos/Ano (padrão)</Label>
                <Input id="maxDispatches" type="number" value={maxDispatches} onChange={(e) => setMaxDispatches(e.target.value === "" ? "" : Number(e.target.value))} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Coverages */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Regras de Cobertura</CardTitle>
              <CardDescription>Configure limites por tipo de serviço</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addCoverage}>
              <Plus className="h-4 w-4" />
              Adicionar Regra
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {coverages.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma regra de cobertura configurada. Clique em "Adicionar Regra" para começar.
              </p>
            )}
            {coverages.map((cov, index) => {
              const isTow = cov.service_type?.startsWith("tow_");
              const hasValueLimits = VALUE_SERVICE_TYPES.includes(cov.service_type);
              return (
                <Card key={index} className="border-dashed">
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary">Regra #{index + 1}</Badge>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeCoverage(index)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Tipo de Serviço *</Label>
                        <Select value={cov.service_type} onValueChange={(v) => updateCoverage(index, "service_type", v)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {SERVICE_OPTIONS.map((s) => (
                              <SelectItem
                                key={s.value}
                                value={s.value}
                                disabled={usedServiceTypes.includes(s.value) && cov.service_type !== s.value}
                              >
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Quantidade Máxima</Label>
                        <Input
                          type="number"
                          min={1}
                          value={cov.max_uses}
                          onChange={(e) => updateCoverage(index, "max_uses", Number(e.target.value))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Tipo de Período</Label>
                        <Select value={cov.period_type} onValueChange={(v) => updateCoverage(index, "period_type", v)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="days">A cada X dias</SelectItem>
                            <SelectItem value="calendar_month">Mês calendário</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {cov.period_type === "days" && (
                        <div className="space-y-2">
                          <Label>Período (dias)</Label>
                          <Input
                            type="number"
                            min={1}
                            value={cov.period_days ?? 30}
                            onChange={(e) => updateCoverage(index, "period_days", Number(e.target.value))}
                          />
                        </div>
                      )}
                      {isTow && (
                        <div className="space-y-2">
                          <Label>KM Máximo</Label>
                          <Input
                            type="number"
                            value={cov.max_km ?? ""}
                            onChange={(e) => updateCoverage(index, "max_km", e.target.value === "" ? null : Number(e.target.value))}
                            placeholder="Ex: 500"
                          />
                        </div>
                      )}
                      {hasValueLimits && (
                        <>
                          <div className="space-y-2">
                            <Label>Valor Máx. por Pessoa (R$)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={cov.lodging_max_value ?? ""}
                              onChange={(e) => updateCoverage(index, "lodging_max_value", e.target.value === "" ? null : Number(e.target.value))}
                              placeholder="Ex: 100.00"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Valor Máx. Total (R$)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={cov.lodging_max_total ?? ""}
                              onChange={(e) => updateCoverage(index, "lodging_max_total", e.target.value === "" ? null : Number(e.target.value))}
                              placeholder="Ex: 500.00"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Limite por</Label>
                            <Select value={cov.lodging_per ?? ""} onValueChange={(v) => updateCoverage(index, "lodging_per", v || null)}>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="person">Por Pessoa</SelectItem>
                                <SelectItem value="vehicle">Por Veículo</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </>
                      )}
                    </div>
                    {/* Notes for exceptions/observations */}
                    {hasValueLimits && (
                      <div className="space-y-2">
                        <Label>Observações / Exceções</Label>
                        <Textarea
                          value={cov.notes ?? ""}
                          onChange={(e) => updateCoverage(index, "notes", e.target.value || null)}
                          placeholder="Ex: Em caso de colisão ou roubo, limite de R$ 500,00"
                          className="h-16"
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate(`/business/clients/${clientId}/plans`)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saveMutation.isPending} className="gap-2">
            {saveMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
            ) : (
              <><Save className="h-4 w-4" /> {isEdit ? "Salvar Alterações" : "Cadastrar Plano"}</>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { maskCPF, maskPhone } from "@/lib/masks";
import { Loader2, ArrowLeft, Save } from "lucide-react";

interface BeneficiaryFormData {
  name: string;
  cpf: string;
  phone: string;
  client_id: string;
  plan_id: string;
  cooperativa: string;
  vehicle_plate: string;
  vehicle_model: string;
  vehicle_year: string;
  vehicle_chassis: string;
  active: boolean;
}

const emptyForm: BeneficiaryFormData = {
  name: "", cpf: "", phone: "", client_id: "", plan_id: "", cooperativa: "",
  vehicle_plate: "", vehicle_model: "", vehicle_year: "", vehicle_chassis: "",
  active: true,
};

export default function BeneficiaryForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BeneficiaryFormData>(emptyForm);

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

  const { data: plans = [] } = useQuery({
    queryKey: ["client-plans-for-beneficiary", form.client_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("id, name").eq("client_id", form.client_id).eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!form.client_id,
  });

  const { data: beneficiary, isLoading } = useQuery({
    queryKey: ["beneficiary-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("beneficiaries").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: isEdit,
  });

  useEffect(() => {
    if (beneficiary) {
      setForm({
        name: beneficiary.name,
        cpf: beneficiary.cpf || "",
        phone: beneficiary.phone || "",
        client_id: beneficiary.client_id,
        plan_id: beneficiary.plan_id || "",
        cooperativa: (beneficiary as any).cooperativa || "",
        vehicle_plate: beneficiary.vehicle_plate || "",
        vehicle_model: beneficiary.vehicle_model || "",
        vehicle_year: beneficiary.vehicle_year?.toString() || "",
        vehicle_chassis: beneficiary.vehicle_chassis || "",
        active: beneficiary.active,
      });
    }
  }, [beneficiary]);

  const prevClientIdRef = useRef(form.client_id);
  useEffect(() => {
    if (prevClientIdRef.current !== form.client_id && prevClientIdRef.current !== "") {
      setForm((prev) => ({ ...prev, plan_id: "" }));
    }
    prevClientIdRef.current = form.client_id;
  }, [form.client_id]);

  const updateField = (field: keyof BeneficiaryFormData, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name: form.name,
        cpf: form.cpf || null,
        phone: form.phone || null,
        client_id: form.client_id,
        plan_id: form.plan_id || null,
        cooperativa: form.cooperativa || null,
        vehicle_plate: form.vehicle_plate || null,
        vehicle_model: form.vehicle_model || null,
        vehicle_year: form.vehicle_year ? Number(form.vehicle_year) : null,
        vehicle_chassis: form.vehicle_chassis || null,
        active: form.active,
      };

      if (isEdit) {
        const { error } = await supabase.from("beneficiaries").update(payload).eq("id", id!);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("beneficiaries").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-beneficiaries"] });
      toast({ title: isEdit ? "Beneficiário atualizado!" : "Beneficiário cadastrado!" });
      navigate("/business/beneficiaries");
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.client_id) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
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
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/business/beneficiaries")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{isEdit ? "Editar Beneficiário" : "Novo Beneficiário"}</h1>
          <p className="text-sm text-muted-foreground">
            {isEdit ? "Atualize os dados do beneficiário" : "Cadastre um novo beneficiário"}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {isEdit && (
          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">Status</p>
                <p className="text-sm text-muted-foreground">{form.active ? "Beneficiário ativo" : "Beneficiário inativo"}</p>
              </div>
              <Switch checked={form.active} onCheckedChange={(v) => updateField("active", v)} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Dados Pessoais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome Completo *</Label>
                <Input id="name" required value={form.name} onChange={(e) => updateField("name", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cpf">CPF</Label>
                <Input id="cpf" value={form.cpf} onChange={(e) => updateField("cpf", maskCPF(e.target.value))} placeholder="000.000.000-00" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input id="phone" value={form.phone} onChange={(e) => updateField("phone", maskPhone(e.target.value))} placeholder="(00) 00000-0000" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cooperativa">Cooperativa</Label>
                <Input id="cooperativa" value={form.cooperativa} onChange={(e) => updateField("cooperativa", e.target.value)} placeholder="Unidade/Cidade" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Vinculação</CardTitle>
            <CardDescription>Cliente e plano do beneficiário</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cliente *</Label>
                <Select value={form.client_id || undefined} onValueChange={(v) => updateField("client_id", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Plano</Label>
                <Select value={form.plan_id || undefined} onValueChange={(v) => updateField("plan_id", v)} disabled={!form.client_id}>
                  <SelectTrigger>
                    <SelectValue placeholder={form.client_id ? "Selecione o plano" : "Selecione um cliente primeiro"} />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.length > 0 ? plans.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    )) : (
                      <SelectItem value="__empty" disabled>Nenhum plano disponível</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Dados do Veículo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vehicle_plate">Placa</Label>
                <Input id="vehicle_plate" value={form.vehicle_plate} onChange={(e) => updateField("vehicle_plate", e.target.value.toUpperCase())} placeholder="ABC1D23" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vehicle_model">Modelo</Label>
                <Input id="vehicle_model" value={form.vehicle_model} onChange={(e) => updateField("vehicle_model", e.target.value)} placeholder="Ex: Fiat Uno" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vehicle_year">Ano</Label>
                <Input id="vehicle_year" type="number" value={form.vehicle_year} onChange={(e) => updateField("vehicle_year", e.target.value)} placeholder="2024" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vehicle_chassis">Chassi</Label>
                <Input id="vehicle_chassis" value={form.vehicle_chassis} onChange={(e) => updateField("vehicle_chassis", e.target.value.toUpperCase())} />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/business/beneficiaries")}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saveMutation.isPending} className="gap-2">
            {saveMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
            ) : (
              <><Save className="h-4 w-4" /> {isEdit ? "Salvar Alterações" : "Cadastrar Beneficiário"}</>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

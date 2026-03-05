import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { maskPhone, maskCNPJ, maskCEP, maskCPF } from "@/lib/masks";
import {
  Loader2, ArrowLeft, Truck, Wrench, Battery, Fuel, Key, HelpCircle, Save,
} from "lucide-react";

const SERVICE_OPTIONS = [
  { value: "tow_light", label: "Guincho Leve", icon: Truck },
  { value: "tow_heavy", label: "Guincho Pesado", icon: Truck },
  { value: "tow_motorcycle", label: "Guincho Moto", icon: Truck },
  { value: "locksmith", label: "Chaveiro", icon: Key },
  { value: "tire_change", label: "Troca de Pneu", icon: Wrench },
  { value: "battery", label: "Bateria/Carga", icon: Battery },
  { value: "fuel", label: "Pane Seca", icon: Fuel },
  { value: "other", label: "Outros", icon: HelpCircle },
];

const STATES = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
];

interface ProviderFormData {
  name: string;
  cnpj: string;
  email: string;
  phone: string;
  services: string[];
  street: string;
  address_number: string;
  neighborhood: string;
  city: string;
  state: string;
  zip_code: string;
  bank_name: string;
  bank_agency: string;
  bank_account: string;
  pix_key: string;
  active: boolean;
}

const emptyForm: ProviderFormData = {
  name: "", cnpj: "", email: "", phone: "",
  services: [],
  street: "", address_number: "", neighborhood: "", city: "", state: "", zip_code: "",
  bank_name: "", bank_agency: "", bank_account: "", pix_key: "",
  active: true,
};

export default function ProviderForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ProviderFormData>(emptyForm);

  const { data: provider, isLoading } = useQuery({
    queryKey: ["provider-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("providers")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: isEdit,
  });

  useEffect(() => {
    if (provider) {
      setForm({
        name: provider.name,
        cnpj: provider.cnpj || "",
        email: provider.email || "",
        phone: provider.phone || "",
        services: provider.services || [],
        street: provider.street || "",
        address_number: provider.address_number || "",
        neighborhood: provider.neighborhood || "",
        city: provider.city || "",
        state: provider.state || "",
        zip_code: provider.zip_code || "",
        bank_name: provider.bank_name || "",
        bank_agency: provider.bank_agency || "",
        bank_account: provider.bank_account || "",
        pix_key: provider.pix_key || "",
        active: provider.active,
      });
    }
  }, [provider]);

  const updateField = (field: keyof ProviderFormData, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleService = (service: string) => {
    setForm((prev) => ({
      ...prev,
      services: prev.services.includes(service)
        ? prev.services.filter((s) => s !== service)
        : [...prev.services, service],
    }));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const cleanDoc = form.cnpj ? form.cnpj.replace(/\D/g, "") : null;

      // Check for duplicate CPF/CNPJ before saving
      if (cleanDoc) {
        const query = supabase
          .from("providers")
          .select("id, name")
          .eq("cnpj", cleanDoc);

        // If editing, exclude current provider from check
        if (isEdit) {
          query.neq("id", id!);
        }

        const { data: existing } = await query.maybeSingle();
        if (existing) {
          throw new Error(`CPF/CNPJ já cadastrado para o prestador "${existing.name}"`);
        }
      }

      const payload = {
        name: form.name,
        cnpj: cleanDoc || null,
        email: form.email || null,
        phone: form.phone,
        services: form.services,
        street: form.street || null,
        address_number: form.address_number || null,
        neighborhood: form.neighborhood || null,
        city: form.city || null,
        state: form.state || null,
        zip_code: form.zip_code || null,
        bank_name: form.bank_name || null,
        bank_agency: form.bank_agency || null,
        bank_account: form.bank_account || null,
        pix_key: form.pix_key || null,
        active: form.active,
      };

      if (isEdit) {
        const { error } = await supabase
          .from("providers")
          .update(payload)
          .eq("id", id!);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("providers")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-providers"] });
      toast({ title: isEdit ? "Prestador atualizado!" : "Prestador cadastrado!" });
      navigate("/network/providers");
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.phone) {
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
        <Button variant="ghost" size="icon" onClick={() => navigate("/network/providers")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">
            {isEdit ? "Editar Prestador" : "Novo Prestador"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isEdit ? "Atualize os dados do prestador" : "Cadastre um novo prestador na rede"}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Status toggle (edit only) */}
        {isEdit && (
          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">Status do Prestador</p>
                <p className="text-sm text-muted-foreground">
                  {form.active ? "Prestador ativo e disponível para acionamentos" : "Prestador inativo"}
                </p>
              </div>
              <Switch checked={form.active} onCheckedChange={(v) => updateField("active", v)} />
            </CardContent>
          </Card>
        )}

        {/* Company Data */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Dados da Empresa</CardTitle>
            <CardDescription>Informações fiscais e de contato</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Razão Social / Nome *</Label>
                <Input id="name" required value={form.name} onChange={(e) => updateField("name", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cnpj">CPF / CNPJ</Label>
                <Input
                  id="cnpj"
                  value={form.cnpj}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, "");
                    const masked = raw.length <= 11 ? maskCPF(e.target.value) : maskCNPJ(e.target.value);
                    updateField("cnpj", masked);
                  }}
                  placeholder="000.000.000-00 ou 00.000.000/0000-00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone *</Label>
                <Input id="phone" required value={form.phone} onChange={(e) => updateField("phone", maskPhone(e.target.value))} placeholder="(00) 00000-0000" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Address */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Endereço</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="street">Rua</Label>
                <Input id="street" value={form.street} onChange={(e) => updateField("street", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address_number">Número</Label>
                <Input id="address_number" value={form.address_number} onChange={(e) => updateField("address_number", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="neighborhood">Bairro</Label>
                <Input id="neighborhood" value={form.neighborhood} onChange={(e) => updateField("neighborhood", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">Cidade</Label>
                <Input id="city" value={form.city} onChange={(e) => updateField("city", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">Estado</Label>
                <select
                  id="state"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.state}
                  onChange={(e) => updateField("state", e.target.value)}
                >
                  <option value="">Selecione</option>
                  {STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="zip_code">CEP</Label>
                <Input id="zip_code" value={form.zip_code} onChange={(e) => updateField("zip_code", maskCEP(e.target.value))} placeholder="00000-000" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Services */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Serviços Prestados</CardTitle>
            <CardDescription>Selecione os serviços que o prestador realiza</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {SERVICE_OPTIONS.map((svc) => {
                const Icon = svc.icon;
                const checked = form.services.includes(svc.value);
                return (
                  <label
                    key={svc.value}
                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                      checked ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleService(svc.value)}
                      className="sr-only"
                    />
                    <Icon className={`h-6 w-6 ${checked ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="text-xs text-center font-medium">{svc.label}</span>
                  </label>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Bank Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Dados Bancários</CardTitle>
            <CardDescription>Para recebimento dos serviços prestados</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bank_name">Banco</Label>
                <Input id="bank_name" value={form.bank_name} onChange={(e) => updateField("bank_name", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bank_agency">Agência</Label>
                <Input id="bank_agency" value={form.bank_agency} onChange={(e) => updateField("bank_agency", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bank_account">Conta</Label>
                <Input id="bank_account" value={form.bank_account} onChange={(e) => updateField("bank_account", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pix_key">Chave PIX</Label>
                <Input id="pix_key" value={form.pix_key} onChange={(e) => updateField("pix_key", e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/network/providers")}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saveMutation.isPending} className="gap-2">
            {saveMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
            ) : (
              <><Save className="h-4 w-4" /> {isEdit ? "Salvar Alterações" : "Cadastrar Prestador"}</>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

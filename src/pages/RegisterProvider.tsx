import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, Truck, Wrench, Battery, Fuel, Key, HelpCircle } from "lucide-react";
import { maskPhone, maskCNPJ, maskCEP, maskCPF } from "@/lib/masks";

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

export default function RegisterProvider() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    name: "",
    cnpj: "",
    email: "",
    password: "",
    phone: "",
    services: [] as string[],
    street: "",
    address_number: "",
    neighborhood: "",
    city: "",
    state: "",
    zip_code: "",
    bank_name: "",
    bank_agency: "",
    bank_account: "",
    pix_key: "",
  });

  // Fetch tenant info to show branding
  const { data: tenant, isLoading: tenantLoading, error: tenantError } = useQuery({
    queryKey: ["tenant-public", tenantSlug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants_safe")
        .select("name, logo_url, primary_color, slug")
        .eq("slug", tenantSlug!)
        .eq("active", true)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!tenantSlug,
  });

  const registerMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("register-provider", {
        method: "POST",
        body: { ...form, tenant_slug: tenantSlug },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      setSuccess(true);
    },
    onError: (err: Error) => {
      toast({
        title: "Erro no cadastro",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const updateField = (field: string, value: string) => {
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.services.length === 0) {
      toast({ title: "Selecione ao menos um serviço", variant: "destructive" });
      return;
    }
    registerMutation.mutate();
  };

  if (tenantLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (tenantError || !tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-destructive font-medium">Link inválido ou assistência não encontrada.</p>
            <p className="text-muted-foreground mt-2 text-sm">Verifique o link recebido e tente novamente.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <CheckCircle className="h-16 w-16 text-primary mx-auto" />
            <h2 className="text-xl font-bold">Cadastro realizado!</h2>
            <p className="text-muted-foreground">
              Seu cadastro como prestador da <strong>{tenant.name}</strong> foi concluído com sucesso.
              Você já pode acessar o sistema com seu e-mail e senha.
            </p>
            <Button onClick={() => navigate("/login")} className="w-full">
              Ir para o Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          {tenant.logo_url && (
            <img src={tenant.logo_url} alt={tenant.name} className="h-16 mx-auto" />
          )}
          <h1 className="text-2xl font-bold">Cadastro de Prestador</h1>
          <p className="text-muted-foreground">
            Preencha seus dados para se cadastrar como prestador da <strong>{tenant.name}</strong>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Dados de Acesso */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Dados de Acesso</CardTitle>
              <CardDescription>Informações para login no sistema</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail *</Label>
                  <Input id="email" type="email" required value={form.email} onChange={(e) => updateField("email", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha *</Label>
                  <Input id="password" type="password" required minLength={6} value={form.password} onChange={(e) => updateField("password", e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Dados da Empresa */}
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
                  <Label htmlFor="cnpj">CPF / CNPJ *</Label>
                  <Input id="cnpj" required value={form.cnpj} onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, "");
                    const masked = raw.length <= 11 ? maskCPF(e.target.value) : maskCNPJ(e.target.value);
                    updateField("cnpj", masked);
                  }} placeholder="000.000.000-00 ou 00.000.000/0000-00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone *</Label>
                  <Input id="phone" required value={form.phone} onChange={(e) => updateField("phone", maskPhone(e.target.value))} placeholder="(00) 00000-0000" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Endereço */}
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

          {/* Serviços */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Serviços Prestados *</CardTitle>
              <CardDescription>Selecione os serviços que você realiza</CardDescription>
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

          {/* Dados Bancários */}
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

          <Button type="submit" className="w-full" size="lg" disabled={registerMutation.isPending}>
            {registerMutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cadastrando...</>
            ) : (
              "Finalizar Cadastro"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}

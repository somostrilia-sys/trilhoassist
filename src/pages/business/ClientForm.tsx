import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { maskPhone, maskCNPJ } from "@/lib/masks";
import { Loader2, ArrowLeft, Save } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { MessageSquare } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ClientRepresentatives from "@/components/business/ClientRepresentatives";

interface ClientFormData {
  name: string;
  cnpj: string;
  contact_email: string;
  contact_phone: string;
  api_endpoint: string;
  api_key: string;
  billing_model: string;
  active: boolean;
  whatsapp_group_id: string;
  km_margin: string;
  api_type: string;
}

const emptyForm: ClientFormData = {
  name: "", cnpj: "", contact_email: "", contact_phone: "",
  api_endpoint: "", api_key: "", billing_model: "plate_plus_service", active: true,
  whatsapp_group_id: "", km_margin: "10", api_type: "standard",
};

export default function ClientForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ClientFormData>(emptyForm);

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

  const { data: client, isLoading } = useQuery({
    queryKey: ["client-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: isEdit,
  });

  useEffect(() => {
    if (client) {
      setForm({
        name: client.name,
        cnpj: client.cnpj || "",
        contact_email: client.contact_email || "",
        contact_phone: client.contact_phone || "",
        api_endpoint: client.api_endpoint || "",
        api_key: client.api_key || "",
        billing_model: (client as any).billing_model || "plate_plus_service",
        active: client.active,
        whatsapp_group_id: (client as any).whatsapp_group_id || "",
        km_margin: String((client as any).km_margin ?? 10),
        api_type: (client as any).api_type || "standard",
      });
    }
  }, [client]);

  const updateField = (field: keyof ClientFormData, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        cnpj: form.cnpj || null,
        contact_email: form.contact_email || null,
        contact_phone: form.contact_phone || null,
        api_endpoint: form.api_endpoint || null,
        api_key: form.api_key || null,
        billing_model: form.billing_model,
        active: form.active,
        tenant_id: tenantId,
        whatsapp_group_id: form.whatsapp_group_id || null,
        km_margin: form.km_margin ? parseInt(form.km_margin) : 10,
        api_type: form.api_type,
      };

      if (isEdit) {
        const { error } = await supabase.from("clients").update(payload).eq("id", id!);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("clients").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
      toast({ title: isEdit ? "Cliente atualizado!" : "Cliente cadastrado!" });
      navigate("/business/clients");
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) {
      toast({ title: "Preencha o nome do cliente", variant: "destructive" });
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
        <Button variant="ghost" size="icon" onClick={() => navigate("/business/clients")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{isEdit ? "Editar Cliente" : "Novo Cliente"}</h1>
          <p className="text-sm text-muted-foreground">
            {isEdit ? "Atualize os dados da associação" : "Cadastre uma nova associação"}
          </p>
        </div>
      </div>

      {isEdit ? (
        <Tabs defaultValue="dados">
          <TabsList className="mb-4">
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="representantes">Representantes</TabsTrigger>
          </TabsList>

          <TabsContent value="dados">
            <ClientFormFields form={form} updateField={updateField} isEdit={isEdit} saveMutation={saveMutation} handleSubmit={handleSubmit} navigate={navigate} />
          </TabsContent>

          <TabsContent value="representantes">
            <ClientRepresentatives clientId={id!} />
          </TabsContent>
        </Tabs>
      ) : (
        <ClientFormFields form={form} updateField={updateField} isEdit={isEdit} saveMutation={saveMutation} handleSubmit={handleSubmit} navigate={navigate} />
      )}
    </div>
  );
}

function ClientFormFields({ form, updateField, isEdit, saveMutation, handleSubmit, navigate }: {
  form: ClientFormData;
  updateField: (field: keyof ClientFormData, value: any) => void;
  isEdit: boolean;
  saveMutation: any;
  handleSubmit: (e: React.FormEvent) => void;
  navigate: (path: string) => void;
}) {
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {isEdit && (
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium">Status do Cliente</p>
              <p className="text-sm text-muted-foreground">
                {form.active ? "Cliente ativo" : "Cliente inativo"}
              </p>
            </div>
            <Switch checked={form.active} onCheckedChange={(v) => updateField("active", v)} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Dados da Empresa</CardTitle>
          <CardDescription>Informações da associação/empresa</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Razão Social *</Label>
              <Input id="name" required value={form.name} onChange={(e) => updateField("name", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input id="cnpj" value={form.cnpj} onChange={(e) => updateField("cnpj", maskCNPJ(e.target.value))} placeholder="00.000.000/0000-00" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact_email">E-mail de Contato</Label>
              <Input id="contact_email" type="email" value={form.contact_email} onChange={(e) => updateField("contact_email", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact_phone">Telefone de Contato</Label>
              <Input id="contact_phone" value={form.contact_phone} onChange={(e) => updateField("contact_phone", maskPhone(e.target.value))} placeholder="(00) 00000-0000" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Modelo de Cobrança</CardTitle>
          <CardDescription>Como o cliente será faturado mensalmente</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={form.billing_model}
            onValueChange={(v) => updateField("billing_model", v)}
            className="space-y-3"
          >
            <div className="flex items-start space-x-3 p-3 rounded-lg border">
              <RadioGroupItem value="plate_plus_service" id="plate_plus_service" className="mt-0.5" />
              <div>
                <Label htmlFor="plate_plus_service" className="font-medium cursor-pointer">Placa + Serviço</Label>
                <p className="text-sm text-muted-foreground">
                  Cobra um valor menor por placa e cobra separadamente cada acionamento de serviço
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3 p-3 rounded-lg border">
              <RadioGroupItem value="plate_only" id="plate_only" className="mt-0.5" />
              <div>
                <Label htmlFor="plate_only" className="font-medium cursor-pointer">Somente Placa</Label>
                <p className="text-sm text-muted-foreground">
                  Cobra um valor maior por placa, com os serviços inclusos (não cobra acionamento separado)
                </p>
              </div>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="h-5 w-5" /> WhatsApp — Etiquetas Automáticas
          </CardTitle>
          <CardDescription>Configure o envio automático de etiquetas de atendimento no grupo do cliente</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="whatsapp_group_id">ID do Grupo WhatsApp</Label>
              <Input
                id="whatsapp_group_id"
                value={form.whatsapp_group_id}
                onChange={(e) => updateField("whatsapp_group_id", e.target.value)}
                placeholder="5531999999999-1234567890@g.us"
              />
              <p className="text-xs text-muted-foreground">
                JID do grupo no formato: número@g.us
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="km_margin">Margem de KM (+)</Label>
              <Input
                id="km_margin"
                type="number"
                value={form.km_margin}
                onChange={(e) => updateField("km_margin", e.target.value)}
                placeholder="10"
              />
              <p className="text-xs text-muted-foreground">
                KM adicionados à roteirização estimada
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Integração API (ERP)</CardTitle>
          <CardDescription>Dados para integração com o sistema do cliente</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 mb-4">
            <Label>Tipo de API</Label>
            <RadioGroup
              value={form.api_type}
              onValueChange={(v) => updateField("api_type", v)}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="standard" id="api_standard" />
                <Label htmlFor="api_standard" className="cursor-pointer">Standard (POST)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="sincronismo" id="api_sincronismo" />
                <Label htmlFor="api_sincronismo" className="cursor-pointer">Sincronismo Fornecedor (GET)</Label>
              </div>
            </RadioGroup>
            {form.api_type === "sincronismo" && (
              <p className="text-xs text-muted-foreground">
                Usa endpoints GET com paginação por URL path. Endpoint base ex: https://api.hinova.com.br/api/sga/v2
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="api_endpoint">{form.api_type === "sincronismo" ? "URL Base da API" : "Endpoint da API"}</Label>
              <Input id="api_endpoint" value={form.api_endpoint} onChange={(e) => updateField("api_endpoint", e.target.value)} placeholder={form.api_type === "sincronismo" ? "https://api.hinova.com.br/api/sga/v2" : "https://api.cliente.com/v1"} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="api_key">{form.api_type === "sincronismo" ? "Token Bearer" : "Chave da API"}</Label>
              <Input id="api_key" type="password" value={form.api_key} onChange={(e) => updateField("api_key", e.target.value)} placeholder="••••••••" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => navigate("/business/clients")}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saveMutation.isPending} className="gap-2">
          {saveMutation.isPending ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
          ) : (
            <><Save className="h-4 w-4" /> {isEdit ? "Salvar Alterações" : "Cadastrar Cliente"}</>
          )}
        </Button>
      </div>
    </form>
  );
}

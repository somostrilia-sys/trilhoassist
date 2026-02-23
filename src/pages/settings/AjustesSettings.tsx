import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantId } from "@/hooks/useFinancialData";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Settings2, Building2, Palette, Tag, Bell, Save, Upload } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const DEFAULT_LABELS: Record<string, string> = {
  beneficiario: "Beneficiário",
  prestador: "Prestador",
  cliente: "Cliente",
  atendimento: "Atendimento",
  plano: "Plano",
  operador: "Operador",
};

const DEFAULT_NOTIFICATIONS = {
  email_new_request: true,
  email_request_completed: true,
  whatsapp_new_request: false,
  whatsapp_request_status: false,
};

export default function AjustesSettings() {
  const { data: tenantId } = useTenantId();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  // Tenant data
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [street, setStreet] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [faviconUrl, setFaviconUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#1a56db");
  const [secondaryColor, setSecondaryColor] = useState("#1e40af");
  const [accentColor, setAccentColor] = useState("#f59e0b");
  const [customLabels, setCustomLabels] = useState<Record<string, string>>(DEFAULT_LABELS);
  const [notifications, setNotifications] = useState(DEFAULT_NOTIFICATIONS);

  const { data: tenant, isLoading } = useQuery({
    queryKey: ["tenant-settings", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", tenantId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  useEffect(() => {
    if (tenant) {
      setName(tenant.name || "");
      setCnpj((tenant as any).cnpj || "");
      setPhone((tenant as any).phone || "");
      setEmail((tenant as any).email || "");
      setStreet((tenant as any).street || "");
      setAddressNumber((tenant as any).address_number || "");
      setNeighborhood((tenant as any).neighborhood || "");
      setCity((tenant as any).city || "");
      setState((tenant as any).state || "");
      setZipCode((tenant as any).zip_code || "");
      setLogoUrl(tenant.logo_url || "");
      setFaviconUrl(tenant.favicon_url || "");
      setPrimaryColor(tenant.primary_color || "#1a56db");
      setSecondaryColor(tenant.secondary_color || "#1e40af");
      setAccentColor(tenant.accent_color || "#f59e0b");
      const labels = (tenant as any).custom_labels;
      setCustomLabels({ ...DEFAULT_LABELS, ...(labels && typeof labels === "object" ? labels : {}) });
      const notif = (tenant as any).notification_settings;
      setNotifications({ ...DEFAULT_NOTIFICATIONS, ...(notif && typeof notif === "object" ? notif : {}) });
    }
  }, [tenant]);

  const handleSave = async (section: string) => {
    if (!tenantId) return;
    setSaving(true);
    try {
      let payload: Record<string, any> = {};
      if (section === "company") {
        payload = { name, cnpj, phone, email, street, address_number: addressNumber, neighborhood, city, state, zip_code: zipCode };
      } else if (section === "visual") {
        payload = { logo_url: logoUrl, favicon_url: faviconUrl, primary_color: primaryColor, secondary_color: secondaryColor, accent_color: accentColor };
      } else if (section === "labels") {
        payload = { custom_labels: customLabels };
      } else if (section === "notifications") {
        payload = { notification_settings: notifications };
      }

      const { error } = await supabase
        .from("tenants")
        .update(payload)
        .eq("id", tenantId);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["tenant-settings"] });
      toast({ title: "Ajustes salvos com sucesso" });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tenantId) return;
    const path = `${tenantId}/logo-${Date.now()}.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("tenant-assets").upload(path, file, { upsert: true });
    if (error) {
      toast({ title: "Erro no upload", description: error.message, variant: "destructive" });
      return;
    }
    const { data: urlData } = supabase.storage.from("tenant-assets").getPublicUrl(path);
    setLogoUrl(urlData.publicUrl);
    toast({ title: "Logo enviada" });
  };

  if (isLoading) return <p className="text-muted-foreground p-4">Carregando...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings2 className="h-6 w-6 text-primary" />
          Ajustes
        </h1>
        <p className="text-sm text-muted-foreground">
          Personalize o sistema de acordo com sua operação
        </p>
      </div>

      <Tabs defaultValue="company" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="company" className="flex items-center gap-1.5 text-xs">
            <Building2 className="h-3.5 w-3.5" /> Empresa
          </TabsTrigger>
          <TabsTrigger value="visual" className="flex items-center gap-1.5 text-xs">
            <Palette className="h-3.5 w-3.5" /> Visual
          </TabsTrigger>
          <TabsTrigger value="labels" className="flex items-center gap-1.5 text-xs">
            <Tag className="h-3.5 w-3.5" /> Nomenclaturas
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-1.5 text-xs">
            <Bell className="h-3.5 w-3.5" /> Notificações
          </TabsTrigger>
        </TabsList>

        {/* Dados da Empresa */}
        <TabsContent value="company">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Dados da Empresa</CardTitle>
              <CardDescription>Informações gerais do seu tenant</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome da empresa</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da assistência" />
                </div>
                <div className="space-y-2">
                  <Label>CNPJ</Label>
                  <Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
                </div>
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contato@empresa.com" />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Endereço</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>CEP</Label>
                    <Input value={zipCode} onChange={(e) => setZipCode(e.target.value)} placeholder="00000-000" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Rua</Label>
                    <Input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Rua / Avenida" />
                  </div>
                  <div className="space-y-2">
                    <Label>Número</Label>
                    <Input value={addressNumber} onChange={(e) => setAddressNumber(e.target.value)} placeholder="Nº" />
                  </div>
                  <div className="space-y-2">
                    <Label>Bairro</Label>
                    <Input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} placeholder="Bairro" />
                  </div>
                  <div className="space-y-2">
                    <Label>Cidade</Label>
                    <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Cidade" />
                  </div>
                  <div className="space-y-2">
                    <Label>Estado</Label>
                    <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="UF" maxLength={2} />
                  </div>
                </div>
              </div>

              <Button onClick={() => handleSave("company")} disabled={saving}>
                <Save className="h-4 w-4 mr-2" /> {saving ? "Salvando..." : "Salvar"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Personalização Visual */}
        <TabsContent value="visual">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Personalização Visual</CardTitle>
              <CardDescription>Logo, favicon e cores do sistema</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Logo</Label>
                  <div className="flex items-center gap-3">
                    {logoUrl && (
                      <img src={logoUrl} alt="Logo" className="h-12 w-12 rounded-lg object-contain border bg-muted p-1" />
                    )}
                    <label className="cursor-pointer">
                      <div className="flex items-center gap-2 text-sm text-primary hover:underline">
                        <Upload className="h-4 w-4" /> Enviar logo
                      </div>
                      <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                    </label>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>URL do Favicon</Label>
                  <Input value={faviconUrl} onChange={(e) => setFaviconUrl(e.target.value)} placeholder="https://..." />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Cor primária</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-10 w-10 rounded border cursor-pointer" />
                    <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="flex-1" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Cor secundária</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="h-10 w-10 rounded border cursor-pointer" />
                    <Input value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="flex-1" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Cor de destaque</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="h-10 w-10 rounded border cursor-pointer" />
                    <Input value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="flex-1" />
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="rounded-lg border p-4 bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground mb-3">Prévia das cores</p>
                <div className="flex gap-3">
                  <div className="h-12 w-24 rounded-md flex items-center justify-center text-white text-xs font-medium" style={{ backgroundColor: primaryColor }}>Primária</div>
                  <div className="h-12 w-24 rounded-md flex items-center justify-center text-white text-xs font-medium" style={{ backgroundColor: secondaryColor }}>Secundária</div>
                  <div className="h-12 w-24 rounded-md flex items-center justify-center text-white text-xs font-medium" style={{ backgroundColor: accentColor }}>Destaque</div>
                </div>
              </div>

              <Button onClick={() => handleSave("visual")} disabled={saving}>
                <Save className="h-4 w-4 mr-2" /> {saving ? "Salvando..." : "Salvar"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Nomenclaturas */}
        <TabsContent value="labels">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Nomenclaturas</CardTitle>
              <CardDescription>Customize os termos usados no sistema (ex: "Beneficiário" → "Associado")</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(DEFAULT_LABELS).map(([key, defaultValue]) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Padrão: {defaultValue}</Label>
                    <Input
                      value={customLabels[key] || defaultValue}
                      onChange={(e) => setCustomLabels({ ...customLabels, [key]: e.target.value })}
                      placeholder={defaultValue}
                    />
                  </div>
                ))}
              </div>
              <Button onClick={() => handleSave("labels")} disabled={saving}>
                <Save className="h-4 w-4 mr-2" /> {saving ? "Salvando..." : "Salvar"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notificações */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Notificações</CardTitle>
              <CardDescription>Configure quais notificações automáticas são enviadas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-1">
                <p className="text-sm font-medium">E-mail</p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm">Novo atendimento aberto</p>
                    <p className="text-xs text-muted-foreground">Enviar e-mail quando um novo atendimento for criado</p>
                  </div>
                  <Switch
                    checked={notifications.email_new_request}
                    onCheckedChange={(v) => setNotifications({ ...notifications, email_new_request: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm">Atendimento concluído</p>
                    <p className="text-xs text-muted-foreground">Enviar e-mail quando um atendimento for finalizado</p>
                  </div>
                  <Switch
                    checked={notifications.email_request_completed}
                    onCheckedChange={(v) => setNotifications({ ...notifications, email_request_completed: v })}
                  />
                </div>
              </div>

              <div className="space-y-1 pt-2 border-t">
                <p className="text-sm font-medium">WhatsApp</p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm">Novo atendimento aberto</p>
                    <p className="text-xs text-muted-foreground">Enviar template HSM ao beneficiário</p>
                  </div>
                  <Switch
                    checked={notifications.whatsapp_new_request}
                    onCheckedChange={(v) => setNotifications({ ...notifications, whatsapp_new_request: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm">Atualização de status</p>
                    <p className="text-xs text-muted-foreground">Notificar beneficiário sobre mudanças de status</p>
                  </div>
                  <Switch
                    checked={notifications.whatsapp_request_status}
                    onCheckedChange={(v) => setNotifications({ ...notifications, whatsapp_request_status: v })}
                  />
                </div>
              </div>

              <Button onClick={() => handleSave("notifications")} disabled={saving}>
                <Save className="h-4 w-4 mr-2" /> {saving ? "Salvando..." : "Salvar"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

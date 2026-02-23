import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantId } from "@/hooks/useFinancialData";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Settings2, Building2, Palette, Tag, Bell, Save, Upload, Siren, MessageSquare, RotateCcw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

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

// Auto-notify phase definitions
const AUTO_NOTIFY_PHASES = [
  {
    key: "beneficiary_creation",
    label: "Beneficiário — Atendimento Criado",
    description: "Enviada ao beneficiário quando o atendimento é registrado",
    icon: "📋",
    defaultMessage: `Olá, {{beneficiary_name}}! 👋

Seu atendimento foi registrado com sucesso pelo *{{tenant_name}}*.

*Protocolo*: {{protocol}}
*Serviço*: {{service_name}}

Excelente! 👌 Encaminhei seus dados para o setor de acionamento. Agora estamos localizando o prestador mais próximo. Assim que tiver a previsão de chegada, retorno aqui com as informações.

Aguarde, por favor! 🙏`,
  },
  {
    key: "beneficiary_dispatch",
    label: "Beneficiário — Prestador Acionado",
    description: "Enviada ao beneficiário quando o prestador é despachado",
    icon: "🚗",
    defaultMessage: `Boa notícia! 😀

O prestador já foi localizado e está a aproximadamente *{{estimated_arrival_min}} minutos* do local.

*Prestador*: {{provider_name}}
*Protocolo*: {{protocol}}

📍 Segue o link pra você acompanhar o andamento e a chegada do prestador:
{{beneficiary_tracking_url}}

Por favor, *não se esqueça de marcar no seu link quando ele chegar*, isso ajuda a gente a acompanhar aqui. ✅`,
  },
  {
    key: "beneficiary_completion",
    label: "Beneficiário — Atendimento Finalizado (NPS)",
    description: "Enviada ao beneficiário após finalização, com link de pesquisa NPS",
    icon: "✅",
    defaultMessage: `Olá, {{beneficiary_name}}! ✅

Seu atendimento *{{protocol}}* foi *finalizado com sucesso*!

Agradecemos por confiar no *{{tenant_name}}*. Esperamos que tenha tido uma boa experiência.

Em breve você receberá uma pesquisa de satisfação. Sua opinião é muito importante para nós! ⭐

Obrigado! 🙏`,
  },
  {
    key: "provider_dispatch",
    label: "Prestador — Acionamento",
    description: "Enviada ao prestador com dados do serviço e link de rastreamento",
    icon: "🔧",
    defaultMessage: `🚗 *Novo Acionamento!*

*{{tenant_name}}*

*Protocolo*: {{protocol}}
*Serviço*: {{service_name}}
*Veículo*: {{vehicle_model}} {{vehicle_plate}}
*Solicitante*: {{requester_name}}
*Contato*: {{requester_phone}}

*Origem*: {{origin_address}}
*Destino*: {{destination_address}}

📍 *Navegação e rastreamento*:
{{provider_tracking_url}}

Por favor, acesse o link acima para iniciar a navegação e compartilhar sua localização em tempo real.`,
  },
] as const;

type AutoNotifySettings = {
  [key: string]: {
    enabled: boolean;
    custom_message?: string;
  };
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
  const [alertDispatchMin, setAlertDispatchMin] = useState(15);
  const [alertLateMin, setAlertLateMin] = useState(10);
  const [autoNotifySettings, setAutoNotifySettings] = useState<AutoNotifySettings>({});

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
      const parsedNotif = notif && typeof notif === "object" ? notif : {};
      setNotifications({ ...DEFAULT_NOTIFICATIONS, ...parsedNotif });
      setAlertDispatchMin((tenant as any).alert_dispatch_minutes ?? 15);
      setAlertLateMin((tenant as any).alert_late_minutes ?? 10);
      // Load auto-notify settings from notification_settings.auto_notify
      const autoNotify = parsedNotif.auto_notify || {};
      const loadedAutoNotify: AutoNotifySettings = {};
      for (const phase of AUTO_NOTIFY_PHASES) {
        loadedAutoNotify[phase.key] = {
          enabled: autoNotify[phase.key]?.enabled !== false, // default enabled
          custom_message: autoNotify[phase.key]?.custom_message || "",
        };
      }
      setAutoNotifySettings(loadedAutoNotify);
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
        payload = { notification_settings: { ...notifications, auto_notify: autoNotifySettings } };
      } else if (section === "alerts") {
        payload = { alert_dispatch_minutes: alertDispatchMin, alert_late_minutes: alertLateMin };
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
        <TabsList className="grid w-full grid-cols-5">
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
          <TabsTrigger value="alerts" className="flex items-center gap-1.5 text-xs">
            <Siren className="h-3.5 w-3.5" /> Alertas
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

        {/* Notificações Automáticas */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="h-5 w-5" /> Notificações Automáticas via WhatsApp
              </CardTitle>
              <CardDescription>
                Ative/desative e personalize as mensagens enviadas automaticamente em cada fase do atendimento.
                Use variáveis entre {"{{"}chaves duplas{"}}"}  para dados dinâmicos.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border p-3 bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground mb-2">Variáveis disponíveis</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "{{beneficiary_name}}", "{{tenant_name}}", "{{protocol}}", "{{service_name}}",
                    "{{provider_name}}", "{{estimated_arrival_min}}", "{{beneficiary_tracking_url}}",
                    "{{provider_tracking_url}}", "{{vehicle_model}}", "{{vehicle_plate}}",
                    "{{requester_name}}", "{{requester_phone}}", "{{origin_address}}", "{{destination_address}}",
                    "{{nps_link}}",
                  ].map((v) => (
                    <code key={v} className="text-[10px] bg-background border rounded px-1.5 py-0.5 text-foreground">{v}</code>
                  ))}
                </div>
              </div>

              <Accordion type="multiple" className="w-full">
                {AUTO_NOTIFY_PHASES.map((phase) => {
                  const settings = autoNotifySettings[phase.key] || { enabled: true, custom_message: "" };
                  return (
                    <AccordionItem key={phase.key} value={phase.key}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-3 flex-1">
                          <span className="text-lg">{phase.icon}</span>
                          <div className="text-left flex-1">
                            <p className="text-sm font-medium">{phase.label}</p>
                            <p className="text-xs text-muted-foreground font-normal">{phase.description}</p>
                          </div>
                          <div className="mr-2" onClick={(e) => e.stopPropagation()}>
                            <Switch
                              checked={settings.enabled}
                              onCheckedChange={(v) =>
                                setAutoNotifySettings((prev) => ({
                                  ...prev,
                                  [phase.key]: { ...prev[phase.key], enabled: v },
                                }))
                              }
                            />
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3 pt-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Mensagem personalizada</Label>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={() =>
                                setAutoNotifySettings((prev) => ({
                                  ...prev,
                                  [phase.key]: { ...prev[phase.key], custom_message: "" },
                                }))
                              }
                            >
                              <RotateCcw className="h-3 w-3" /> Restaurar padrão
                            </Button>
                          </div>
                          <Textarea
                            rows={8}
                            className="font-mono text-xs"
                            placeholder={phase.defaultMessage}
                            value={settings.custom_message || ""}
                            onChange={(e) =>
                              setAutoNotifySettings((prev) => ({
                                ...prev,
                                [phase.key]: { ...prev[phase.key], custom_message: e.target.value },
                              }))
                            }
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Deixe vazio para usar a mensagem padrão mostrada como placeholder acima.
                          </p>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>

              <Button onClick={() => handleSave("notifications")} disabled={saving} className="mt-4">
                <Save className="h-4 w-4 mr-2" /> {saving ? "Salvando..." : "Salvar Notificações"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Alertas do Painel */}
        <TabsContent value="alerts">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Alertas do Painel de Acionamentos</CardTitle>
              <CardDescription>Configure os tempos que disparam sirenes no painel operacional</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Tempo sem despacho (minutos)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={120}
                    value={alertDispatchMin}
                    onChange={(e) => setAlertDispatchMin(Number(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Sirene quando um atendimento ficar sem prestador acionado após esse tempo
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Tolerância de atraso (minutos)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={120}
                    value={alertLateMin}
                    onChange={(e) => setAlertLateMin(Number(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Sirene quando o prestador ultrapassar o ETA previsto por esse tempo adicional
                  </p>
                </div>
              </div>
              <Button onClick={() => handleSave("alerts")} disabled={saving}>
                <Save className="h-4 w-4 mr-2" /> {saving ? "Salvando..." : "Salvar"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

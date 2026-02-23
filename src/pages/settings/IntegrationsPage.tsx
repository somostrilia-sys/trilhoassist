import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantId } from "@/hooks/useFinancialData";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Link2, TestTube, Download, RefreshCw, ArrowRight, CheckCircle2, XCircle, Clock, AlertCircle, MessageSquare, MapPin, Database, Eye, EyeOff, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

// ====================== WhatsApp Section ======================
function WhatsAppIntegration({ tenantId }: { tenantId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [evolutionUrl, setEvolutionUrl] = useState("");
  const [evolutionKey, setEvolutionKey] = useState("");
  const [evolutionInstance, setEvolutionInstance] = useState("default");

  const { data: tenant } = useQuery({
    queryKey: ["tenant-integrations", tenantId],
    queryFn: async () => {
      const { data } = await supabase.from("tenants").select("evolution_api_url, evolution_api_key").eq("id", tenantId).single();
      return data;
    },
    enabled: !!tenantId,
  });

  useEffect(() => {
    if (tenant) {
      setEvolutionUrl((tenant as any).evolution_api_url || "");
      setEvolutionKey((tenant as any).evolution_api_key || "");
    }
  }, [tenant]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("tenants").update({
        evolution_api_url: evolutionUrl || null,
        evolution_api_key: evolutionKey || null,
      } as any).eq("id", tenantId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["tenant-integrations"] });
      toast({ title: "Configuração WhatsApp salva com sucesso" });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!evolutionUrl || !evolutionKey) {
      toast({ title: "Preencha URL e API Key antes de testar", variant: "destructive" });
      return;
    }
    setTesting(true);
    try {
      const baseUrl = evolutionUrl.replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/instance/fetchInstances`, {
        headers: { apikey: evolutionKey },
      });
      if (response.ok) {
        const data = await response.json();
        const instances = Array.isArray(data) ? data : data?.instances || [];
        toast({ title: "Conexão OK!", description: `${instances.length} instância(s) encontrada(s)` });
      } else {
        toast({ title: "Falha na conexão", description: `Status: ${response.status}`, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Erro de conexão", description: err.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const isConfigured = !!(evolutionUrl && evolutionKey);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-green-600" />
                Evolution API (WhatsApp)
              </CardTitle>
              <CardDescription>
                Conecte sua instância da Evolution API para enviar e receber mensagens WhatsApp automaticamente
              </CardDescription>
            </div>
            <Badge variant={isConfigured ? "default" : "outline"}>
              {isConfigured ? "Configurado" : "Não configurado"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-4 bg-muted/20 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-blue-500 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Como configurar</p>
                <ol className="text-xs text-muted-foreground list-decimal ml-4 mt-1 space-y-1">
                  <li>Instale a <span className="font-medium">Evolution API</span> em seu servidor ou use uma instância hospedada</li>
                  <li>Copie a <span className="font-medium">URL base</span> da sua instância (ex: <code className="bg-muted px-1 rounded">https://api.seudominio.com</code>)</li>
                  <li>Gere uma <span className="font-medium">API Key</span> no painel da Evolution</li>
                  <li>Cole os dados abaixo e clique em <span className="font-medium">Testar Conexão</span></li>
                </ol>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>URL da API *</Label>
              <Input
                value={evolutionUrl}
                onChange={(e) => setEvolutionUrl(e.target.value)}
                placeholder="https://api.seudominio.com"
                type="url"
              />
              <p className="text-xs text-muted-foreground">Endereço base da sua instância Evolution</p>
            </div>
            <div className="space-y-2">
              <Label>API Key *</Label>
              <div className="relative">
                <Input
                  value={evolutionKey}
                  onChange={(e) => setEvolutionKey(e.target.value)}
                  placeholder="Sua chave de API"
                  type={showKey ? "text" : "password"}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Chave gerada no painel da Evolution API</p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Salvando..." : "Salvar"}
            </Button>
            <Button onClick={handleTest} disabled={testing} variant="outline">
              <TestTube className="h-4 w-4 mr-2" />
              {testing ? "Testando..." : "Testar Conexão"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">O que a integração WhatsApp faz</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" /> Notificações automáticas ao beneficiário (criação, acionamento, finalização)</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" /> Envio de link de rastreamento em tempo real</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" /> Acionamento do prestador via WhatsApp com dados do serviço</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" /> Etiquetas automáticas no grupo da associação</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" /> CRM WhatsApp com fila de atendimento</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" /> Pesquisa NPS pós-atendimento</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

// ====================== Google Section ======================
function GoogleIntegration({ tenantId }: { tenantId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [googleKey, setGoogleKey] = useState("");

  const { data: tenant } = useQuery({
    queryKey: ["tenant-google", tenantId],
    queryFn: async () => {
      const { data } = await supabase.from("tenants").select("google_api_key").eq("id", tenantId).single();
      return data;
    },
    enabled: !!tenantId,
  });

  useEffect(() => {
    if (tenant) {
      setGoogleKey((tenant as any).google_api_key || "");
    }
  }, [tenant]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("tenants").update({
        google_api_key: googleKey || null,
      } as any).eq("id", tenantId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["tenant-google"] });
      toast({ title: "Chave Google salva com sucesso" });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!googleKey) {
      toast({ title: "Preencha a API Key antes de testar", variant: "destructive" });
      return;
    }
    setTesting(true);
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=São+Paulo&key=${googleKey}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.status === "OK") {
        toast({ title: "API Google funcionando!", description: "Geocoding respondeu com sucesso" });
      } else {
        toast({ title: "Falha na API Google", description: `Status: ${data.status} — ${data.error_message || ""}`, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Erro de conexão", description: err.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const isConfigured = !!googleKey;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="h-5 w-5 text-red-500" />
                Google Maps / Places
              </CardTitle>
              <CardDescription>
                Configure sua chave do Google para geocodificação precisa e busca de prestadores externos
              </CardDescription>
            </div>
            <Badge variant={isConfigured ? "default" : "secondary"}>
              {isConfigured ? "Configurado" : "Usando OpenStreetMap (gratuito)"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-4 bg-muted/20 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-blue-500 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Como obter sua chave Google</p>
                <ol className="text-xs text-muted-foreground list-decimal ml-4 mt-1 space-y-1">
                  <li>Acesse o <span className="font-medium">Google Cloud Console</span> (<code className="bg-muted px-1 rounded">console.cloud.google.com</code>)</li>
                  <li>Crie um projeto ou selecione um existente</li>
                  <li>Ative as APIs: <span className="font-medium">Places API</span>, <span className="font-medium">Geocoding API</span> e <span className="font-medium">Directions API</span></li>
                  <li>Em <span className="font-medium">Credenciais</span>, crie uma <span className="font-medium">Chave de API</span></li>
                  <li>Cole a chave abaixo e teste</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Google API Key</Label>
            <div className="relative max-w-lg">
              <Input
                value={googleKey}
                onChange={(e) => setGoogleKey(e.target.value)}
                placeholder="AIzaSy..."
                type={showKey ? "text" : "password"}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Uma única chave serve para Places, Geocoding e Directions</p>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Salvando..." : "Salvar"}
            </Button>
            <Button onClick={handleTest} disabled={testing} variant="outline">
              <TestTube className="h-4 w-4 mr-2" />
              {testing ? "Testando..." : "Testar Conexão"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">O que a integração Google faz</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" /> Busca de prestadores externos (guinchos, chaveiros) próximos ao local</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" /> Geocodificação de endereços com maior precisão</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" /> Cálculo de rotas reais (distância por estrada)</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" /> Roteirização otimizada para prestadores</li>
          </ul>
          <div className="mt-3 rounded-lg bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Sem Google configurado:</span> O sistema continua funcionando normalmente usando OpenStreetMap/Nominatim (gratuito) para geocodificação e OSRM para rotas. O Google é um upgrade de precisão.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ====================== ERP Section (existing) ======================
function ErpIntegration({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [erpFields, setErpFields] = useState<any>(null);
  const [fetchingFields, setFetchingFields] = useState(false);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-with-api", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, api_endpoint, api_key, auto_sync_enabled, sync_interval_minutes")
        .eq("tenant_id", tenantId!)
        .order("name");
      if (error) throw error;
      return (data ?? []).filter((c: any) => c.api_endpoint && c.api_key);
    },
    enabled: !!tenantId,
  });

  const selectedClient = clients.find((c: any) => c.id === selectedClientId);

  const { data: plans = [] } = useQuery({
    queryKey: ["plans-for-mapping", selectedClientId],
    queryFn: async () => {
      const { data } = await supabase.from("plans").select("id, name").eq("client_id", selectedClientId!);
      return data ?? [];
    },
    enabled: !!selectedClientId,
  });

  const { data: mappings = [] } = useQuery({
    queryKey: ["erp-mappings", selectedClientId],
    queryFn: async () => {
      const { data } = await supabase.from("erp_field_mappings" as any).select("*").eq("client_id", selectedClientId!);
      return data ?? [];
    },
    enabled: !!selectedClientId,
  });

  const { data: syncLogs = [] } = useQuery({
    queryKey: ["sync-logs", selectedClientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("erp_sync_logs" as any)
        .select("*")
        .eq("client_id", selectedClientId!)
        .order("created_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
    enabled: !!selectedClientId,
  });

  const callErpFunction = async (action: string, extra = {}) => {
    const { data, error } = await supabase.functions.invoke("erp-integration", {
      body: { action, client_id: selectedClientId, tenant_id: tenantId, ...extra },
    });
    if (error) throw error;
    return data;
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await callErpFunction("test");
      setTestResult(result);
      toast({ title: result.success ? "Conexão OK" : "Falha na conexão", variant: result.success ? "default" : "destructive" });
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const handleFetchFields = async () => {
    setFetchingFields(true);
    try {
      const result = await callErpFunction("fetch_fields");
      setErpFields(result.fields);
    } catch (err: any) {
      toast({ title: "Erro ao buscar campos", description: err.message, variant: "destructive" });
    } finally {
      setFetchingFields(false);
    }
  };

  const handleSaveMapping = async (fieldType: string, erpValue: string, trilhoValue: string, trilhoId?: string) => {
    try {
      const existing = (mappings as any[]).find((m: any) => m.field_type === fieldType && m.erp_value === erpValue);
      if (existing) {
        await supabase.from("erp_field_mappings" as any).update({ trilho_value: trilhoValue, trilho_id: trilhoId || null }).eq("id", existing.id);
      } else {
        await supabase.from("erp_field_mappings" as any).insert({
          client_id: selectedClientId, tenant_id: tenantId, field_type: fieldType, erp_value: erpValue, trilho_value: trilhoValue, trilho_id: trilhoId || null,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["erp-mappings"] });
      toast({ title: "Mapeamento salvo" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const result = await callErpFunction("import");
      queryClient.invalidateQueries({ queryKey: ["sync-logs"] });
      toast({
        title: "Importação concluída",
        description: `${result.records_found} encontrados, ${result.records_created} criados, ${result.records_updated} atualizados`,
      });
    } catch (err: any) {
      toast({ title: "Erro na importação", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const handleToggleAutoSync = async (enabled: boolean) => {
    await supabase.from("clients").update({ auto_sync_enabled: enabled } as any).eq("id", selectedClientId);
    queryClient.invalidateQueries({ queryKey: ["clients-with-api"] });
    toast({ title: enabled ? "Sincronização automática ativada" : "Sincronização automática desativada" });
  };

  const handleChangeSyncInterval = async (minutes: string) => {
    await supabase.from("clients").update({ sync_interval_minutes: parseInt(minutes) } as any).eq("id", selectedClientId);
    queryClient.invalidateQueries({ queryKey: ["clients-with-api"] });
  };

  const getMappingValue = (fieldType: string, erpValue: string) => {
    const m = (mappings as any[]).find((m: any) => m.field_type === fieldType && m.erp_value === erpValue);
    return { trilhoValue: m?.trilho_value || "", trilhoId: m?.trilho_id || "" };
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-600" />
            Integração ERP — Associações
          </CardTitle>
          <CardDescription>
            Conecte as APIs dos seus clientes (associações) para importar beneficiários e veículos automaticamente.
            Configure o endpoint e a chave de API no cadastro de cada cliente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1 space-y-1">
              <Label>Selecione o cliente com API configurada</Label>
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um cliente..." />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {clients.length === 0 && (
              <p className="text-sm text-muted-foreground mt-6">
                Nenhum cliente com API configurada. Vá em Negócio → Clientes e configure o endpoint e chave do cliente.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedClientId && (
        <Tabs defaultValue="connection" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="connection" className="text-xs"><TestTube className="h-3.5 w-3.5 mr-1" /> Conexão</TabsTrigger>
            <TabsTrigger value="mapping" className="text-xs"><ArrowRight className="h-3.5 w-3.5 mr-1" /> Mapeamento</TabsTrigger>
            <TabsTrigger value="import" className="text-xs"><Download className="h-3.5 w-3.5 mr-1" /> Importação</TabsTrigger>
            <TabsTrigger value="sync" className="text-xs"><RefreshCw className="h-3.5 w-3.5 mr-1" /> Sincronização</TabsTrigger>
          </TabsList>

          <TabsContent value="connection">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Testar Conexão</CardTitle>
                <CardDescription>Verifique se a API do ERP está acessível</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Endpoint</Label>
                    <p className="text-sm font-mono bg-muted rounded px-2 py-1 truncate">{selectedClient?.api_endpoint}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">API Key</Label>
                    <p className="text-sm font-mono bg-muted rounded px-2 py-1">••••••{selectedClient?.api_key?.slice(-6)}</p>
                  </div>
                </div>
                <Button onClick={handleTest} disabled={testing}>
                  <TestTube className="h-4 w-4 mr-2" />
                  {testing ? "Testando..." : "Testar Conexão"}
                </Button>
                {testResult && (
                  <div className={`rounded-lg border p-4 ${testResult.success ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                    <div className="flex items-center gap-2">
                      {testResult.success ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-red-600" />}
                      <p className={`font-medium ${testResult.success ? "text-green-800" : "text-red-800"}`}>{testResult.message}</p>
                    </div>
                    {testResult.sample_data && (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs text-muted-foreground">{testResult.sample_data.total_records} registros encontrados</p>
                        <p className="text-xs text-muted-foreground">Campos: {testResult.sample_data.keys?.join(", ")}</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="mapping">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Mapeamento de Campos</CardTitle>
                <CardDescription>Associe os valores do ERP aos equivalentes no sistema</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button onClick={handleFetchFields} disabled={fetchingFields} variant="outline">
                  <RefreshCw className={`h-4 w-4 mr-2 ${fetchingFields ? "animate-spin" : ""}`} />
                  {fetchingFields ? "Buscando..." : "Buscar campos do ERP"}
                </Button>
                {erpFields && (
                  <div className="space-y-6">
                    {erpFields.plans?.length > 0 && (
                      <div className="space-y-3">
                        <h3 className="font-medium text-sm flex items-center gap-2">
                          <Badge variant="outline">Planos</Badge>
                          <span className="text-muted-foreground text-xs">{erpFields.plans.length} encontrados no ERP</span>
                        </h3>
                        <div className="space-y-2">
                          {erpFields.plans.map((erpPlan: string) => {
                            const mapping = getMappingValue("plan", erpPlan);
                            return (
                              <div key={erpPlan} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
                                <div className="flex-1"><p className="text-sm font-medium">{erpPlan}</p><p className="text-xs text-muted-foreground">ERP</p></div>
                                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                <div className="flex-1">
                                  <Select value={mapping.trilhoId || ""} onValueChange={(v) => { const plan = plans.find((p: any) => p.id === v); handleSaveMapping("plan", erpPlan, plan?.name || v, v); }}>
                                    <SelectTrigger className="h-9"><SelectValue placeholder="Selecione plano" /></SelectTrigger>
                                    <SelectContent>{plans.map((p: any) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}</SelectContent>
                                  </Select>
                                </div>
                                {mapping.trilhoId && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {erpFields.cooperativas?.length > 0 && (
                      <div className="space-y-3">
                        <h3 className="font-medium text-sm flex items-center gap-2">
                          <Badge variant="outline">Cooperativas</Badge>
                          <span className="text-muted-foreground text-xs">{erpFields.cooperativas.length} encontradas</span>
                        </h3>
                        <div className="space-y-2">
                          {erpFields.cooperativas.map((erpCoop: string) => {
                            const mapping = getMappingValue("cooperativa", erpCoop);
                            return (
                              <div key={erpCoop} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
                                <div className="flex-1"><p className="text-sm font-medium">{erpCoop}</p><p className="text-xs text-muted-foreground">ERP</p></div>
                                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                <div className="flex-1"><Input placeholder="Nome no sistema" defaultValue={mapping.trilhoValue} onBlur={(e) => handleSaveMapping("cooperativa", erpCoop, e.target.value)} className="h-9" /></div>
                                {mapping.trilhoValue && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="import">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Importação de Beneficiários</CardTitle>
                <CardDescription>Importe dados do ERP para o sistema</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border p-4 bg-muted/20 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Antes de importar</p>
                      <ul className="text-xs text-muted-foreground list-disc ml-4 mt-1 space-y-1">
                        <li>Teste a conexão na aba "Conexão"</li>
                        <li>Configure os mapeamentos na aba "Mapeamento"</li>
                        <li>Beneficiários existentes (mesma placa) serão atualizados</li>
                        <li>Novos beneficiários serão criados automaticamente</li>
                      </ul>
                    </div>
                  </div>
                </div>
                <Button onClick={handleImport} disabled={importing} size="lg">
                  <Download className={`h-4 w-4 mr-2 ${importing ? "animate-bounce" : ""}`} />
                  {importing ? "Importando..." : "Iniciar Importação"}
                </Button>
                {(syncLogs as any[]).length > 0 && (
                  <div className="space-y-2 mt-4">
                    <h3 className="text-sm font-medium">Histórico</h3>
                    <div className="space-y-2">
                      {(syncLogs as any[]).map((log: any) => (
                        <div key={log.id} className="flex items-center justify-between p-3 rounded-lg border text-sm">
                          <div className="flex items-center gap-2">
                            {log.status === "success" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                            {log.status === "error" && <XCircle className="h-4 w-4 text-red-600" />}
                            {log.status === "running" && <Clock className="h-4 w-4 text-blue-600 animate-spin" />}
                            <span className="capitalize">{log.sync_type}</span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            {log.status === "success" && <span>{log.records_found} encontrados • {log.records_created} criados • {log.records_updated} atualizados</span>}
                            {log.status === "error" && <span className="text-red-600">{log.error_message?.substring(0, 60)}</span>}
                            <span>{new Date(log.created_at).toLocaleString("pt-BR")}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sync">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Sincronização Automática</CardTitle>
                <CardDescription>Configure importações periódicas do ERP</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg border">
                  <div>
                    <p className="font-medium text-sm">Ativar sincronização automática</p>
                    <p className="text-xs text-muted-foreground">Importa beneficiários do ERP periodicamente</p>
                  </div>
                  <Switch checked={(selectedClient as any)?.auto_sync_enabled || false} onCheckedChange={handleToggleAutoSync} />
                </div>
                {(selectedClient as any)?.auto_sync_enabled && (
                  <div className="space-y-2">
                    <Label>Intervalo (minutos)</Label>
                    <Select value={String((selectedClient as any)?.sync_interval_minutes || 60)} onValueChange={handleChangeSyncInterval}>
                      <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">A cada 15 minutos</SelectItem>
                        <SelectItem value="30">A cada 30 minutos</SelectItem>
                        <SelectItem value="60">A cada 1 hora</SelectItem>
                        <SelectItem value="120">A cada 2 horas</SelectItem>
                        <SelectItem value="360">A cada 6 horas</SelectItem>
                        <SelectItem value="720">A cada 12 horas</SelectItem>
                        <SelectItem value="1440">Diariamente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ====================== Main Page ======================
export default function IntegrationsPage() {
  const { data: tenantId } = useTenantId();

  if (!tenantId) return <p className="text-muted-foreground p-4">Carregando...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Link2 className="h-6 w-6 text-primary" />
          Integrações
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure as integrações externas do seu sistema. Cada empresa configura suas próprias chaves de acesso.
        </p>
      </div>

      <Tabs defaultValue="whatsapp" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="whatsapp" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> WhatsApp
          </TabsTrigger>
          <TabsTrigger value="google" className="flex items-center gap-2">
            <MapPin className="h-4 w-4" /> Google Maps
          </TabsTrigger>
          <TabsTrigger value="erp" className="flex items-center gap-2">
            <Database className="h-4 w-4" /> ERP / Associações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="whatsapp">
          <WhatsAppIntegration tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="google">
          <GoogleIntegration tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="erp">
          <ErpIntegration tenantId={tenantId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

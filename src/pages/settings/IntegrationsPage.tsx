import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantId } from "@/hooks/useFinancialData";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Link2, TestTube, Download, RefreshCw, ArrowRight, CheckCircle2, XCircle, Clock, AlertCircle, MapPin, Database, Eye, EyeOff, Save, QrCode, Zap } from "lucide-react";
import { EvolutionApiIntegration } from "@/components/whatsapp/EvolutionApiIntegration";
import { OperatorWhatsApp } from "@/components/whatsapp/OperatorWhatsApp";
import { ErpSetupWizard } from "@/components/erp/ErpSetupWizard";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

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
    if (tenant) setGoogleKey((tenant as any).google_api_key || "");
  }, [tenant]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("tenants").update({ google_api_key: googleKey || null } as any).eq("id", tenantId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["tenant-google"] });
      toast({ title: "Chave Google salva com sucesso" });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleTest = async () => {
    if (!googleKey) { toast({ title: "Preencha a API Key antes de testar", variant: "destructive" }); return; }
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
    } finally { setTesting(false); }
  };

  const isConfigured = !!googleKey;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="h-5 w-5 text-destructive" />
                Google Maps / Places
              </CardTitle>
              <CardDescription>Configure sua chave do Google para geocodificação precisa</CardDescription>
            </div>
            <Badge variant={isConfigured ? "default" : "secondary"}>
              {isConfigured ? "Configurado" : "Usando OpenStreetMap (gratuito)"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-4 bg-muted/20 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-primary mt-0.5" />
              <div>
                <p className="text-sm font-medium">Como obter sua chave Google</p>
                <ol className="text-xs text-muted-foreground list-decimal ml-4 mt-1 space-y-1">
                  <li>Acesse o <span className="font-medium">Google Cloud Console</span></li>
                  <li>Ative as APIs: Places, Geocoding e Directions</li>
                  <li>Crie uma Chave de API e cole abaixo</li>
                </ol>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Google API Key</Label>
            <div className="relative max-w-lg">
              <Input value={googleKey} onChange={(e) => setGoogleKey(e.target.value)} placeholder="AIzaSy..." type={showKey ? "text" : "password"} />
              <button type="button" onClick={() => setShowKey(!showKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={saving}><Save className="h-4 w-4 mr-2" />{saving ? "Salvando..." : "Salvar"}</Button>
            <Button onClick={handleTest} disabled={testing} variant="outline"><TestTube className="h-4 w-4 mr-2" />{testing ? "Testando..." : "Testar"}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ====================== ERP Section ======================
function ErpIntegration({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [viewMode, setViewMode] = useState<"wizard" | "advanced">("wizard");

  const { data: allClients = [] } = useQuery({
    queryKey: ["all-clients-erp", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, api_endpoint, api_key, api_type, auto_sync_enabled, sync_interval_minutes")
        .eq("tenant_id", tenantId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const clientIds = allClients.map((c: any) => c.id);
  const { data: beneficiaryCounts = {} } = useQuery({
    queryKey: ["beneficiary-counts-erp", clientIds],
    queryFn: async () => {
      if (clientIds.length === 0) return {};
      const counts: Record<string, number> = {};
      for (const cid of clientIds) {
        const { count } = await supabase
          .from("beneficiaries")
          .select("id", { count: "exact", head: true })
          .eq("client_id", cid);
        counts[cid] = count || 0;
      }
      return counts;
    },
    enabled: clientIds.length > 0,
  });

  const { data: lastSyncs = {} } = useQuery({
    queryKey: ["last-syncs-erp", clientIds],
    queryFn: async () => {
      if (clientIds.length === 0) return {};
      const syncs: Record<string, any> = {};
      for (const cid of clientIds) {
        const { data } = await supabase
          .from("erp_sync_logs")
          .select("status, created_at, records_found, records_created, records_updated")
          .eq("client_id", cid)
          .eq("status", "success")
          .order("created_at", { ascending: false })
          .limit(1);
        if (data && data.length > 0) syncs[cid] = data[0];
      }
      return syncs;
    },
    enabled: clientIds.length > 0,
  });

  const selectedClient = allClients.find((c: any) => c.id === selectedClientId);

  const formatRelativeDate = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "agora";
    if (hours < 24) return `há ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "ontem";
    return `há ${days}d`;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Integração ERP — Associações
          </CardTitle>
          <CardDescription>Conecte APIs dos clientes para importar beneficiários e veículos automaticamente</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Selecione um cliente</Label>
            <div className="grid gap-2">
              {allClients.map((client: any) => {
                const hasApi = client.api_endpoint && client.api_key;
                const count = (beneficiaryCounts as any)[client.id] || 0;
                const lastSync = (lastSyncs as any)[client.id];
                const isSelected = selectedClientId === client.id;
                return (
                  <button
                    key={client.id}
                    onClick={() => setSelectedClientId(client.id)}
                    className={`flex items-center justify-between p-3 rounded-lg border text-left transition-colors ${
                      isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-2 w-2 rounded-full ${hasApi ? "bg-green-500" : "bg-amber-400"}`} />
                      <span className="font-medium text-sm">{client.name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {hasApi ? (
                        <>
                          <Badge variant="outline" className="text-xs gap-1">
                            <CheckCircle2 className="h-3 w-3 text-green-600" /> Conectado
                          </Badge>
                          {count > 0 && (
                            <Badge variant="secondary" className="text-xs">{count.toLocaleString()} veículos</Badge>
                          )}
                          {lastSync && (
                            <Badge variant="secondary" className="text-xs">Sync: {formatRelativeDate(lastSync.created_at)}</Badge>
                          )}
                        </>
                      ) : (
                        <Badge variant="outline" className="text-xs gap-1 text-amber-600 border-amber-300">
                          <AlertCircle className="h-3 w-3" /> Pendente
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })}
              {allClients.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">Nenhum cliente cadastrado.</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedClientId && selectedClient && (
        <>
          <div className="flex gap-2">
            <Button variant={viewMode === "wizard" ? "default" : "outline"} size="sm" onClick={() => setViewMode("wizard")}>
              <Zap className="h-4 w-4 mr-1" /> Wizard Guiado
            </Button>
            <Button variant={viewMode === "advanced" ? "default" : "outline"} size="sm" onClick={() => setViewMode("advanced")}>
              Modo Avançado
            </Button>
          </div>

          {!selectedClient.api_endpoint || !selectedClient.api_key ? (
            <Card>
              <CardContent className="p-6 text-center space-y-3">
                <AlertCircle className="h-8 w-8 text-amber-500 mx-auto" />
                <p className="font-medium">API não configurada</p>
                <p className="text-sm text-muted-foreground">Configure o endpoint e token na edição do cliente.</p>
              </CardContent>
            </Card>
          ) : viewMode === "wizard" ? (
            <ErpSetupWizard
              clientId={selectedClientId}
              clientName={selectedClient.name}
              tenantId={tenantId}
              onComplete={() => {
                queryClient.invalidateQueries({ queryKey: ["all-clients-erp"] });
                queryClient.invalidateQueries({ queryKey: ["beneficiary-counts-erp"] });
                queryClient.invalidateQueries({ queryKey: ["last-syncs-erp"] });
              }}
            />
          ) : (
            <AdvancedErpView clientId={selectedClientId} client={selectedClient} tenantId={tenantId} />
          )}
        </>
      )}
    </div>
  );
}

// ─── Advanced ERP View ───
function AdvancedErpView({ clientId, client, tenantId }: { clientId: string; client: any; tenantId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [erpFields, setErpFields] = useState<any>(null);
  const [fetchingFields, setFetchingFields] = useState(false);
  const [autoMapping, setAutoMapping] = useState(false);

  const { data: plans = [] } = useQuery({
    queryKey: ["plans-for-mapping", clientId],
    queryFn: async () => { const { data } = await supabase.from("plans").select("id, name").eq("client_id", clientId); return data ?? []; },
    enabled: !!clientId,
  });

  const { data: mappings = [] } = useQuery({
    queryKey: ["erp-mappings", clientId],
    queryFn: async () => { const { data } = await supabase.from("erp_field_mappings" as any).select("*").eq("client_id", clientId); return data ?? []; },
    enabled: !!clientId,
  });

  const { data: syncLogs = [] } = useQuery({
    queryKey: ["sync-logs", clientId],
    queryFn: async () => { const { data } = await supabase.from("erp_sync_logs" as any).select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(10); return data ?? []; },
    enabled: !!clientId,
  });

  const callErp = async (action: string, extra = {}) => {
    const { data, error } = await supabase.functions.invoke("erp-integration", { body: { action, client_id: clientId, tenant_id: tenantId, ...extra } });
    if (error) throw error;
    return data;
  };

  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    try { const r = await callErp("test"); setTestResult(r); }
    catch (e: any) { setTestResult({ success: false, message: e.message }); }
    finally { setTesting(false); }
  };

  const handleFetchFields = async () => {
    setFetchingFields(true);
    try { const r = await callErp("fetch_fields"); setErpFields(r.fields); }
    catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
    finally { setFetchingFields(false); }
  };

  const handleAutoMap = async () => {
    setAutoMapping(true);
    try {
      const r = await callErp("auto_map_products");
      queryClient.invalidateQueries({ queryKey: ["erp-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["plans-for-mapping"] });
      toast({ title: "Concluído", description: `${r.products_found} produtos, ${r.plans_created} planos criados` });
      handleFetchFields();
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
    finally { setAutoMapping(false); }
  };

  const handleSaveMapping = async (fieldType: string, erpValue: string, trilhoValue: string, trilhoId?: string) => {
    const existing = (mappings as any[]).find((m: any) => m.field_type === fieldType && m.erp_value === erpValue);
    if (existing) {
      await supabase.from("erp_field_mappings" as any).update({ trilho_value: trilhoValue, trilho_id: trilhoId || null }).eq("id", existing.id);
    } else {
      await supabase.from("erp_field_mappings" as any).insert({ client_id: clientId, tenant_id: tenantId, field_type: fieldType, erp_value: erpValue, trilho_value: trilhoValue, trilho_id: trilhoId || null });
    }
    queryClient.invalidateQueries({ queryKey: ["erp-mappings"] });
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const r = await callErp("import");
      queryClient.invalidateQueries({ queryKey: ["sync-logs"] });
      toast({ title: "Importação concluída", description: `${r.records_found} encontrados, ${r.records_created} criados, ${r.records_updated} atualizados` });
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
    finally { setImporting(false); }
  };

  const handleToggleAutoSync = async (enabled: boolean) => {
    await supabase.from("clients").update({ auto_sync_enabled: enabled } as any).eq("id", clientId);
    queryClient.invalidateQueries({ queryKey: ["all-clients-erp"] });
  };

  const handleChangeSyncInterval = async (minutes: string) => {
    await supabase.from("clients").update({ sync_interval_minutes: parseInt(minutes) } as any).eq("id", clientId);
    queryClient.invalidateQueries({ queryKey: ["all-clients-erp"] });
  };

  const getMappingValue = (ft: string, ev: string) => {
    const m = (mappings as any[]).find((x: any) => x.field_type === ft && x.erp_value === ev);
    return { trilhoValue: m?.trilho_value || "", trilhoId: m?.trilho_id || "" };
  };

  return (
    <Tabs defaultValue="connection" className="space-y-4">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="connection" className="text-xs"><TestTube className="h-3.5 w-3.5 mr-1" /> Conexão</TabsTrigger>
        <TabsTrigger value="mapping" className="text-xs"><ArrowRight className="h-3.5 w-3.5 mr-1" /> Mapeamento</TabsTrigger>
        <TabsTrigger value="import" className="text-xs"><Download className="h-3.5 w-3.5 mr-1" /> Importação</TabsTrigger>
        <TabsTrigger value="sync" className="text-xs"><RefreshCw className="h-3.5 w-3.5 mr-1" /> Sync</TabsTrigger>
      </TabsList>

      <TabsContent value="connection">
        <Card>
          <CardHeader><CardTitle className="text-lg">Testar Conexão</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label className="text-xs text-muted-foreground">Endpoint</Label><p className="text-sm font-mono bg-muted rounded px-2 py-1 truncate">{client.api_endpoint}</p></div>
              <div className="space-y-1"><Label className="text-xs text-muted-foreground">API Key</Label><p className="text-sm font-mono bg-muted rounded px-2 py-1">••••••{client.api_key?.slice(-6)}</p></div>
            </div>
            <Button onClick={handleTest} disabled={testing}><TestTube className="h-4 w-4 mr-2" />{testing ? "Testando..." : "Testar"}</Button>
            {testResult && (
              <div className={`rounded-lg border p-4 ${testResult.success ? "bg-green-50 border-green-200 dark:bg-green-950/20" : "bg-destructive/5 border-destructive/30"}`}>
                <div className="flex items-center gap-2">
                  {testResult.success ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-destructive" />}
                  <p className="font-medium">{testResult.message}</p>
                </div>
                {testResult.total_pages && <p className="text-sm text-muted-foreground mt-2">{testResult.total_pages} páginas, {testResult.total_records} registros ({testResult.mode})</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="mapping">
        <Card>
          <CardHeader><CardTitle className="text-lg">Mapeamento</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <Button onClick={handleFetchFields} disabled={fetchingFields} variant="outline">
                <RefreshCw className={`h-4 w-4 mr-2 ${fetchingFields ? "animate-spin" : ""}`} />{fetchingFields ? "Buscando..." : "Buscar campos"}
              </Button>
              <Button onClick={handleAutoMap} disabled={autoMapping}>
                <Link2 className={`h-4 w-4 mr-2 ${autoMapping ? "animate-spin" : ""}`} />{autoMapping ? "Mapeando..." : "Auto-mapear"}
              </Button>
            </div>
            {erpFields?.plans?.length > 0 && (
              <div className="space-y-2">
                {erpFields.plans.map((ep: string) => {
                  const mp = getMappingValue("plan", ep);
                  return (
                    <div key={ep} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
                      <div className="flex-1"><p className="text-sm font-medium">{ep}</p></div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <Select value={mp.trilhoId || ""} onValueChange={(v) => { const p = plans.find((x: any) => x.id === v); handleSaveMapping("plan", ep, p?.name || v, v); }}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>{plans.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      {mp.trilhoId && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="import">
        <Card>
          <CardHeader><CardTitle className="text-lg">Importação</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleImport} disabled={importing} size="lg">
              <Download className={`h-4 w-4 mr-2 ${importing ? "animate-bounce" : ""}`} />{importing ? "Importando..." : "Importar"}
            </Button>
            {(syncLogs as any[]).length > 0 && (
              <div className="space-y-2 mt-4">
                <h3 className="text-sm font-medium">Histórico</h3>
                {(syncLogs as any[]).map((log: any) => (
                  <div key={log.id} className="flex items-center justify-between p-3 rounded-lg border text-sm">
                    <div className="flex items-center gap-2">
                      {log.status === "success" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                      {log.status === "error" && <XCircle className="h-4 w-4 text-destructive" />}
                      {log.status === "running" && <Clock className="h-4 w-4 text-primary animate-spin" />}
                      <span className="capitalize">{log.sync_type}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {log.status === "success" && <span>{log.records_found}→{log.records_created}+{log.records_updated} </span>}
                      {new Date(log.created_at).toLocaleString("pt-BR")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="sync">
        <Card>
          <CardHeader><CardTitle className="text-lg">Sync Automático</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div>
                <p className="font-medium text-sm">Sync automático</p>
                <p className="text-xs text-muted-foreground">Importa periodicamente</p>
              </div>
              <Switch checked={client.auto_sync_enabled || false} onCheckedChange={handleToggleAutoSync} />
            </div>
            {client.auto_sync_enabled && (
              <Select value={String(client.sync_interval_minutes || 60)} onValueChange={handleChangeSyncInterval}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="60">1 hora</SelectItem>
                  <SelectItem value="360">6 horas</SelectItem>
                  <SelectItem value="1440">Diário</SelectItem>
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

// ====================== Main Page ======================
export default function IntegrationsPage() {
  const { data: tenantId } = useTenantId();
  const { roles } = useAuth();

  const isAdmin = roles.includes("admin") || roles.includes("super_admin");

  if (!tenantId) return <p className="text-muted-foreground p-4">Carregando...</p>;

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <QrCode className="h-6 w-6 text-green-600" />
            Meu WhatsApp
          </h1>
          <p className="text-sm text-muted-foreground">Conecte seu WhatsApp escaneando o QR Code abaixo.</p>
        </div>
        <OperatorWhatsApp tenantId={tenantId} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Link2 className="h-6 w-6 text-primary" />
          Integrações
        </h1>
        <p className="text-sm text-muted-foreground">Configure as integrações externas do seu sistema.</p>
      </div>

      <Tabs defaultValue="uazapi" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="uazapi" className="flex items-center gap-2"><QrCode className="h-4 w-4" /> UazapiGO</TabsTrigger>
          <TabsTrigger value="google" className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Google Maps</TabsTrigger>
          <TabsTrigger value="erp" className="flex items-center gap-2"><Database className="h-4 w-4" /> ERP / Associações</TabsTrigger>
        </TabsList>

        <TabsContent value="uazapi">
          <EvolutionApiIntegration tenantId={tenantId} />
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

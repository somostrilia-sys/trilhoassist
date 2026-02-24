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
  const [testing, setTesting] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ operator_id: "", instance_name: "", zapi_instance_id: "", zapi_token: "", zapi_security_token: "" });
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});

  // Fetch operators for this tenant
  const { data: operators = [] } = useQuery({
    queryKey: ["tenant-operators", tenantId],
    queryFn: async () => {
      const { data: userTenants } = await supabase
        .from("user_tenants")
        .select("user_id")
        .eq("tenant_id", tenantId);
      if (!userTenants?.length) return [];
      const userIds = userTenants.map((ut: any) => ut.user_id);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds)
        .in("role", ["operator", "admin"]);
      if (!roles?.length) return [];
      const opIds = [...new Set(roles.map((r: any) => r.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", opIds);
      return (profiles || []).map((p: any) => ({
        id: p.user_id,
        name: p.full_name || p.user_id.slice(0, 8),
        role: roles.find((r: any) => r.user_id === p.user_id)?.role || "operator",
      }));
    },
    enabled: !!tenantId,
  });

  // Fetch existing instances
  const { data: instances = [], isLoading } = useQuery({
    queryKey: ["zapi-instances", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("zapi_instances" as any)
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at");
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
  });

  const assignedOperatorIds = (instances as any[]).map((i: any) => i.operator_id);
  const availableOperators = operators.filter((o: any) => !assignedOperatorIds.includes(o.id) || o.id === form.operator_id);

  const resetForm = () => {
    setForm({ operator_id: "", instance_name: "", zapi_instance_id: "", zapi_token: "", zapi_security_token: "" });
    setEditingId(null);
  };

  const handleEdit = (instance: any) => {
    setEditingId(instance.id);
    setForm({
      operator_id: instance.operator_id,
      instance_name: instance.instance_name || "",
      zapi_instance_id: instance.zapi_instance_id,
      zapi_token: instance.zapi_token,
      zapi_security_token: instance.zapi_security_token || "",
    });
  };

  const handleSave = async () => {
    if (!form.operator_id || !form.zapi_instance_id || !form.zapi_token) {
      toast({ title: "Preencha operador, Instance ID e Token", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        tenant_id: tenantId,
        operator_id: form.operator_id,
        instance_name: form.instance_name || operators.find((o: any) => o.id === form.operator_id)?.name || "",
        zapi_instance_id: form.zapi_instance_id,
        zapi_token: form.zapi_token,
        zapi_security_token: form.zapi_security_token || null,
      };
      if (editingId) {
        const { error } = await supabase.from("zapi_instances" as any).update(payload as any).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("zapi_instances" as any).insert(payload as any);
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ["zapi-instances"] });
      toast({ title: editingId ? "Instância atualizada!" : "Instância adicionada!" });
      resetForm();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remover esta instância Z-API?")) return;
    const { error } = await supabase.from("zapi_instances" as any).delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey: ["zapi-instances"] });
      toast({ title: "Instância removida" });
    }
  };

  const handleTest = async (instance: any) => {
    setTesting(instance.id);
    try {
      const headers: Record<string, string> = {};
      if (instance.zapi_security_token) headers["Client-Token"] = instance.zapi_security_token;
      const response = await fetch(
        `https://api.z-api.io/instances/${instance.zapi_instance_id}/token/${instance.zapi_token}/status`,
        { headers }
      );
      if (response.ok) {
        const data = await response.json();
        const connected = data.connected === true;
        toast({
          title: connected ? "✅ Conectado!" : "⚠️ Instância encontrada",
          description: connected
            ? `WhatsApp conectado! ${data.smartphoneConnected ? "Smartphone online" : "Verificar smartphone"}`
            : `Status: ${JSON.stringify(data)}`,
        });
      } else {
        toast({ title: "Falha na conexão", description: `Status: ${response.status}`, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Erro de conexão", description: err.message, variant: "destructive" });
    } finally {
      setTesting(null);
    }
  };

  const getOperatorName = (opId: string) => operators.find((o: any) => o.id === opId)?.name || opId.slice(0, 8);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-green-600" />
                Z-API — Instâncias por Operador
              </CardTitle>
              <CardDescription>
                Cada operador conecta sua própria instância Z-API (WhatsApp) para distribuir o volume e reduzir risco de ban.
              </CardDescription>
            </div>
            <Badge variant={(instances as any[]).length > 0 ? "default" : "outline"}>
              {(instances as any[]).length} instância(s)
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Instructions */}
          <div className="rounded-lg border p-4 bg-muted/20 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-blue-500 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Como funciona</p>
                <ol className="text-xs text-muted-foreground list-decimal ml-4 mt-1 space-y-1">
                  <li>Crie uma instância Z-API para cada operador em <code className="bg-muted px-1 rounded">app.z-api.io</code></li>
                  <li>Cada operador escaneia o QR Code da sua instância com seu WhatsApp pessoal/comercial</li>
                  <li>Cadastre abaixo o <span className="font-medium">Instance ID</span>, <span className="font-medium">Token</span> e associe ao operador</li>
                  <li>Configure o webhook de cada instância apontando para: <code className="bg-muted px-1 rounded text-xs break-all">
                    {`https://gqczgatkouxjdcyxnubf.supabase.co/functions/v1/whatsapp-webhook?tenant=${tenantId}`}
                  </code></li>
                  <li>Quando o operador enviar mensagens no CRM, sairão pelo WhatsApp dele</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Existing instances */}
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : (instances as any[]).length > 0 ? (
            <div className="space-y-3">
              {(instances as any[]).map((inst: any) => (
                <div key={inst.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{inst.instance_name || getOperatorName(inst.operator_id)}</span>
                      <Badge variant="secondary" className="text-xs">{getOperatorName(inst.operator_id)}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">
                      ID: {inst.zapi_instance_id.slice(0, 12)}...
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleTest(inst)} disabled={testing === inst.id}>
                      <TestTube className="h-3 w-3 mr-1" />
                      {testing === inst.id ? "..." : "Testar"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleEdit(inst)}>Editar</Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(inst.id)}>
                      <XCircle className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma instância cadastrada. Adicione abaixo.</p>
          )}

          {/* Add/Edit form */}
          <div className="rounded-lg border p-4 space-y-4 bg-muted/10">
            <p className="text-sm font-medium">{editingId ? "Editar instância" : "Adicionar nova instância"}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Operador *</Label>
                <Select value={form.operator_id} onValueChange={(v) => setForm({ ...form, operator_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione o operador" /></SelectTrigger>
                  <SelectContent>
                    {availableOperators.map((op: any) => (
                      <SelectItem key={op.id} value={op.id}>{op.name} ({op.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nome da instância</Label>
                <Input value={form.instance_name} onChange={(e) => setForm({ ...form, instance_name: e.target.value })} placeholder="Ex: WhatsApp João" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Instance ID *</Label>
                <Input value={form.zapi_instance_id} onChange={(e) => setForm({ ...form, zapi_instance_id: e.target.value })} placeholder="3C67AB641C8A..." />
              </div>
              <div className="space-y-2">
                <Label>Token *</Label>
                <div className="relative">
                  <Input
                    value={form.zapi_token}
                    onChange={(e) => setForm({ ...form, zapi_token: e.target.value })}
                    placeholder="Token da instância"
                    type={showTokens["form_token"] ? "text" : "password"}
                  />
                  <button type="button" onClick={() => setShowTokens(p => ({ ...p, form_token: !p.form_token }))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showTokens["form_token"] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Security Token</Label>
                <div className="relative">
                  <Input
                    value={form.zapi_security_token}
                    onChange={(e) => setForm({ ...form, zapi_security_token: e.target.value })}
                    placeholder="Client-Token (opcional)"
                    type={showTokens["form_sec"] ? "text" : "password"}
                  />
                  <button type="button" onClick={() => setShowTokens(p => ({ ...p, form_sec: !p.form_sec }))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showTokens["form_sec"] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Salvando..." : editingId ? "Atualizar" : "Adicionar"}
              </Button>
              {editingId && (
                <Button variant="ghost" onClick={resetForm}>Cancelar</Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">O que a integração WhatsApp faz</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" /> Cada operador envia mensagens pelo seu próprio WhatsApp</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" /> Reduz risco de ban ao distribuir volume entre múltiplos números</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" /> Respostas do cliente voltam para o operador que enviou</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" /> CRM WhatsApp com fila de atendimento e histórico</li>
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

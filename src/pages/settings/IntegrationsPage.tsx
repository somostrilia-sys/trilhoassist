import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantId } from "@/hooks/useFinancialData";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Link2, TestTube, Download, RefreshCw, ArrowRight, CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export default function IntegrationsPage() {
  const { data: tenantId } = useTenantId();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [erpFields, setErpFields] = useState<any>(null);
  const [fetchingFields, setFetchingFields] = useState(false);

  // Clients with API configured
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

  // Plans for mapping
  const { data: plans = [] } = useQuery({
    queryKey: ["plans-for-mapping", selectedClientId],
    queryFn: async () => {
      const { data } = await supabase.from("plans").select("id, name").eq("client_id", selectedClientId!);
      return data ?? [];
    },
    enabled: !!selectedClientId,
  });

  // Existing mappings
  const { data: mappings = [] } = useQuery({
    queryKey: ["erp-mappings", selectedClientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("erp_field_mappings" as any)
        .select("*")
        .eq("client_id", selectedClientId!);
      return data ?? [];
    },
    enabled: !!selectedClientId,
  });

  // Sync logs
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
        await supabase
          .from("erp_field_mappings" as any)
          .update({ trilho_value: trilhoValue, trilho_id: trilhoId || null })
          .eq("id", existing.id);
      } else {
        await supabase.from("erp_field_mappings" as any).insert({
          client_id: selectedClientId,
          tenant_id: tenantId,
          field_type: fieldType,
          erp_value: erpValue,
          trilho_value: trilhoValue,
          trilho_id: trilhoId || null,
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
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Link2 className="h-6 w-6 text-primary" />
          Integrações ERP
        </h1>
        <p className="text-sm text-muted-foreground">
          Conecte, mapeie e importe dados de ERPs parceiros
        </p>
      </div>

      {/* Client selector */}
      <Card>
        <CardContent className="p-4">
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
                Nenhum cliente com API configurada. Configure o endpoint e chave no cadastro do cliente.
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

          {/* Connection Test */}
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
                    <div className="flex items-center gap-2 mb-2">
                      {testResult.success ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-red-600" />}
                      <p className={`font-medium ${testResult.success ? "text-green-800" : "text-red-800"}`}>
                        {testResult.message}
                      </p>
                    </div>
                    {testResult.sample_data && (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs text-muted-foreground">
                          {testResult.sample_data.total_records} registros encontrados
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Campos: {testResult.sample_data.keys?.join(", ")}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Field Mapping */}
          <TabsContent value="mapping">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Mapeamento de Campos</CardTitle>
                <CardDescription>Associe os valores do ERP aos equivalentes no Trilho</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button onClick={handleFetchFields} disabled={fetchingFields} variant="outline">
                  <RefreshCw className={`h-4 w-4 mr-2 ${fetchingFields ? "animate-spin" : ""}`} />
                  {fetchingFields ? "Buscando..." : "Buscar campos do ERP"}
                </Button>

                {erpFields && (
                  <div className="space-y-6">
                    {/* Plan mappings */}
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
                                <div className="flex-1">
                                  <p className="text-sm font-medium">{erpPlan}</p>
                                  <p className="text-xs text-muted-foreground">ERP</p>
                                </div>
                                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                <div className="flex-1">
                                  <Select
                                    value={mapping.trilhoId || ""}
                                    onValueChange={(v) => {
                                      const plan = plans.find((p: any) => p.id === v);
                                      handleSaveMapping("plan", erpPlan, plan?.name || v, v);
                                    }}
                                  >
                                    <SelectTrigger className="h-9">
                                      <SelectValue placeholder="Selecione plano Trilho" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {plans.map((p: any) => (
                                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                {mapping.trilhoId && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Cooperativa mappings */}
                    {erpFields.cooperativas?.length > 0 && (
                      <div className="space-y-3">
                        <h3 className="font-medium text-sm flex items-center gap-2">
                          <Badge variant="outline">Cooperativas</Badge>
                          <span className="text-muted-foreground text-xs">{erpFields.cooperativas.length} encontradas no ERP</span>
                        </h3>
                        <div className="space-y-2">
                          {erpFields.cooperativas.map((erpCoop: string) => {
                            const mapping = getMappingValue("cooperativa", erpCoop);
                            return (
                              <div key={erpCoop} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
                                <div className="flex-1">
                                  <p className="text-sm font-medium">{erpCoop}</p>
                                  <p className="text-xs text-muted-foreground">ERP</p>
                                </div>
                                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                <div className="flex-1">
                                  <Input
                                    placeholder="Nome no Trilho"
                                    defaultValue={mapping.trilhoValue}
                                    onBlur={(e) => handleSaveMapping("cooperativa", erpCoop, e.target.value)}
                                    className="h-9"
                                  />
                                </div>
                                {mapping.trilhoValue && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {erpFields.plans?.length === 0 && erpFields.cooperativas?.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        Nenhum campo de plano ou cooperativa encontrado nos dados do ERP.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Import */}
          <TabsContent value="import">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Importação de Beneficiários</CardTitle>
                <CardDescription>Importe dados do ERP para o Trilho</CardDescription>
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

                {/* Sync history */}
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
                            {log.status === "success" && (
                              <span>{log.records_found} encontrados • {log.records_created} criados • {log.records_updated} atualizados</span>
                            )}
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

          {/* Auto Sync */}
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
                  <Switch
                    checked={(selectedClient as any)?.auto_sync_enabled || false}
                    onCheckedChange={handleToggleAutoSync}
                  />
                </div>

                {(selectedClient as any)?.auto_sync_enabled && (
                  <div className="space-y-2">
                    <Label>Intervalo (minutos)</Label>
                    <Select
                      value={String((selectedClient as any)?.sync_interval_minutes || 60)}
                      onValueChange={handleChangeSyncInterval}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
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

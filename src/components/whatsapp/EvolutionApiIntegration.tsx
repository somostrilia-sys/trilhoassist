import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Wifi, WifiOff, QrCode, Plus, Trash2, RefreshCw, LogOut, CheckCircle2, AlertCircle, Loader2,
} from "lucide-react";

interface Props {
  tenantId: string;
}

export function EvolutionApiIntegration({ tenantId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState("");
  const [newOperatorId, setNewOperatorId] = useState("");
  const [qrCodeData, setQrCodeData] = useState<Record<string, string>>({});
  const [loadingQr, setLoadingQr] = useState<string | null>(null);
  const [waitingQr, setWaitingQr] = useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState<string | null>(null);
  const pollingRef = useRef<Record<string, number>>({});

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      Object.values(pollingRef.current).forEach(clearInterval);
    };
  }, []);

  // Fetch operators
  const { data: operators = [] } = useQuery({
    queryKey: ["tenant-operators-evo", tenantId],
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
      }));
    },
    enabled: !!tenantId,
  });

  // Fetch UazapiGO instances
  const { data: instances = [], isLoading } = useQuery({
    queryKey: ["uazapi-instances", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("zapi_instances" as any)
        .select("*")
        .eq("tenant_id", tenantId)
        .in("api_type", ["uazapi", "evolution"])
        .order("created_at");
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
  });

  // Auto-check real status when instances load
  const autoCheckedRef = useRef(false);
  useEffect(() => {
    if (!instances || (instances as any[]).length === 0 || autoCheckedRef.current) return;
    autoCheckedRef.current = true;
    (instances as any[]).forEach(async (inst: any) => {
      if (inst.connection_status === "connected") {
        try {
          const { data } = await supabase.functions.invoke("evolution-api", {
            body: { action: "check_status", tenant_id: tenantId, instance_db_id: inst.id },
          });
          if (data && !data.connected) {
            queryClient.invalidateQueries({ queryKey: ["uazapi-instances"] });
          }
        } catch { /* silent */ }
      }
    });
  }, [instances, tenantId, queryClient]);

  const assignedOperatorIds = (instances as any[]).map((i: any) => i.operator_id);
  const availableOperators = operators.filter((o: any) => !assignedOperatorIds.includes(o.id));

  const getOperatorName = (opId: string) =>
    operators.find((o: any) => o.id === opId)?.name || opId.slice(0, 8);

  // Start polling QR code every 3s
  const startQrPolling = (instanceId: string) => {
    // Clear existing
    if (pollingRef.current[instanceId]) {
      clearInterval(pollingRef.current[instanceId]);
    }

    pollingRef.current[instanceId] = setInterval(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("evolution-api", {
          body: {
            action: "get_qrcode",
            tenant_id: tenantId,
            instance_db_id: instanceId,
          },
        });
        if (error) return;

        if (data?.status === "connected") {
          // Connected! Stop polling
          clearInterval(pollingRef.current[instanceId]);
          delete pollingRef.current[instanceId];
          setQrCodeData((prev) => {
            const copy = { ...prev };
            delete copy[instanceId];
            return copy;
          });
          queryClient.invalidateQueries({ queryKey: ["uazapi-instances"] });
          toast({ title: "✅ WhatsApp conectado!" });
        } else if (data?.qrcode) {
          setWaitingQr(null);
          setQrCodeData((prev) => ({ ...prev, [instanceId]: data.qrcode }));
        }
      } catch {
        // Silently retry
      }
    }, 3000) as unknown as number;
  };

  const handleCreate = async () => {
    if (!newInstanceName.trim() || !newOperatorId) {
      toast({ title: "Preencha o nome e selecione o operador", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "create_instance",
          tenant_id: tenantId,
          operator_id: newOperatorId,
          instance_name: newInstanceName.trim().replace(/\s+/g, "_").toLowerCase(),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      queryClient.invalidateQueries({ queryKey: ["uazapi-instances"] });

      // Show QR code and start polling
      if (data?.qrcode?.base64 || data?.qrcode) {
        const qr = typeof data.qrcode === "string" ? data.qrcode : data.qrcode.base64;
        if (qr) {
          setQrCodeData((prev) => ({ ...prev, [data.instance.id]: qr }));
          startQrPolling(data.instance.id);
        }
      }

      toast({ title: "Instância criada! Escaneie o QR Code para conectar." });
      setNewInstanceName("");
      setNewOperatorId("");
    } catch (err: any) {
      toast({ title: "Erro ao criar instância", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleGetQrCode = async (instanceId: string) => {
    setLoadingQr(instanceId);
    try {
      const { data, error } = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "get_qrcode",
          tenant_id: tenantId,
          instance_db_id: instanceId,
        },
      });
      if (error) throw error;
      if (!data?.success && data?.error) throw new Error(data.error);

      if (data?.qrcode) {
        setWaitingQr(null);
        setQrCodeData((prev) => ({ ...prev, [instanceId]: data.qrcode }));
        startQrPolling(instanceId);
      } else if (data?.status === "connected") {
        setWaitingQr(null);
        toast({ title: "✅ Já conectado!", description: "WhatsApp já está conectado nesta instância." });
        queryClient.invalidateQueries({ queryKey: ["uazapi-instances"] });
      } else {
        // QR not ready yet (waiting_qr) — show spinner and start polling
        setWaitingQr(instanceId);
        startQrPolling(instanceId);
      }
    } catch (err: any) {
      toast({ title: "Erro ao buscar QR Code", description: err.message, variant: "destructive" });
    } finally {
      setLoadingQr(null);
    }
  };

  const handleCheckStatus = async (instanceId: string) => {
    setCheckingStatus(instanceId);
    try {
      const { data, error } = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "check_status",
          tenant_id: tenantId,
          instance_db_id: instanceId,
        },
      });
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["uazapi-instances"] });
      toast({
        title: data?.connected ? "✅ Conectado!" : "❌ Desconectado",
        description: `Estado: ${data?.state || "desconhecido"}`,
      });
    } catch (err: any) {
      toast({ title: "Erro ao verificar status", description: err.message, variant: "destructive" });
    } finally {
      setCheckingStatus(null);
    }
  };

  const handleDelete = async (instanceId: string) => {
    if (!confirm("Remover esta instância? O WhatsApp será desconectado.")) return;
    try {
      // Stop polling
      if (pollingRef.current[instanceId]) {
        clearInterval(pollingRef.current[instanceId]);
        delete pollingRef.current[instanceId];
      }

      const { error } = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "delete_instance",
          tenant_id: tenantId,
          instance_db_id: instanceId,
        },
      });
      if (error) throw error;

      setQrCodeData((prev) => {
        const copy = { ...prev };
        delete copy[instanceId];
        return copy;
      });
      queryClient.invalidateQueries({ queryKey: ["uazapi-instances"] });
      toast({ title: "Instância removida" });
    } catch (err: any) {
      toast({ title: "Erro ao remover", description: err.message, variant: "destructive" });
    }
  };

  const handleLogout = async (instanceId: string) => {
    if (!confirm("Desconectar o WhatsApp desta instância?")) return;
    try {
      const { error } = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "logout",
          tenant_id: tenantId,
          instance_db_id: instanceId,
        },
      });
      if (error) throw error;

      setQrCodeData((prev) => {
        const copy = { ...prev };
        delete copy[instanceId];
        return copy;
      });
      queryClient.invalidateQueries({ queryKey: ["uazapi-instances"] });
      toast({ title: "WhatsApp desconectado" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <QrCode className="h-5 w-5 text-green-600" />
                UazapiGO — Instâncias com QR Code
              </CardTitle>
              <CardDescription>
                Cada operador conecta seu WhatsApp escaneando um QR Code diretamente no sistema. Sem custo por instância.
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
              <AlertCircle className="h-4 w-4 text-green-500 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Como funciona</p>
                <ol className="text-xs text-muted-foreground list-decimal ml-4 mt-1 space-y-1">
                  <li>Configure o <span className="font-medium">Server URL</span> e <span className="font-medium">Admin Token</span> do UazapiGO nos Ajustes</li>
                  <li>Crie uma instância abaixo e associe a um operador</li>
                  <li>Um QR Code será gerado automaticamente (atualiza a cada 3s)</li>
                  <li>O operador escaneia o QR Code com o WhatsApp do celular</li>
                  <li>Pronto! Mensagens enviadas no CRM sairão pelo WhatsApp do operador</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Existing instances */}
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : (instances as any[]).length > 0 ? (
            <div className="space-y-4">
              {(instances as any[]).map((inst: any) => {
                const isConnected = inst.connection_status === "connected";
                const qr = qrCodeData[inst.id];

                return (
                  <div key={inst.id} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          {isConnected ? (
                            <Wifi className="h-4 w-4 text-green-600" />
                          ) : (
                            <WifiOff className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="font-medium text-sm">
                            {inst.instance_name || inst.evolution_instance_name}
                          </span>
                          <Badge variant={isConnected ? "default" : "secondary"} className="text-xs">
                            {isConnected ? "Conectado" : "Desconectado"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Operador: {getOperatorName(inst.operator_id)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {!isConnected && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleGetQrCode(inst.id)}
                            disabled={loadingQr === inst.id}
                          >
                            {loadingQr === inst.id ? (
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            ) : (
                              <QrCode className="h-3 w-3 mr-1" />
                            )}
                            QR Code
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCheckStatus(inst.id)}
                          disabled={checkingStatus === inst.id}
                        >
                          {checkingStatus === inst.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                        </Button>
                        {isConnected && (
                          <Button size="sm" variant="ghost" onClick={() => handleLogout(inst.id)}>
                            <LogOut className="h-3 w-3" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => handleDelete(inst.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Waiting for QR Code */}
                    {waitingQr === inst.id && !qr && !isConnected && (
                      <div className="flex flex-col items-center gap-3 py-6 bg-muted/30 rounded-lg border">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm font-medium">Gerando QR Code...</p>
                        <p className="text-xs text-muted-foreground">
                          Aguarde, o QR Code será exibido automaticamente.
                        </p>
                      </div>
                    )}

                    {/* QR Code display */}
                    {qr && !isConnected && (
                      <div className="flex flex-col items-center gap-3 py-4 bg-white rounded-lg border">
                        <p className="text-sm font-medium text-gray-700">
                          Escaneie com o WhatsApp do operador
                        </p>
                        <img
                          src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`}
                          alt="QR Code WhatsApp"
                          className="w-64 h-64"
                        />
                        <p className="text-xs text-muted-foreground">
                          Abra o WhatsApp → Menu → Aparelhos conectados → Conectar
                        </p>
                        <p className="text-xs text-green-600 flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Aguardando conexão... (atualiza automaticamente)
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma instância criada. Adicione abaixo para conectar o WhatsApp de um operador.
            </p>
          )}

          {/* Create new instance */}
          <div className="rounded-lg border p-4 space-y-4 bg-muted/10">
            <p className="text-sm font-medium">Criar nova instância</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Operador *</Label>
                <Select value={newOperatorId} onValueChange={setNewOperatorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o operador" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableOperators.map((op: any) => (
                      <SelectItem key={op.id} value={op.id}>
                        {op.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nome da instância *</Label>
                <Input
                  value={newInstanceName}
                  onChange={(e) => setNewInstanceName(e.target.value)}
                  placeholder="Ex: whatsapp-joao"
                />
              </div>
            </div>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              {creating ? "Criando..." : "Criar e gerar QR Code"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Vantagens do UazapiGO</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" /> QR Code direto no sistema — sem acessar painel externo
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" /> Sem custo por instância (self-hosted)
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" /> Cada operador usa seu próprio número
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" /> Webhook automático configurado na criação
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" /> Polling automático do QR Code (3s)
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  Wifi, WifiOff, QrCode, RefreshCw, LogOut, Loader2, Smartphone,
} from "lucide-react";

interface Props {
  tenantId: string;
}

export function OperatorWhatsApp({ tenantId }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [waitingQr, setWaitingQr] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const pollingRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // Fetch only this operator's instance
  const { data: myInstance, isLoading } = useQuery({
    queryKey: ["my-whatsapp-instance", user?.id, tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("zapi_instances" as any)
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("operator_id", user!.id)
        .in("api_type", ["uazapi", "evolution"])
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!tenantId && !!user,
  });
  const instance = myInstance as any;

  // Health-check polling every 60s
  useEffect(() => {
    if (!instance || !tenantId) return;

    const interval = setInterval(async () => {
      try {
        const { data } = await supabase.functions.invoke("evolution-api", {
          body: { action: "check_status", tenant_id: tenantId, instance_db_id: instance.id },
        });
        if (data && instance.connection_status !== (data.connected ? "connected" : "disconnected")) {
          queryClient.invalidateQueries({ queryKey: ["my-whatsapp-instance"] });
        }
      } catch { /* silent */ }
    }, 60000);

    return () => clearInterval(interval);
  }, [instance, tenantId, queryClient]);

  const startQrPolling = (instanceId: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);

    pollingRef.current = setInterval(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("evolution-api", {
          body: { action: "get_qrcode", tenant_id: tenantId, instance_db_id: instanceId },
        });
        if (error) return;

        if (data?.status === "connected") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setQrCodeData(null);
          setWaitingQr(false);
          queryClient.invalidateQueries({ queryKey: ["my-whatsapp-instance"] });
          toast({ title: "✅ WhatsApp conectado!" });
        } else if (data?.qrcode) {
          setWaitingQr(false);
          setQrCodeData(data.qrcode);
        }
      } catch { /* retry */ }
    }, 3000) as unknown as number;
  };

  const handleCreateAndConnect = async () => {
    if (!user) return;
    setCreating(true);
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .single();

      const name = (profile?.full_name || user.email || "operador")
        .toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

      const { data, error } = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "create_instance",
          tenant_id: tenantId,
          operator_id: user.id,
          instance_name: `whatsapp_${name}`,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      queryClient.invalidateQueries({ queryKey: ["my-whatsapp-instance"] });

      if (data?.qrcode?.base64 || data?.qrcode) {
        const qr = typeof data.qrcode === "string" ? data.qrcode : data.qrcode.base64;
        if (qr) {
          setQrCodeData(qr);
          startQrPolling(data.instance.id);
        }
      }

      toast({ title: "Instância criada! Escaneie o QR Code." });
    } catch (err: any) {
      toast({ title: "Erro ao criar instância", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleGetQrCode = async () => {
    if (!instance) return;
    setLoadingQr(true);
    try {
      const { data, error } = await supabase.functions.invoke("evolution-api", {
        body: { action: "get_qrcode", tenant_id: tenantId, instance_db_id: instance.id },
      });
      if (error) throw error;

      if (data?.qrcode) {
        setWaitingQr(false);
        setQrCodeData(data.qrcode);
        startQrPolling(instance.id);
      } else if (data?.status === "connected") {
        toast({ title: "✅ Já conectado!" });
        queryClient.invalidateQueries({ queryKey: ["my-whatsapp-instance"] });
      } else {
        setWaitingQr(true);
        startQrPolling(instance.id);
      }
    } catch (err: any) {
      toast({ title: "Erro ao buscar QR Code", description: err.message, variant: "destructive" });
    } finally {
      setLoadingQr(false);
    }
  };

  const handleCheckStatus = async () => {
    if (!instance) return;
    setCheckingStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke("evolution-api", {
        body: { action: "check_status", tenant_id: tenantId, instance_db_id: instance.id },
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["my-whatsapp-instance"] });
      toast({
        title: data?.connected ? "✅ Conectado!" : "❌ Desconectado",
        description: `Estado: ${data?.state || "desconhecido"}`,
      });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleLogout = async () => {
    if (!instance || !confirm("Desconectar seu WhatsApp?")) return;
    try {
      const { data, error } = await supabase.functions.invoke("evolution-api", {
        body: { action: "logout", tenant_id: tenantId, instance_db_id: instance.id },
      });
      if (error) throw error;
      setQrCodeData(null);
      queryClient.invalidateQueries({ queryKey: ["my-whatsapp-instance"] });
      if (data?.still_connected) {
        toast({
          title: "⚠️ Sessão ainda ativa",
          description: `Estado: ${data?.state || "desconhecido"}. Tente novamente em alguns segundos.`,
          variant: "destructive",
        });
      } else {
        toast({ title: "✅ WhatsApp desconectado" });
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const isConnected = instance?.connection_status === "connected";

  // No instance yet — show create button
  if (!instance) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-green-600" />
            Conectar meu WhatsApp
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Você ainda não possui uma instância de WhatsApp conectada. Clique abaixo para criar e escanear o QR Code.
          </p>
          <Button onClick={handleCreateAndConnect} disabled={creating} size="lg" className="w-full">
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <QrCode className="h-4 w-4 mr-2" />
            )}
            {creating ? "Criando instância..." : "Conectar WhatsApp"}
          </Button>

          {/* Show QR after creation */}
          {waitingQr && !qrCodeData && (
            <div className="flex flex-col items-center gap-3 py-6 bg-muted/30 rounded-lg border">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium">Gerando QR Code...</p>
            </div>
          )}
          {qrCodeData && (
            <div className="flex flex-col items-center gap-3 py-4 bg-white rounded-lg border">
              <p className="text-sm font-medium text-gray-700">
                Escaneie com seu WhatsApp
              </p>
              <img
                src={qrCodeData.startsWith("data:") ? qrCodeData : `data:image/png;base64,${qrCodeData}`}
                alt="QR Code WhatsApp"
                className="w-64 h-64"
              />
              <p className="text-xs text-muted-foreground">
                Abra o WhatsApp → Menu → Aparelhos conectados → Conectar
              </p>
              <p className="text-xs text-green-600 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Aguardando conexão...
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Instance exists — show status
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-green-600" />
            Meu WhatsApp
          </CardTitle>
          <Badge variant={isConnected ? "default" : "secondary"}>
            {isConnected ? (
              <span className="flex items-center gap-1"><Wifi className="h-3 w-3" /> Conectado</span>
            ) : (
              <span className="flex items-center gap-1"><WifiOff className="h-3 w-3" /> Desconectado</span>
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Instância:</span>
          <span className="font-medium text-foreground">{instance.instance_name || instance.evolution_instance_name}</span>
        </div>

        <div className="flex items-center gap-2">
          {!isConnected && (
            <Button onClick={handleGetQrCode} disabled={loadingQr} variant="default">
              {loadingQr ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <QrCode className="h-4 w-4 mr-2" />
              )}
              Gerar QR Code
            </Button>
          )}
          <Button onClick={handleCheckStatus} disabled={checkingStatus} variant="outline" size="sm">
            {checkingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          {isConnected && (
            <Button onClick={handleLogout} variant="ghost" size="sm">
              <LogOut className="h-4 w-4 mr-1" /> Desconectar
            </Button>
          )}
        </div>

        {/* Waiting for QR Code */}
        {waitingQr && !qrCodeData && !isConnected && (
          <div className="flex flex-col items-center gap-3 py-6 bg-muted/30 rounded-lg border">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium">Gerando QR Code...</p>
          </div>
        )}

        {/* QR Code display */}
        {qrCodeData && !isConnected && (
          <div className="flex flex-col items-center gap-3 py-4 bg-white rounded-lg border">
            <p className="text-sm font-medium text-gray-700">
              Escaneie com seu WhatsApp
            </p>
            <img
              src={qrCodeData.startsWith("data:") ? qrCodeData : `data:image/png;base64,${qrCodeData}`}
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
      </CardContent>
    </Card>
  );
}

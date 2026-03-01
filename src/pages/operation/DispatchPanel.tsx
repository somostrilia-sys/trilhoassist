import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import {
  AlertTriangle, Clock, Siren, Volume2, VolumeX,
  User, MapPin, Car, ExternalLink, CheckCircle2, Timer, PauseCircle, PlayCircle,
} from "lucide-react";

const serviceTypeMap: Record<string, string> = {
  tow_light: "R. Leve", tow_heavy: "R. Pesado", tow_motorcycle: "R. Moto",
  locksmith: "Chaveiro", tire_change: "Pneu", battery: "Bateria",
  fuel: "Combustível", lodging: "Hospedagem", collision: "Colisão", other: "Outro",
};

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  open: { label: "Aberto", variant: "outline" },
  awaiting_dispatch: { label: "Aguard. Acionamento", variant: "secondary" },
  dispatched: { label: "Acionado", variant: "default" },
  in_progress: { label: "Em Andamento", variant: "default" },
  paused: { label: "Pausado", variant: "destructive" },
};

function playSiren() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sawtooth";
    gain.gain.setValueAtTime(0.3, ctx.currentTime);

    // Siren sweep
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.5);
    osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 1.0);
    osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 1.5);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 2);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 2);
  } catch {}
}

function minutesElapsed(dateStr: string): number {
  return Math.max(0, (Date.now() - new Date(dateStr).getTime()) / 60000);
}

function formatElapsed(minutes: number): string {
  if (minutes < 1) return "< 1min";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

interface PanelItem {
  request: any;
  dispatch: any | null;
  elapsedSinceCreation: number;
  elapsedSinceDispatch: number | null;
  alertDispatch: boolean;
  alertLate: boolean;
}

export default function DispatchPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<any[]>([]);
  const [dispatches, setDispatches] = useState<any[]>([]);
  const [alertDispatchMin, setAlertDispatchMin] = useState(15);
  const [alertLateMin, setAlertLateMin] = useState(10);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [pausedIds, setPausedIds] = useState<Set<string>>(new Set());
  const lastAlertRef = useRef<Set<string>>(new Set());
  const tickRef = useRef(0);
  const [tick, setTick] = useState(0);

  // Load tenant settings + active requests
  const loadData = useCallback(async () => {
    if (!user?.id) return;

    const { data: ut } = await supabase
      .from("user_tenants")
      .select("tenant_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (ut?.tenant_id) {
      const { data: tenant } = await supabase
        .from("tenants_safe")
        .select("alert_dispatch_minutes, alert_late_minutes")
        .eq("id", ut.tenant_id)
        .single();
      if (tenant) {
        setAlertDispatchMin((tenant as any).alert_dispatch_minutes ?? 15);
        setAlertLateMin((tenant as any).alert_late_minutes ?? 10);
      }
    }

    const { data: reqs } = await supabase
      .from("service_requests")
      .select("*")
      .in("status", ["open", "awaiting_dispatch", "dispatched", "in_progress"])
      .order("created_at", { ascending: true });

    setRequests(reqs || []);

    if (reqs && reqs.length > 0) {
      const { data: disps } = await supabase
        .from("dispatches")
        .select("*, providers(name)")
        .in("service_request_id", reqs.map((r) => r.id))
        .in("status", ["pending", "sent", "accepted"])
        .order("created_at", { ascending: false });
      setDispatches(disps || []);
    } else {
      setDispatches([]);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel("dispatch-panel")
      .on("postgres_changes", { event: "*", schema: "public", table: "service_requests" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "dispatches" }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  // Tick every 30s to update elapsed times
  useEffect(() => {
    const iv = setInterval(() => {
      tickRef.current += 1;
      setTick(tickRef.current);
    }, 30000);
    return () => clearInterval(iv);
  }, []);

  // Build panel items
  const items: PanelItem[] = useMemo(() => {
    // Exclude collision requests without tow (no destination = no dispatch needed)
    const filtered = requests.filter((r) => !(r.service_type === "collision" && !r.destination_address));
    return filtered.map((r) => {
      const disp = dispatches.find((d) => d.service_request_id === r.id);
      const elapsedSinceCreation = minutesElapsed(r.created_at);
      const elapsedSinceDispatch = disp?.accepted_at
        ? minutesElapsed(disp.accepted_at)
        : null;

      // Alert: no dispatch for too long
      const noDispatch = !disp || disp.status === "pending" || disp.status === "sent";
      const alertDispatch = noDispatch && elapsedSinceCreation >= alertDispatchMin;

      // Alert: provider late (accepted but ETA exceeded)
      const alertLate = disp?.status === "accepted" && disp.estimated_arrival_min
        ? (elapsedSinceDispatch ?? 0) >= (disp.estimated_arrival_min + alertLateMin)
        : false;

      return { request: r, dispatch: disp, elapsedSinceCreation, elapsedSinceDispatch, alertDispatch, alertLate };
    }).sort((a, b) => {
      // Alerts first
      const aAlert = a.alertDispatch || a.alertLate ? 1 : 0;
      const bAlert = b.alertDispatch || b.alertLate ? 1 : 0;
      if (aAlert !== bAlert) return bAlert - aAlert;
      return a.elapsedSinceCreation - b.elapsedSinceCreation;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, dispatches, alertDispatchMin, alertLateMin, tick]);

  // Play siren for new alerts
  useEffect(() => {
    if (!soundEnabled) return;
    const alertIds = items
      .filter((i) => (i.alertDispatch || i.alertLate) && !pausedIds.has(i.request.id))
      .map((i) => i.request.id);

    const newAlerts = alertIds.filter((id) => !lastAlertRef.current.has(id));
    if (newAlerts.length > 0) {
      playSiren();
      lastAlertRef.current = new Set(alertIds);
    }
  }, [items, soundEnabled]);

  const alertCount = items.filter((i) => i.alertDispatch || i.alertLate).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Siren className="h-6 w-6 text-primary" />
            Painel de Acionamentos
          </h1>
          <p className="text-sm text-muted-foreground">
            {items.length} atendimento(s) ativo(s)
            {alertCount > 0 && (
              <span className="text-destructive font-medium ml-2">
                • {alertCount} alerta(s)
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs gap-1">
            <Clock className="h-3 w-3" />
            Despacho: {alertDispatchMin}min
          </Badge>
          <Badge variant="outline" className="text-xs gap-1">
            <Timer className="h-3 w-3" />
            Atraso: {alertLateMin}min
          </Badge>
          <Button
            variant={soundEnabled ? "default" : "outline"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setSoundEnabled(!soundEnabled)}
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {loading && <p className="text-muted-foreground">Carregando...</p>}

      {!loading && items.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Nenhum atendimento ativo no momento</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map((item) => {
          const r = item.request;
          const d = item.dispatch;
          const hasAlert = item.alertDispatch || item.alertLate;

          return (
            <Card
              key={r.id}
              className={
                pausedIds.has(r.id)
                  ? "border-muted opacity-60"
                  : hasAlert
                    ? "border-destructive/50 bg-destructive/5 animate-pulse"
                    : ""
              }
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-mono">{r.protocol}</CardTitle>
                  <Badge variant={statusLabels[r.status]?.variant || "outline"}>
                    {statusLabels[r.status]?.label || r.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {/* Alerts */}
                {pausedIds.has(r.id) && (
                  <div className="flex items-center gap-2 text-xs font-medium bg-muted rounded px-2 py-1">
                    <PauseCircle className="h-3.5 w-3.5" />
                    Acionamento pausado
                  </div>
                )}
                {item.alertDispatch && !pausedIds.has(r.id) && (
                  <div className="flex items-center gap-2 text-xs text-destructive font-medium bg-destructive/10 rounded px-2 py-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Sem acionamento há {formatElapsed(item.elapsedSinceCreation)}
                  </div>
                )}
                {item.alertLate && !pausedIds.has(r.id) && (
                  <div className="flex items-center gap-2 text-xs text-destructive font-medium bg-destructive/10 rounded px-2 py-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Prestador atrasado ({formatElapsed(item.elapsedSinceDispatch ?? 0)} / ETA {d.estimated_arrival_min}min)
                  </div>
                )}

                {/* Info */}
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate">{r.requester_name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Car className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{serviceTypeMap[r.service_type] || r.service_type}</span>
                    {r.vehicle_plate && <Badge variant="outline" className="text-xs ml-1">{r.vehicle_plate}</Badge>}
                  </div>
                  {r.origin_address && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="truncate text-xs">{r.origin_address}</span>
                    </div>
                  )}
                </div>

                {/* Provider info */}
                {d && (
                  <div className="border-t pt-2 text-xs space-y-1">
                    <p className="font-medium">{(d as any).providers?.name || "Prestador"}</p>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span>Status: {d.status}</span>
                      {d.estimated_arrival_min && <span>ETA: {d.estimated_arrival_min}min</span>}
                      {d.provider_arrived_at && (
                        <span className="text-success font-medium flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Chegou
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Timer */}
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatElapsed(item.elapsedSinceCreation)}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs gap-1"
                      onClick={() => {
                        setPausedIds(prev => {
                          const next = new Set(prev);
                          if (next.has(r.id)) {
                            next.delete(r.id);
                            toast({ title: "Acionamento retomado", description: r.protocol });
                          } else {
                            next.add(r.id);
                            toast({ title: "Acionamento pausado", description: r.protocol });
                          }
                          return next;
                        });
                      }}
                    >
                      {pausedIds.has(r.id) ? (
                        <><PlayCircle className="h-3 w-3" /> Retomar</>
                      ) : (
                        <><PauseCircle className="h-3 w-3" /> Pausar</>
                      )}
                    </Button>
                    <Link to={`/operation/requests/${r.id}`}>
                      <Button variant="ghost" size="sm" className="h-6 text-xs gap-1">
                        <ExternalLink className="h-3 w-3" /> Ver
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

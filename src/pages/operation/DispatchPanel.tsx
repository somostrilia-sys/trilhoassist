import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertTriangle, Clock, Siren, Volume2, VolumeX,
  User, MapPin, Car, ExternalLink, CheckCircle2, Timer, PauseCircle, PlayCircle,
} from "lucide-react";

const serviceTypeMap: Record<string, string> = {
  tow_light: "R. Leve", tow_heavy: "R. Pesado", tow_motorcycle: "R. Moto", tow_utility: "R. Utilitário",
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

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

interface PauseRecord {
  id: string;
  service_request_id: string;
  paused_by: string;
  paused_by_name: string | null;
  justification: string;
  paused_at: string;
  resumed_at: string | null;
  resumed_by: string | null;
  resumed_by_name: string | null;
  tenant_id: string;
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
  const [reopenMap, setReopenMap] = useState<Record<string, string>>({});
  const [alertDispatchMin, setAlertDispatchMin] = useState(15);
  const [alertLateMin, setAlertLateMin] = useState(10);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [pauses, setPauses] = useState<PauseRecord[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [userFullName, setUserFullName] = useState<string>("");
  const lastAlertRef = useRef<Set<string>>(new Set());
  const tickRef = useRef(0);
  const [tick, setTick] = useState(0);

  // Pause dialog state
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false);
  const [pauseTarget, setPauseTarget] = useState<any>(null);
  const [pauseJustification, setPauseJustification] = useState("");
  const [pauseSubmitting, setPauseSubmitting] = useState(false);

  // Active pauses map: service_request_id -> PauseRecord
  const activePauses = useMemo(() => {
    const map: Record<string, PauseRecord> = {};
    for (const p of pauses) {
      if (!p.resumed_at) {
        map[p.service_request_id] = p;
      }
    }
    return map;
  }, [pauses]);

  // Recently resumed pauses (last hour) for showing resume info
  const recentResumed = useMemo(() => {
    const map: Record<string, PauseRecord> = {};
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const p of pauses) {
      if (p.resumed_at && new Date(p.resumed_at).getTime() > oneHourAgo) {
        // Keep most recent
        if (!map[p.service_request_id] || new Date(p.resumed_at) > new Date(map[p.service_request_id].resumed_at!)) {
          map[p.service_request_id] = p;
        }
      }
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pauses, tick]);

  // Load user name
  useEffect(() => {
    if (!user?.id) return;
    supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data?.full_name) setUserFullName(data.full_name); });
  }, [user?.id]);

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
      setTenantId(ut.tenant_id);
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
      const reqIds = reqs.map((r) => r.id);

      const [dispResult, reopenResult, pauseResult] = await Promise.all([
        supabase
          .from("dispatches")
          .select("*, providers(name)")
          .in("service_request_id", reqIds)
          .in("status", ["pending", "sent", "accepted"])
          .order("created_at", { ascending: false }),
        supabase
          .from("service_request_events")
          .select("service_request_id, created_at")
          .in("service_request_id", reqIds)
          .in("event_type", ["status_change", "reopen"])
          .eq("new_value", "open")
          .order("created_at", { ascending: false }),
        supabase
          .from("dispatch_pauses")
          .select("*")
          .in("service_request_id", reqIds)
          .order("paused_at", { ascending: false }),
      ]);

      setDispatches(dispResult.data || []);
      setPauses((pauseResult.data as PauseRecord[]) || []);

      const rMap: Record<string, string> = {};
      for (const ev of (reopenResult.data || [])) {
        if (!rMap[ev.service_request_id]) {
          rMap[ev.service_request_id] = ev.created_at;
        }
      }
      setReopenMap(rMap);
    } else {
      setDispatches([]);
      setReopenMap({});
      setPauses([]);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel("dispatch-panel")
      .on("postgres_changes", { event: "*", schema: "public", table: "service_requests" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "dispatches" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "dispatch_pauses" }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  // Tick every 30s
  useEffect(() => {
    const iv = setInterval(() => {
      tickRef.current += 1;
      setTick(tickRef.current);
    }, 30000);
    return () => clearInterval(iv);
  }, []);

  // Build panel items
  const items: PanelItem[] = useMemo(() => {
    const filtered = requests.filter((r) => !(r.service_type === "collision" && !r.destination_address));
    return filtered.map((r) => {
      const disp = dispatches.find((d) => d.service_request_id === r.id);
      const effectiveCreatedAt = reopenMap[r.id] || r.created_at;
      const elapsedSinceCreation = minutesElapsed(effectiveCreatedAt);
      const elapsedSinceDispatch = disp?.accepted_at ? minutesElapsed(disp.accepted_at) : null;

      const noDispatch = !disp || disp.status === "pending" || disp.status === "sent";
      const isScheduled = !!r.scheduled_date;
      let alertDispatch = false;
      if (noDispatch) {
        if (isScheduled) {
          const schedStr = r.scheduled_date + "T" + (r.scheduled_time || "00:00") + ":00";
          const schedTime = new Date(schedStr).getTime();
          alertDispatch = Date.now() > schedTime;
        } else {
          alertDispatch = elapsedSinceCreation >= alertDispatchMin;
        }
      }

      let alertLate = false;
      if (disp?.status === "accepted" && !disp.provider_arrived_at) {
        if (disp.scheduled_arrival_date) {
          const scheduledStr = disp.scheduled_arrival_date + "T" + (disp.scheduled_arrival_time || "00:00") + ":00";
          const scheduledTime = new Date(scheduledStr).getTime();
          alertLate = Date.now() > scheduledTime + alertLateMin * 60000;
        } else if (disp.estimated_arrival_min) {
          alertLate = (elapsedSinceDispatch ?? 0) >= (disp.estimated_arrival_min + alertLateMin);
        }
      }

      return { request: r, dispatch: disp, elapsedSinceCreation, elapsedSinceDispatch, alertDispatch, alertLate };
    }).sort((a, b) => {
      const aAlert = a.alertDispatch || a.alertLate ? 1 : 0;
      const bAlert = b.alertDispatch || b.alertLate ? 1 : 0;
      if (aAlert !== bAlert) return bAlert - aAlert;
      return a.elapsedSinceCreation - b.elapsedSinceCreation;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, dispatches, reopenMap, alertDispatchMin, alertLateMin, tick]);

  // Play siren for new alerts
  useEffect(() => {
    if (!soundEnabled) return;
    const alertIds = items
      .filter((i) => (i.alertDispatch || i.alertLate) && !activePauses[i.request.id])
      .map((i) => i.request.id);
    const newAlerts = alertIds.filter((id) => !lastAlertRef.current.has(id));
    if (newAlerts.length > 0) {
      playSiren();
      lastAlertRef.current = new Set(alertIds);
    }
  }, [items, soundEnabled, activePauses]);

  // Recurring siren every 15 minutes
  useEffect(() => {
    if (!soundEnabled) return;
    const interval = setInterval(() => {
      const hasActiveAlerts = items.some(
        (i) => (i.alertDispatch || i.alertLate) && !activePauses[i.request.id]
      );
      if (hasActiveAlerts) playSiren();
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [items, soundEnabled, activePauses]);

  // Handle pause
  const handlePause = async () => {
    if (!pauseTarget || !pauseJustification.trim() || !user?.id || !tenantId) return;
    setPauseSubmitting(true);
    const { error } = await supabase.from("dispatch_pauses").insert({
      service_request_id: pauseTarget.id,
      paused_by: user.id,
      paused_by_name: userFullName || user.email || "Operador",
      justification: pauseJustification.trim(),
      tenant_id: tenantId,
    });
    setPauseSubmitting(false);
    if (error) {
      toast({ title: "Erro ao pausar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Acionamento pausado", description: pauseTarget.protocol });
      setPauseDialogOpen(false);
      setPauseJustification("");
      setPauseTarget(null);
    }
  };

  // Handle resume
  const handleResume = async (requestId: string, protocol: string) => {
    const pause = activePauses[requestId];
    if (!pause || !user?.id) return;
    const { error } = await supabase.from("dispatch_pauses").update({
      resumed_at: new Date().toISOString(),
      resumed_by: user.id,
      resumed_by_name: userFullName || user.email || "Operador",
    }).eq("id", pause.id);
    if (error) {
      toast({ title: "Erro ao retomar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Acionamento retomado", description: protocol });
    }
  };

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
          const isPaused = !!activePauses[r.id];
          const activePause = activePauses[r.id];
          const resumed = recentResumed[r.id];

          return (
            <Card
              key={r.id}
              className={
                isPaused
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
                {/* Active pause info */}
                {isPaused && activePause && (
                  <div className="bg-muted rounded px-2 py-1.5 space-y-0.5">
                    <div className="flex items-center gap-2 text-xs font-medium">
                      <PauseCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      Pausado por {activePause.paused_by_name || "Operador"}
                    </div>
                    <p className="text-xs text-muted-foreground italic ml-5">
                      "{activePause.justification}"
                    </p>
                    <p className="text-xs text-muted-foreground ml-5">
                      Pausado às {formatTime(activePause.paused_at)}
                    </p>
                  </div>
                )}

                {/* Recently resumed info */}
                {!isPaused && resumed && (
                  <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded px-2 py-1.5 space-y-0.5">
                    <div className="flex items-center gap-2 text-xs font-medium text-green-700 dark:text-green-400">
                      <PlayCircle className="h-3.5 w-3.5" />
                      Retomado por {resumed.resumed_by_name || "Operador"} às {formatTime(resumed.resumed_at!)}
                    </div>
                    <p className="text-xs text-green-600 dark:text-green-500 ml-5">
                      Pausado por {resumed.paused_by_name || "Operador"} às {formatTime(resumed.paused_at)} — "{resumed.justification}"
                    </p>
                  </div>
                )}

                {/* Alerts */}
                {item.alertDispatch && !isPaused && (
                  <div className="flex items-center gap-2 text-xs text-destructive font-medium bg-destructive/10 rounded px-2 py-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Sem acionamento há {formatElapsed(item.elapsedSinceCreation)}
                  </div>
                )}
                {item.alertLate && !isPaused && (
                  <div className="flex items-center gap-2 text-xs text-destructive font-medium bg-destructive/10 rounded px-2 py-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {d?.scheduled_arrival_date
                      ? `Prestador atrasado — agendado para ${new Date(d.scheduled_arrival_date + "T" + (d.scheduled_arrival_time || "00:00")).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${(d.scheduled_arrival_time || "00:00").slice(0, 5)}`
                      : `Prestador atrasado (${formatElapsed(item.elapsedSinceDispatch ?? 0)} / ETA ${d?.estimated_arrival_min}min)`
                    }
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
                      {d.scheduled_arrival_date ? (
                        <span className="font-medium text-foreground" title="Previsão de Chegada agendada">
                          ETA: {new Date(d.scheduled_arrival_date + "T" + (d.scheduled_arrival_time || "00:00")).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                          {d.scheduled_arrival_time && ` às ${d.scheduled_arrival_time.slice(0, 5)}`}
                        </span>
                      ) : d.estimated_arrival_min ? (
                        <span title="Tempo Estimado de Chegada">ETA: {d.estimated_arrival_min}min</span>
                      ) : null}
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
                        if (isPaused) {
                          handleResume(r.id, r.protocol);
                        } else {
                          setPauseTarget(r);
                          setPauseJustification("");
                          setPauseDialogOpen(true);
                        }
                      }}
                    >
                      {isPaused ? (
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

      {/* Pause justification dialog */}
      <Dialog open={pauseDialogOpen} onOpenChange={setPauseDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pausar Acionamento</DialogTitle>
            <DialogDescription>
              {pauseTarget?.protocol} — Informe o motivo da pausa. Todos os operadores verão essa informação.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Justificativa da pausa..."
            value={pauseJustification}
            onChange={(e) => setPauseJustification(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPauseDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handlePause}
              disabled={!pauseJustification.trim() || pauseSubmitting}
            >
              {pauseSubmitting ? "Pausando..." : "Confirmar Pausa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

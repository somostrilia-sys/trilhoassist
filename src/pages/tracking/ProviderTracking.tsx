import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MapPin, Navigation, Car, Phone, ExternalLink, Loader2,
  CheckCircle2, AlertCircle, Shield, Play,
} from "lucide-react";
import logoTrilho from "@/assets/logo-trilho.png";
import { toast } from "sonner";

const serviceTypeMap: Record<string, string> = {
  tow_light: "Reboque Leve", tow_heavy: "Reboque Pesado", tow_motorcycle: "Reboque Moto",
  locksmith: "Chaveiro", tire_change: "Troca de Pneu", battery: "Bateria",
  fuel: "Combustível", lodging: "Hospedagem", collision: "Colisão", other: "Outro",
};

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const statusLabels: Record<string, string> = {
  pending: "Pendente", sent: "Enviado", accepted: "Aceito",
  rejected: "Recusado", expired: "Expirado", cancelled: "Cancelado", completed: "Concluído",
};

export default function ProviderTracking() {
  const { token } = useParams<{ token: string }>();
  const [dispatch, setDispatch] = useState<any>(null);
  const [request, setRequest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);
  const [lastSent, setLastSent] = useState<Date | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [gpsReady, setGpsReady] = useState(false);
  const [arrivedOrigin, setArrivedOrigin] = useState(false);
  const watchRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestPos = useRef<GeolocationPosition | null>(null);
  const autoArrivalRef = useRef(false);

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      const { data: d, error: dErr } = await supabase
        .from("dispatches")
        .select("*, providers(name, phone)")
        .eq("provider_token", token)
        .maybeSingle();

      if (dErr || !d) {
        setError("Link de rastreamento inválido ou expirado.");
        setLoading(false);
        return;
      }
      setDispatch(d);

      const { data: sr } = await supabase
        .from("service_requests")
        .select("*")
        .eq("id", d.service_request_id)
        .maybeSingle();

      if (!sr) {
        setError("Atendimento não encontrado.");
        setLoading(false);
        return;
      }
      setRequest(sr);
      setLoading(false);
    };
    load();
  }, [token]);

  const sendPosition = useCallback(async (pos: GeolocationPosition) => {
    if (!dispatch || !request) return;
    const payload = {
      dispatch_id: dispatch.id,
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy || null,
      heading: pos.coords.heading || null,
      speed: pos.coords.speed || null,
    };
    // Persist to DB
    await supabase.from("provider_tracking").insert(payload);
    // Broadcast via Realtime channel for instant updates
    supabase.channel(`provider-location-${request.id}`).send({
      type: "broadcast",
      event: "location",
      payload: { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() },
    });
    setLastSent(new Date());
  }, [dispatch, request]);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError("GPS não disponível neste dispositivo.");
      return;
    }

    setGpsError(null);

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        latestPos.current = pos;
        setGpsReady(true);
      },
      (err) => {
        setGpsError(`Erro GPS: ${err.message}`);
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    // Send position every 10 seconds
    intervalRef.current = setInterval(() => {
      if (latestPos.current) {
        sendPosition(latestPos.current);
      }
    }, 10000);

    // Send first position immediately
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        latestPos.current = pos;
        setGpsReady(true);
        sendPosition(pos);
      },
      (err) => setGpsError(`Erro GPS: ${err.message}`),
      { enableHighAccuracy: true }
    );

    setTracking(true);
  }, [sendPosition]);

  const stopTracking = useCallback(() => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setTracking(false);
    setGpsReady(false);
  }, []);

  useEffect(() => {
    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleAccept = useCallback(async () => {
    if (!dispatch || !gpsReady || !latestPos.current) {
      toast.error("Ative a localização antes de aceitar.");
      return;
    }

    setAccepting(true);
    const { error: err } = await supabase
      .from("dispatches")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
      })
      .eq("id", dispatch.id);

    if (err) {
      toast.error("Erro ao aceitar acionamento", { description: err.message });
      setAccepting(false);
      return;
    }

    // Update service request status to in_progress
    await supabase
      .from("service_requests")
      .update({ status: "in_progress" })
      .eq("id", dispatch.service_request_id);

    setDispatch({ ...dispatch, status: "accepted", accepted_at: new Date().toISOString() });
    toast.success("Acionamento aceito!", { description: "Sua localização está sendo compartilhada." });
    setAccepting(false);
  }, [dispatch, gpsReady]);

  const handleComplete = useCallback(async () => {
    if (!dispatch) return;
    setAccepting(true);

    const { error: err } = await supabase
      .from("dispatches")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", dispatch.id);

    if (err) {
      toast.error("Erro ao finalizar", { description: err.message });
      setAccepting(false);
      return;
    }

    await supabase
      .from("service_requests")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", dispatch.service_request_id);

    stopTracking();
    setDispatch({ ...dispatch, status: "completed", completed_at: new Date().toISOString() });
    toast.success("Atendimento finalizado!");
    setAccepting(false);
  }, [dispatch, stopTracking]);

  const handleReject = useCallback(async () => {
    if (!dispatch) return;
    setAccepting(true);

    await supabase
      .from("dispatches")
      .update({ status: "rejected" })
      .eq("id", dispatch.id);

    stopTracking();
    setDispatch({ ...dispatch, status: "rejected" });
    toast.info("Acionamento recusado.");
    setAccepting(false);
  }, [dispatch, stopTracking]);

  const handleMarkArrival = useCallback(async () => {
    if (!dispatch) return;
    const { error: err } = await supabase
      .from("dispatches")
      .update({ provider_arrived_at: new Date().toISOString() })
      .eq("id", dispatch.id);
    if (err) {
      toast.error("Erro ao registrar chegada");
      return;
    }
    setArrivedOrigin(true);
    setDispatch({ ...dispatch, provider_arrived_at: new Date().toISOString() });
    toast.success("Chegada registrada!");
  }, [dispatch]);

  // Auto-detect arrival at origin (100m radius) — check on each GPS update
  useEffect(() => {
    if (!request?.origin_lat || !request?.origin_lng || !tracking || arrivedOrigin || autoArrivalRef.current) return;
    if (!latestPos.current) return;

    const checkInterval = setInterval(() => {
      if (!latestPos.current || autoArrivalRef.current) return;
      const dist = haversineDistance(
        latestPos.current.coords.latitude,
        latestPos.current.coords.longitude,
        request.origin_lat,
        request.origin_lng
      );
      if (dist <= 100) {
        autoArrivalRef.current = true;
        handleMarkArrival();
      }
    }, 10000);

    return () => clearInterval(checkInterval);
  }, [request?.origin_lat, request?.origin_lng, tracking, arrivedOrigin, handleMarkArrival]);

  // Set arrived state from dispatch data
  useEffect(() => {
    if (dispatch?.provider_arrived_at) setArrivedOrigin(true);
  }, [dispatch?.provider_arrived_at]);

  const isAccepted = dispatch?.status === "accepted";
  const isCompleted = dispatch?.status === "completed";
  const isRejected = dispatch?.status === "rejected";
  const isPending = dispatch?.status === "sent" || dispatch?.status === "pending";

  const originGoogleUrl = request?.origin_lat
    ? `https://www.google.com/maps/dir/?api=1&destination=${request.origin_lat},${request.origin_lng}&travelmode=driving`
    : "";
  const originWazeUrl = request?.origin_lat
    ? `https://www.waze.com/ul?ll=${request.origin_lat},${request.origin_lng}&navigate=yes`
    : "";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 p-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-destructive text-center">{error}</p>
      </div>
    );
  }

  if (isCompleted) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-primary text-primary-foreground p-4">
          <div className="max-w-lg mx-auto flex items-center gap-3">
            <img src={logoTrilho} alt="Logo" className="h-8 w-8 rounded" />
            <div>
              <h1 className="text-lg font-bold">Atendimento Finalizado</h1>
              <p className="text-xs opacity-80">{request?.protocol}</p>
            </div>
          </div>
        </div>
        <div className="max-w-lg mx-auto p-4 flex flex-col items-center gap-4 mt-12">
          <CheckCircle2 className="h-16 w-16 text-green-500" />
          <h2 className="text-xl font-bold">Atendimento concluído!</h2>
          <p className="text-muted-foreground text-center">
            Obrigado pelo serviço. O pagamento será processado no próximo fechamento.
          </p>
        </div>
      </div>
    );
  }

  if (isRejected) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-primary text-primary-foreground p-4">
          <div className="max-w-lg mx-auto flex items-center gap-3">
            <img src={logoTrilho} alt="Logo" className="h-8 w-8 rounded" />
            <div>
              <h1 className="text-lg font-bold">Acionamento Recusado</h1>
              <p className="text-xs opacity-80">{request?.protocol}</p>
            </div>
          </div>
        </div>
        <div className="max-w-lg mx-auto p-4 flex flex-col items-center gap-4 mt-12">
          <AlertCircle className="h-16 w-16 text-muted-foreground" />
          <p className="text-muted-foreground text-center">Você recusou este acionamento.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary text-primary-foreground p-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <img src={logoTrilho} alt="Logo" className="h-8 w-8 rounded" />
          <div>
            <h1 className="text-lg font-bold">
              {isPending ? "Novo Acionamento" : "Em Atendimento"}
            </h1>
            <p className="text-xs opacity-80">{request?.protocol}</p>
          </div>
          <Badge variant="secondary" className="ml-auto">
            {statusLabels[dispatch?.status] || dispatch?.status}
          </Badge>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Service info */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">{serviceTypeMap[request?.service_type] || request?.service_type}</Badge>
              {request?.vehicle_plate && <Badge variant="outline">{request.vehicle_plate}</Badge>}
            </div>
            {request?.vehicle_model && (
              <div className="flex items-center gap-2 text-sm">
                <Car className="h-4 w-4 text-muted-foreground" />
                <span>{request.vehicle_model} {request.vehicle_year || ""}</span>
              </div>
            )}
            {request?.requester_phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <a href={`tel:${request.requester_phone}`} className="text-primary underline">
                  {request.requester_phone}
                </a>
              </div>
            )}
            {request?.origin_address && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{request.origin_address}</span>
              </div>
            )}
            {request?.notes && (
              <p className="text-sm text-muted-foreground border-l-2 border-muted pl-3">{request.notes}</p>
            )}
            {dispatch?.quoted_amount && (
              <p className="text-sm font-medium">
                Valor: R$ {Number(dispatch.quoted_amount).toFixed(2)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Step 1: GPS - Required before acceptance */}
        <Card className={tracking ? "border-green-500 border-2" : "border-amber-500 border-2"}>
          <CardContent className="pt-4 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              {tracking ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <Shield className="h-4 w-4 text-amber-500" />
              )}
              {isPending ? "1. Ative sua localização" : "Localização em tempo real"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isPending
                ? "Obrigatório: compartilhe sua localização para aceitar o acionamento."
                : "Sua localização está sendo compartilhada com o cliente e a central."}
            </p>

            {!tracking ? (
              <Button onClick={startTracking} className="w-full gap-2" variant="default">
                <Navigation className="h-4 w-4" />
                Ativar localização
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Localização ativa</span>
                  {lastSent && (
                    <span className="text-xs text-muted-foreground ml-auto">
                      Último: {lastSent.toLocaleTimeString("pt-BR")}
                    </span>
                  )}
                </div>
                {isAccepted && (
                  <Button onClick={stopTracking} variant="outline" size="sm" className="w-full">
                    Parar compartilhamento
                  </Button>
                )}
              </div>
            )}

            {gpsError && (
              <p className="text-xs text-destructive">{gpsError}</p>
            )}
          </CardContent>
        </Card>

        {/* Step 2: Accept / Reject - only if pending */}
        {isPending && (
          <Card>
            <CardContent className="pt-4 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Play className="h-4 w-4" />
                2. Aceitar acionamento
              </h3>

              {!gpsReady && (
                <p className="text-xs text-amber-600">
                  ⚠️ Ative sua localização primeiro para aceitar.
                </p>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handleAccept}
                  disabled={!gpsReady || accepting}
                  className="flex-1 gap-2"
                >
                  {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Aceitar
                </Button>
                <Button
                  onClick={handleReject}
                  disabled={accepting}
                  variant="destructive"
                  className="flex-1"
                >
                  Recusar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Navigation to origin - show after acceptance */}
        {isAccepted && request?.origin_lat && (
          <Card>
            <CardContent className="pt-4 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                Ir até o cliente
              </h3>
              {request.origin_address && (
                <p className="text-sm text-muted-foreground">{request.origin_address}</p>
              )}
              <div className="flex gap-2">
                <Button size="sm" className="flex-1" asChild>
                  <a href={originGoogleUrl} target="_blank" rel="noopener noreferrer" className="gap-2">
                    <Navigation className="h-4 w-4" /> Google Maps
                  </a>
                </Button>
                <Button size="sm" variant="secondary" className="flex-1" asChild>
                  <a href={originWazeUrl} target="_blank" rel="noopener noreferrer" className="gap-2">
                    <MapPin className="h-4 w-4" /> Waze
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Mark Arrival button */}
        {isAccepted && !arrivedOrigin && (
          <Button
            onClick={handleMarkArrival}
            className="w-full gap-2"
            variant="default"
            size="lg"
          >
            <CheckCircle2 className="h-4 w-4" />
            Marcar Chegada na Origem
          </Button>
        )}
        {isAccepted && arrivedOrigin && (
          <div className="flex items-center justify-center gap-2 text-sm text-success font-medium py-2">
            <CheckCircle2 className="h-5 w-5" />
            Chegada registrada
          </div>
        )}

        {/* Destination navigation */}
        {isAccepted && request?.destination_lat && (
          <Card>
            <CardContent className="pt-4 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                Levar ao destino
              </h3>
              {request.destination_address && (
                <p className="text-sm text-muted-foreground">{request.destination_address}</p>
              )}
              <div className="flex gap-2">
                <Button size="sm" className="flex-1" asChild>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${request.destination_lat},${request.destination_lng}&travelmode=driving`}
                    target="_blank" rel="noopener noreferrer" className="gap-2"
                  >
                    <Navigation className="h-4 w-4" /> Google Maps
                  </a>
                </Button>
                <Button size="sm" variant="secondary" className="flex-1" asChild>
                  <a
                    href={`https://www.waze.com/ul?ll=${request.destination_lat},${request.destination_lng}&navigate=yes`}
                    target="_blank" rel="noopener noreferrer" className="gap-2"
                  >
                    <MapPin className="h-4 w-4" /> Waze
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Complete button */}
        {isAccepted && (
          <Button
            onClick={handleComplete}
            disabled={accepting}
            className="w-full gap-2"
            variant="default"
            size="lg"
          >
            {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Finalizar atendimento
          </Button>
        )}
      </div>
    </div>
  );
}

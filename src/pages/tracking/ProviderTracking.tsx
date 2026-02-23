import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Navigation, Car, Phone, ExternalLink, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import logoTrilho from "@/assets/logo-trilho.png";

const serviceTypeMap: Record<string, string> = {
  tow_light: "Reboque Leve", tow_heavy: "Reboque Pesado", tow_motorcycle: "Reboque Moto",
  locksmith: "Chaveiro", tire_change: "Troca de Pneu", battery: "Bateria",
  fuel: "Combustível", lodging: "Hospedagem", collision: "Colisão", other: "Outro",
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
  const watchRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestPos = useRef<GeolocationPosition | null>(null);

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
    if (!dispatch) return;
    await supabase.from("provider_tracking").insert({
      dispatch_id: dispatch.id,
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy || null,
      heading: pos.coords.heading || null,
      speed: pos.coords.speed || null,
    });
    setLastSent(new Date());
  }, [dispatch]);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError("GPS não disponível neste dispositivo.");
      return;
    }

    setTracking(true);
    setGpsError(null);

    // Watch position continuously
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        latestPos.current = pos;
      },
      (err) => {
        setGpsError(`Erro GPS: ${err.message}`);
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    // Send position every 15 seconds
    intervalRef.current = setInterval(() => {
      if (latestPos.current) {
        sendPosition(latestPos.current);
      }
    }, 15000);

    // Send first position immediately
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        latestPos.current = pos;
        sendPosition(pos);
      },
      (err) => setGpsError(`Erro GPS: ${err.message}`),
      { enableHighAccuracy: true }
    );
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
  }, []);

  useEffect(() => {
    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

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

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary text-primary-foreground p-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <img src={logoTrilho} alt="Logo" className="h-8 w-8 rounded" />
          <div>
            <h1 className="text-lg font-bold">Rastreamento</h1>
            <p className="text-xs opacity-80">{request?.protocol}</p>
          </div>
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
          </CardContent>
        </Card>

        {/* Navigation to origin */}
        {request?.origin_lat && (
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

        {/* GPS Tracking */}
        <Card className={tracking ? "border-green-500 border-2" : ""}>
          <CardContent className="pt-4 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Compartilhar localização
            </h3>
            <p className="text-xs text-muted-foreground">
              Ative para que o cliente e a central acompanhem sua posição em tempo real.
            </p>

            {!tracking ? (
              <Button onClick={startTracking} className="w-full gap-2">
                <Navigation className="h-4 w-4" />
                Iniciar rastreamento
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Rastreamento ativo</span>
                  {lastSent && (
                    <span className="text-xs text-muted-foreground ml-auto">
                      Último envio: {lastSent.toLocaleTimeString("pt-BR")}
                    </span>
                  )}
                </div>
                <Button onClick={stopTracking} variant="destructive" className="w-full gap-2">
                  Parar rastreamento
                </Button>
              </div>
            )}

            {gpsError && (
              <p className="text-xs text-destructive">{gpsError}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

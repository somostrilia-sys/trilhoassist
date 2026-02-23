import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Car, Loader2, AlertCircle, Clock, Bell } from "lucide-react";
import logoTrilho from "@/assets/logo-trilho.png";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.8);
  } catch {}
}

const serviceTypeMap: Record<string, string> = {
  tow_light: "Reboque Leve", tow_heavy: "Reboque Pesado", tow_motorcycle: "Reboque Moto",
  locksmith: "Chaveiro", tire_change: "Troca de Pneu", battery: "Bateria",
  fuel: "Combustível", lodging: "Hospedagem", collision: "Colisão", other: "Outro",
};

export default function BeneficiaryTracking() {
  const { token } = useParams<{ token: string }>();
  const [request, setRequest] = useState<any>(null);
  const [dispatch, setDispatch] = useState<any>(null);
  const [providerName, setProviderName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providerPos, setProviderPos] = useState<{ lat: number; lng: number } | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isNearby, setIsNearby] = useState(false);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const notifiedRef = useRef(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const providerMarkerRef = useRef<L.Marker | null>(null);
  const originMarkerRef = useRef<L.Marker | null>(null);

  // Load data
  useEffect(() => {
    if (!token) return;
    const load = async () => {
      const { data: sr } = await supabase
        .from("service_requests")
        .select("*")
        .eq("beneficiary_token", token)
        .maybeSingle();

      if (!sr) {
        setError("Link de acompanhamento inválido ou expirado.");
        setLoading(false);
        return;
      }
      setRequest(sr);

      const { data: d } = await supabase
        .from("dispatches")
        .select("*, providers(name)")
        .eq("service_request_id", sr.id)
        .in("status", ["accepted", "sent", "pending", "completed"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (d) {
        setDispatch(d);
        setProviderName((d as any).providers?.name || "Prestador");

        // Get latest tracking position
        const { data: track } = await supabase
          .from("provider_tracking")
          .select("latitude, longitude, created_at")
          .eq("dispatch_id", d.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (track) {
          setProviderPos({ lat: track.latitude, lng: track.longitude });
          setLastUpdate(new Date(track.created_at));
        }
      }
      setLoading(false);
    };
    load();
  }, [token]);

  // Subscribe to realtime tracking updates
  useEffect(() => {
    if (!dispatch?.id) return;

    const channel = supabase
      .channel(`tracking-${dispatch.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "provider_tracking",
          filter: `dispatch_id=eq.${dispatch.id}`,
        },
        (payload: any) => {
          const { latitude, longitude, created_at } = payload.new;
          setProviderPos({ lat: latitude, lng: longitude });
          setLastUpdate(new Date(created_at));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dispatch?.id]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    if (!request) return;

    const centerLat = request.origin_lat || -15.79;
    const centerLng = request.origin_lng || -47.88;
    const zoom = request.origin_lat ? 14 : 5;

    const map = L.map(mapRef.current).setView([centerLat, centerLng], zoom);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);

    // Origin marker (only if coordinates exist)
    if (request.origin_lat && request.origin_lng) {
      const originIcon = L.divIcon({
        html: `<div style="background:#22c55e;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
        className: "",
      });
      originMarkerRef.current = L.marker([request.origin_lat, request.origin_lng], { icon: originIcon })
        .addTo(map)
        .bindPopup("Localização do cliente");
    }

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [request]);

  // Update provider marker
  useEffect(() => {
    if (!mapInstanceRef.current || !providerPos) return;

    const providerIcon = L.divIcon({
      html: `<div style="background:#3b82f6;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);animation:pulse 2s infinite"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      className: "",
    });

    if (providerMarkerRef.current) {
      providerMarkerRef.current.setLatLng([providerPos.lat, providerPos.lng]);
    } else {
      providerMarkerRef.current = L.marker([providerPos.lat, providerPos.lng], { icon: providerIcon })
        .addTo(mapInstanceRef.current)
        .bindPopup(providerName || "Prestador");
    }

    // Fit bounds to show both markers
    const bounds = L.latLngBounds([
      [providerPos.lat, providerPos.lng],
      [request?.origin_lat || providerPos.lat, request?.origin_lng || providerPos.lng],
    ]);
    mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });
  }, [providerPos, providerName, request?.origin_lat, request?.origin_lng]);

  // Proximity check
  useEffect(() => {
    if (!providerPos || !request?.origin_lat || !request?.origin_lng) return;
    const dist = haversineDistance(providerPos.lat, providerPos.lng, request.origin_lat, request.origin_lng);
    setDistanceKm(dist);
    if (dist <= 1 && !notifiedRef.current) {
      setIsNearby(true);
      notifiedRef.current = true;
      playNotificationSound();
      if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
    }
  }, [providerPos, request?.origin_lat, request?.origin_lng]);

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
      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0.4); }
          50% { box-shadow: 0 0 0 12px rgba(59,130,246,0); }
        }
      `}</style>

      <div className="bg-primary text-primary-foreground p-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <img src={logoTrilho} alt="Logo" className="h-8 w-8 rounded" />
          <div>
            <h1 className="text-lg font-bold">Acompanhamento</h1>
            <p className="text-xs opacity-80">{request?.protocol}</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Service info */}
        <Card>
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">{serviceTypeMap[request?.service_type] || request?.service_type}</Badge>
              {request?.vehicle_plate && <Badge variant="outline">{request.vehicle_plate}</Badge>}
            </div>
            {providerName && (
              <p className="text-sm">
                <span className="text-muted-foreground">Prestador:</span>{" "}
                <span className="font-medium">{providerName}</span>
              </p>
            )}
          </CardContent>
        </Card>

        {/* Nearby alert */}
        {isNearby && (
          <Card className="border-primary bg-primary/10 animate-pulse">
            <CardContent className="pt-4 flex items-center gap-3">
              <Bell className="h-6 w-6 text-primary" />
              <div>
                <p className="font-bold text-primary text-sm">Prestador muito próximo!</p>
                <p className="text-xs text-muted-foreground">
                  {distanceKm !== null && `A ${(distanceKm * 1000).toFixed(0)}m de distância`}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Map */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Localização do prestador
              </h3>
              <div className="flex items-center gap-2">
                {distanceKm !== null && (
                  <Badge variant={isNearby ? "default" : "outline"} className="text-xs">
                    {distanceKm < 1 ? `${(distanceKm * 1000).toFixed(0)}m` : `${distanceKm.toFixed(1)}km`}
                  </Badge>
                )}
                {lastUpdate && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {lastUpdate.toLocaleTimeString("pt-BR")}
                  </span>
                )}
              </div>
            </div>

            {!providerPos && !dispatch && (
              <p className="text-sm text-muted-foreground">Nenhum prestador acionado ainda.</p>
            )}

            {!providerPos && dispatch && (
              <p className="text-sm text-muted-foreground">Aguardando localização do prestador...</p>
            )}

            <div
              ref={mapRef}
              className="w-full rounded-lg overflow-hidden"
              style={{ height: 350 }}
            />

            {providerPos && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
                <span>Prestador em movimento</span>
                <span className="ml-auto">
                  <div className="w-3 h-3 rounded-full bg-green-500 inline-block mr-1" />
                  Sua localização
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Loader2, AlertCircle, Clock, Bell, CheckCircle2, Navigation } from "lucide-react";
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

function playArrivalSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    // Two-tone celebration sound
    [880, 1100].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.3);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.3 + 0.5);
      osc.start(ctx.currentTime + i * 0.3);
      osc.stop(ctx.currentTime + i * 0.3 + 0.5);
    });
  } catch {}
}

async function fetchRouteCoords(
  fromLat: number, fromLng: number, toLat: number, toLng: number
): Promise<[number, number][] | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.routes?.[0]?.geometry?.coordinates) {
      return data.routes[0].geometry.coordinates as [number, number][];
    }
  } catch (err) {
    console.error("OSRM route fetch failed:", err);
  }
  return null;
}

const serviceTypeMap: Record<string, string> = {
  tow_light: "Reboque Leve", tow_heavy: "Reboque Pesado", tow_motorcycle: "Reboque Moto",
  locksmith: "Chaveiro", tire_change: "Troca de Pneu", battery: "Bateria",
  fuel: "Combustível", lodging: "Hospedagem", collision: "Colisão", other: "Outro",
};

// Smooth marker animation
function animateMarker(marker: L.Marker, newLatLng: L.LatLng, duration = 1000) {
  const start = marker.getLatLng();
  const startTime = performance.now();
  
  function step(currentTime: number) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease-out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    
    const lat = start.lat + (newLatLng.lat - start.lat) * eased;
    const lng = start.lng + (newLatLng.lng - start.lng) * eased;
    marker.setLatLng([lat, lng]);
    
    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }
  
  requestAnimationFrame(step);
}

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
  const [beneficiaryArrived, setBeneficiaryArrived] = useState(false);
  const [providerArrived, setProviderArrived] = useState(false);
  const [waitingLocation, setWaitingLocation] = useState(false);
  const [etaText, setEtaText] = useState<string | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const notifiedRef = useRef(false);
  const arrivalNotifiedRef = useRef(false);
  const waitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const etaDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const providerMarkerRef = useRef<L.Marker | null>(null);
  const originMarkerRef = useRef<L.Marker | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);

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
        if (d.provider_arrived_at) setProviderArrived(true);

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

  // Subscribe to Realtime: postgres_changes + broadcast channel + dispatch updates
  useEffect(() => {
    if (!dispatch?.id || !request?.id) return;

    // 1. Postgres changes for tracking (fallback, reliable)
    const pgChannel = supabase
      .channel(`tracking-pg-${dispatch.id}`)
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
          resetWaitingTimer();
        }
      )
      .subscribe();

    // 2. Broadcast channel (instant, low latency)
    const broadcastChannel = supabase
      .channel(`provider-location-${request.id}`)
      .on("broadcast", { event: "location" }, (payload: any) => {
        const { lat, lng, ts } = payload.payload;
        if (lat && lng) {
          setProviderPos({ lat, lng });
          setLastUpdate(new Date(ts));
          resetWaitingTimer();
        }
      })
      .subscribe();

    // 3. Dispatch updates (provider_arrived_at)
    const dispatchChannel = supabase
      .channel(`dispatch-updates-${dispatch.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "dispatches",
          filter: `id=eq.${dispatch.id}`,
        },
        (payload: any) => {
          const updated = payload.new;
          if (updated.provider_arrived_at && !arrivalNotifiedRef.current) {
            arrivalNotifiedRef.current = true;
            setProviderArrived(true);
            playArrivalSound();
            if ("vibrate" in navigator) navigator.vibrate([200, 100, 200, 100, 200]);
          }
          if (updated.status) {
            setDispatch((prev: any) => ({ ...prev, ...updated }));
          }
        }
      )
      .subscribe();

    // Start waiting timer
    startWaitingTimer();

    return () => {
      supabase.removeChannel(pgChannel);
      supabase.removeChannel(broadcastChannel);
      supabase.removeChannel(dispatchChannel);
      if (waitingTimerRef.current) clearTimeout(waitingTimerRef.current);
    };
  }, [dispatch?.id, request?.id]);

  const startWaitingTimer = useCallback(() => {
    if (waitingTimerRef.current) clearTimeout(waitingTimerRef.current);
    waitingTimerRef.current = setTimeout(() => {
      setWaitingLocation(true);
    }, 30000);
  }, []);

  const resetWaitingTimer = useCallback(() => {
    setWaitingLocation(false);
    if (waitingTimerRef.current) clearTimeout(waitingTimerRef.current);
    waitingTimerRef.current = setTimeout(() => {
      setWaitingLocation(true);
    }, 30000);
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    if (!request) return;

    const centerLat = request.origin_lat || -15.79;
    const centerLng = request.origin_lng || -47.88;
    const zoom = request.origin_lat ? 14 : 5;

    const map = L.map(mapRef.current, {
      zoomControl: false,
    }).setView([centerLat, centerLng], zoom);

    // Add zoom control to bottom-right for mobile friendliness
    L.control.zoom({ position: "bottomright" }).addTo(map);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);

    if (request.origin_lat && request.origin_lng) {
      const originIcon = L.divIcon({
        html: `<div style="position:relative">
          <div style="width:18px;height:18px;border-radius:50%;background:hsl(var(--primary));border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>
          <div style="position:absolute;top:-2px;left:-2px;width:22px;height:22px;border-radius:50%;border:2px solid hsl(var(--primary));opacity:0.4;animation:pulse-ring 2s ease-out infinite"></div>
        </div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        className: "",
      });
      originMarkerRef.current = L.marker([request.origin_lat, request.origin_lng], { icon: originIcon })
        .addTo(map)
        .bindPopup(`<b>📍 Localização do veículo</b><br/>${request.origin_address || ""}`);
    }

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      providerMarkerRef.current = null;
      routePolylineRef.current = null;
    };
  }, [request]);

  // Update provider marker with smooth animation
  useEffect(() => {
    if (!mapInstanceRef.current || !providerPos) return;

    const isMoto = request?.service_type === "tow_motorcycle" || request?.vehicle_category === "motorcycle";
    const vehicleEmoji = isMoto ? "🏍️" : "🚗";

    const providerIcon = L.divIcon({
      html: `<div style="font-size:28px;line-height:1;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.4));transition:transform 0.3s ease">${vehicleEmoji}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      className: "",
    });

    const newLatLng = L.latLng(providerPos.lat, providerPos.lng);

    if (providerMarkerRef.current) {
      // Smooth animation to new position
      animateMarker(providerMarkerRef.current, newLatLng);
    } else {
      providerMarkerRef.current = L.marker([providerPos.lat, providerPos.lng], { 
        icon: providerIcon,
        zIndexOffset: 1000,
      })
        .addTo(mapInstanceRef.current)
        .bindPopup(`<b>${providerName || "Prestador"}</b>`);
    }

    // Fit bounds to show both points
    if (request?.origin_lat && request?.origin_lng) {
      const bounds = L.latLngBounds([
        [providerPos.lat, providerPos.lng],
        [request.origin_lat, request.origin_lng],
      ]);
      mapInstanceRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
    }
  }, [providerPos, providerName, request?.origin_lat, request?.origin_lng, request?.service_type, request?.vehicle_category]);

  // Update route polyline (debounced)
  useEffect(() => {
    if (!providerPos || !request?.origin_lat || !request?.origin_lng || !mapInstanceRef.current) return;
    
    if (routeDebounceRef.current) clearTimeout(routeDebounceRef.current);
    routeDebounceRef.current = setTimeout(async () => {
      const coords = await fetchRouteCoords(
        providerPos.lat, providerPos.lng,
        request.origin_lat, request.origin_lng
      );
      
      if (!coords || !mapInstanceRef.current) return;

      // Convert [lng, lat] to [lat, lng] for Leaflet
      const latLngs: [number, number][] = coords.map(([lng, lat]) => [lat, lng]);

      if (routePolylineRef.current) {
        routePolylineRef.current.setLatLngs(latLngs);
      } else {
        routePolylineRef.current = L.polyline(latLngs, {
          color: "hsl(220, 70%, 50%)",
          weight: 4,
          opacity: 0.7,
          dashArray: "8, 6",
          lineCap: "round",
          lineJoin: "round",
        }).addTo(mapInstanceRef.current);
      }
    }, 3000); // Update route every 3 seconds max

    return () => {
      if (routeDebounceRef.current) clearTimeout(routeDebounceRef.current);
    };
  }, [providerPos, request?.origin_lat, request?.origin_lng]);

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

  // ETA estimation via OSRM duration or simple speed
  useEffect(() => {
    if (!providerPos || !request?.origin_lat || !request?.origin_lng) return;
    if (etaDebounceRef.current) clearTimeout(etaDebounceRef.current);
    etaDebounceRef.current = setTimeout(async () => {
      // Try OSRM for accurate ETA
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${providerPos.lng},${providerPos.lat};${request.origin_lng},${request.origin_lat}?overview=false`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.routes?.[0]?.duration) {
          const mins = Math.round(data.routes[0].duration / 60);
          setEtaMinutes(mins);
          if (mins <= 1) {
            setEtaText("Chegando...");
          } else if (mins < 60) {
            setEtaText(`~${mins} min`);
          } else {
            const h = Math.floor(mins / 60);
            const m = mins % 60;
            setEtaText(`~${h}h${m > 0 ? ` ${m}min` : ""}`);
          }
          return;
        }
      } catch {}

      // Fallback: simple speed estimation
      const dist = haversineDistance(providerPos.lat, providerPos.lng, request.origin_lat, request.origin_lng);
      const avgSpeedKmH = 40;
      const etaMin = Math.round((dist / avgSpeedKmH) * 60);
      setEtaMinutes(etaMin);
      if (etaMin <= 1) {
        setEtaText("Chegando...");
      } else if (etaMin < 60) {
        setEtaText(`~${etaMin} min`);
      } else {
        const h = Math.floor(etaMin / 60);
        const m = etaMin % 60;
        setEtaText(`~${h}h${m > 0 ? ` ${m}min` : ""}`);
      }
    }, 2000);
  }, [providerPos, request?.origin_lat, request?.origin_lng]);

  // Set arrived state from dispatch data
  useEffect(() => {
    if (dispatch?.beneficiary_arrived_at) setBeneficiaryArrived(true);
    if (dispatch?.provider_arrived_at) setProviderArrived(true);
  }, [dispatch?.beneficiary_arrived_at, dispatch?.provider_arrived_at]);

  const handleBeneficiaryArrival = useCallback(async () => {
    if (!dispatch) return;
    await supabase
      .from("dispatches")
      .update({ beneficiary_arrived_at: new Date().toISOString() })
      .eq("id", dispatch.id);
    setBeneficiaryArrived(true);
  }, [dispatch]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Carregando acompanhamento...</p>
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

  const isCompleted = dispatch?.status === "completed";

  return (
    <div className="min-h-screen bg-background">
      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 0.4; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes slide-in {
          from { transform: translateY(-20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .arrival-alert {
          animation: slide-in 0.5s ease-out;
        }
      `}</style>

      {/* Header */}
      <div className="bg-primary text-primary-foreground p-4 shadow-md">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <img src={logoTrilho} alt="Logo" className="h-8 w-8 rounded" />
          <div className="flex-1">
            <h1 className="text-lg font-bold">Acompanhamento</h1>
            <p className="text-xs opacity-80">{request?.protocol}</p>
          </div>
          {providerPos && !providerArrived && (
            <div className="flex items-center gap-1.5 bg-primary-foreground/20 rounded-full px-3 py-1">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs font-medium">Ao vivo</span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Provider arrived alert */}
        {providerArrived && !isCompleted && (
          <Card className="border-green-500 border-2 bg-green-50 dark:bg-green-950/30 arrival-alert">
            <CardContent className="pt-4 flex items-center gap-3">
              <div className="bg-green-500 text-white rounded-full p-2">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <p className="font-bold text-green-700 dark:text-green-400 text-sm">
                  O prestador chegou ao local!
                </p>
                <p className="text-xs text-green-600 dark:text-green-500">
                  {providerName} está no ponto de atendimento
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Service info + ETA */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">{serviceTypeMap[request?.service_type] || request?.service_type}</Badge>
              {request?.vehicle_plate && <Badge variant="outline">{request.vehicle_plate}</Badge>}
              {isCompleted && <Badge className="bg-green-500 text-white">Concluído</Badge>}
            </div>
            {providerName && (
              <p className="text-sm">
                <span className="text-muted-foreground">Prestador:</span>{" "}
                <span className="font-medium">{providerName}</span>
              </p>
            )}
            {etaText && distanceKm !== null && distanceKm > 0.05 && !providerArrived && (
              <div className="flex items-center gap-3 bg-muted/50 rounded-lg p-3">
                <div className="bg-primary/10 rounded-full p-2">
                  <Navigation className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-primary">{etaText}</p>
                  <p className="text-xs text-muted-foreground">
                    {distanceKm < 1 ? `${(distanceKm * 1000).toFixed(0)}m restantes` : `${distanceKm.toFixed(1)}km restantes`}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Nearby alert */}
        {isNearby && !providerArrived && (
          <Card className="border-primary bg-primary/10">
            <CardContent className="pt-4 flex items-center gap-3">
              <Bell className="h-6 w-6 text-primary animate-bounce" />
              <div>
                <p className="font-bold text-primary text-sm">Prestador muito próximo!</p>
                <p className="text-xs text-muted-foreground">
                  {distanceKm !== null && `A ${(distanceKm * 1000).toFixed(0)}m de distância`}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Waiting for location warning */}
        {waitingLocation && !providerPos && dispatch && (
          <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="pt-4 flex items-center gap-3">
              <Clock className="h-5 w-5 text-amber-600" />
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Aguardando localização do prestador...
              </p>
            </CardContent>
          </Card>
        )}

        {/* Map */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="px-4 pt-4 pb-2 flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                {providerArrived ? "Prestador no local" : "Localização em tempo real"}
              </h3>
              <div className="flex items-center gap-2">
                {distanceKm !== null && !providerArrived && (
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
              <p className="text-sm text-muted-foreground px-4 pb-3">Nenhum prestador acionado ainda.</p>
            )}

            {!providerPos && dispatch && !waitingLocation && (
              <div className="flex items-center gap-2 px-4 pb-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Aguardando localização do prestador...</p>
              </div>
            )}

            <div
              ref={mapRef}
              className="w-full"
              style={{ height: 380 }}
            />

            {/* Map legend */}
            <div className="px-4 py-3 flex items-center gap-4 text-xs text-muted-foreground border-t">
              {providerPos && (
                <span className="flex items-center gap-1.5">
                  <span className="text-lg">
                    {request?.service_type === "tow_motorcycle" || request?.vehicle_category === "motorcycle" ? "🏍️" : "🚗"}
                  </span>
                  Prestador
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-primary" />
                Seu veículo
              </span>
              {providerPos && (
                <span className="flex items-center gap-1.5">
                  <div className="w-4 h-0.5 bg-blue-500" style={{ borderTop: "2px dashed" }} />
                  Rota
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Beneficiary arrival confirmation */}
        {dispatch && !beneficiaryArrived && !isCompleted && (
          <Button onClick={handleBeneficiaryArrival} className="w-full gap-2" size="lg">
            <CheckCircle2 className="h-4 w-4" />
            Confirmar que o prestador chegou
          </Button>
        )}
        {beneficiaryArrived && (
          <div className="flex items-center justify-center gap-2 text-sm text-green-600 font-medium py-2">
            <CheckCircle2 className="h-5 w-5" />
            Chegada do prestador confirmada
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Navigation, ExternalLink, Car, Phone, CheckCircle2, Shield, Loader2 } from "lucide-react";
import logoTrilho from "@/assets/logo-trilho.png";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const serviceTypeMap: Record<string, string> = {
  tow_light: "Reboque Leve",
  tow_heavy: "Reboque Pesado",
  tow_motorcycle: "Reboque Moto",
  locksmith: "Chaveiro",
  tire_change: "Troca de Pneu",
  battery: "Bateria",
  fuel: "Combustível",
  lodging: "Hospedagem",
  collision: "Colisão",
  other: "Outro",
};

const categoryMap: Record<string, string> = {
  car: "Carro",
  motorcycle: "Moto",
  truck: "Caminhão",
};

function buildGoogleMapsUrl(origin: string, destination: string, waypoints?: string): string {
  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
  if (waypoints) url += `&waypoints=${waypoints}`;
  url += `&travelmode=driving`;
  return url;
}

function buildWazeUrl(lat: number, lng: number): string {
  return `https://www.waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}

// Smooth marker animation
function animateMarker(marker: L.Marker, newLatLng: L.LatLng, duration = 1000) {
  const start = marker.getLatLng();
  const startTime = performance.now();
  function step(currentTime: number) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const lat = start.lat + (newLatLng.lat - start.lat) * eased;
    const lng = start.lng + (newLatLng.lng - start.lng) * eased;
    marker.setLatLng([lat, lng]);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
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
  } catch {}
  return null;
}

export default function ProviderNavigation() {
  const { dispatchId } = useParams<{ dispatchId: string }>();
  const [dispatch, setDispatch] = useState<any>(null);
  const [request, setRequest] = useState<any>(null);
  const [provider, setProvider] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // GPS tracking state
  const [tracking, setTracking] = useState(false);
  const [lastSent, setLastSent] = useState<Date | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [providerPos, setProviderPos] = useState<{ lat: number; lng: number } | null>(null);
  const watchRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestPos = useRef<GeolocationPosition | null>(null);

  // Map refs
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const providerMarkerRef = useRef<L.Marker | null>(null);
  const originMarkerRef = useRef<L.Marker | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);
  const routeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load dispatch data
  useEffect(() => {
    if (!dispatchId) return;
    const load = async () => {
      const { data: d, error: dErr } = await supabase
        .from("dispatches")
        .select("*, providers(name, latitude, longitude, phone, city, state)")
        .eq("id", dispatchId)
        .maybeSingle();

      if (dErr || !d) {
        setError("Acionamento não encontrado.");
        setLoading(false);
        return;
      }
      setDispatch(d);
      setProvider((d as any).providers);

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
  }, [dispatchId]);

  // GPS tracking - send position to DB + broadcast
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
    await supabase.from("provider_tracking").insert(payload);
    supabase.channel(`provider-location-${request.id}`).send({
      type: "broadcast",
      event: "location",
      payload: { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() },
    });
    setProviderPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
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
        setProviderPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => setGpsError(`Erro GPS: ${err.message}`),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    intervalRef.current = setInterval(() => {
      if (latestPos.current) sendPosition(latestPos.current);
    }, 10000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        latestPos.current = pos;
        setProviderPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
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
  }, []);

  useEffect(() => {
    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Initialize Leaflet map
  const initMap = useCallback((container: HTMLDivElement | null) => {
    mapRef.current = container;
    if (!container || !request || mapInstanceRef.current) return;

    const tryInit = () => {
      if (!container.isConnected) return;
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        setTimeout(tryInit, 200);
        return;
      }
      if (mapInstanceRef.current) return;

      const centerLat = request.origin_lat || -15.79;
      const centerLng = request.origin_lng || -47.88;
      const zoom = request.origin_lat ? 13 : 5;

      try {
        const map = L.map(container, { zoomControl: false }).setView([centerLat, centerLng], zoom);
        L.control.zoom({ position: "bottomright" }).addTo(map);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap",
          maxZoom: 19,
        }).addTo(map);

        // Origin marker (green)
        if (request.origin_lat && request.origin_lng) {
          const originIcon = L.divIcon({
            html: `<div style="width:16px;height:16px;border-radius:50%;background:#22c55e;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
            iconSize: [16, 16], iconAnchor: [8, 8], className: "",
          });
          originMarkerRef.current = L.marker([request.origin_lat, request.origin_lng], { icon: originIcon })
            .addTo(map)
            .bindPopup(`<b>📍 Origem</b><br/>${request.origin_address || ""}`);
        }

        // Destination marker (red)
        if (request.destination_lat && request.destination_lng) {
          const destIcon = L.divIcon({
            html: `<div style="width:16px;height:16px;border-radius:50%;background:#ef4444;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
            iconSize: [16, 16], iconAnchor: [8, 8], className: "",
          });
          destMarkerRef.current = L.marker([request.destination_lat, request.destination_lng], { icon: destIcon })
            .addTo(map)
            .bindPopup(`<b>🏁 Destino</b><br/>${request.destination_address || ""}`);
        }

        mapInstanceRef.current = map;

        // Fit bounds
        const allPts: [number, number][] = [];
        if (request.origin_lat) allPts.push([request.origin_lat, request.origin_lng]);
        if (request.destination_lat) allPts.push([request.destination_lat, request.destination_lng]);
        if (allPts.length >= 2) {
          map.fitBounds(L.latLngBounds(allPts), { padding: [50, 50] });
        }

        [0, 100, 300, 600, 1000].forEach(delay => {
          setTimeout(() => mapInstanceRef.current?.invalidateSize(), delay);
        });

        const ro = new ResizeObserver(() => mapInstanceRef.current?.invalidateSize());
        ro.observe(container);

        (container as any)._mapCleanup = () => {
          ro.disconnect();
          map.remove();
          mapInstanceRef.current = null;
          providerMarkerRef.current = null;
          routePolylineRef.current = null;
        };
      } catch (err) {
        console.error("Map init error:", err);
      }
    };

    setTimeout(tryInit, 100);
  }, [request]);

  useEffect(() => {
    return () => {
      if (mapRef.current && (mapRef.current as any)._mapCleanup) {
        (mapRef.current as any)._mapCleanup();
      }
    };
  }, []);

  useEffect(() => {
    if (request && mapRef.current && !mapInstanceRef.current) {
      initMap(mapRef.current);
    }
  }, [request, initMap]);

  // Update provider truck marker
  useEffect(() => {
    if (!mapInstanceRef.current || !providerPos) return;

    const truckIcon = L.divIcon({
      html: `<div style="
        width: 44px; height: 44px;
        background: hsl(218, 58%, 26%);
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 4px 14px rgba(0,0,0,0.35);
        border: 3px solid white;
        animation: provider-pulse 2s ease-in-out infinite;
      ">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
          <path d="M15 18H9"/>
          <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>
          <circle cx="17" cy="18" r="2"/>
          <circle cx="7" cy="18" r="2"/>
        </svg>
      </div>`,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
      className: "",
    });

    const newLatLng = L.latLng(providerPos.lat, providerPos.lng);

    if (providerMarkerRef.current) {
      animateMarker(providerMarkerRef.current, newLatLng);
    } else {
      providerMarkerRef.current = L.marker([providerPos.lat, providerPos.lng], {
        icon: truckIcon,
        zIndexOffset: 1000,
      })
        .addTo(mapInstanceRef.current)
        .bindPopup(`<b>🚚 Sua posição</b>`);
    }

    // Fit bounds with all points
    const allPts: [number, number][] = [[providerPos.lat, providerPos.lng]];
    if (request?.origin_lat) allPts.push([request.origin_lat, request.origin_lng]);
    if (request?.destination_lat) allPts.push([request.destination_lat, request.destination_lng]);
    if (allPts.length >= 2) {
      mapInstanceRef.current.fitBounds(L.latLngBounds(allPts), { padding: [50, 50], maxZoom: 16 });
    }
  }, [providerPos, request]);

  // Draw route from provider to origin (debounced)
  useEffect(() => {
    if (!providerPos || !request?.origin_lat || !mapInstanceRef.current) return;

    if (routeDebounceRef.current) clearTimeout(routeDebounceRef.current);
    routeDebounceRef.current = setTimeout(async () => {
      const coords = await fetchRouteCoords(
        providerPos.lat, providerPos.lng, request.origin_lat, request.origin_lng
      );
      if (!coords || !mapInstanceRef.current) return;
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
    }, 3000);

    return () => { if (routeDebounceRef.current) clearTimeout(routeDebounceRef.current); };
  }, [providerPos, request?.origin_lat, request?.origin_lng]);

  // Nav URLs
  const originGoogleUrl = request?.origin_lat
    ? `https://www.google.com/maps/dir/?api=1&destination=${request.origin_lat},${request.origin_lng}&travelmode=driving`
    : "";
  const originWazeUrl = request?.origin_lat
    ? buildWazeUrl(request.origin_lat, request.origin_lng)
    : "";
  const destGoogleUrl = request?.destination_lat
    ? `https://www.google.com/maps/dir/?api=1&destination=${request.destination_lat},${request.destination_lng}&travelmode=driving`
    : "";
  const destWazeUrl = request?.destination_lat
    ? buildWazeUrl(request.destination_lat, request.destination_lng)
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <img src={logoTrilho} alt="Logo" className="h-8 w-8 rounded" />
          <div>
            <h1 className="text-lg font-bold">Navegação</h1>
            <p className="text-xs opacity-80">{request?.protocol}</p>
          </div>
          {tracking && (
            <Badge variant="secondary" className="ml-auto animate-pulse">
              🔴 LIVE
            </Badge>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* GPS Tracking Card */}
        <Card className={tracking ? "border-green-500 border-2" : "border-amber-500 border-2"}>
          <CardContent className="pt-4 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              {tracking ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <Shield className="h-4 w-4 text-amber-500" />
              )}
              Compartilhar localização em tempo real
            </h3>
            <p className="text-xs text-muted-foreground">
              O beneficiário poderá acompanhar você no mapa em tempo real.
            </p>

            {!tracking ? (
              <Button onClick={startTracking} className="w-full gap-2">
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
                <Button onClick={stopTracking} variant="outline" size="sm" className="w-full">
                  Parar compartilhamento
                </Button>
              </div>
            )}

            {gpsError && <p className="text-xs text-destructive">{gpsError}</p>}
          </CardContent>
        </Card>

        {/* Real-time Map */}
        <Card>
          <CardContent className="pt-4">
            <div
              ref={initMap}
              className="w-full rounded-lg border overflow-hidden"
              style={{ height: 350 }}
            />
          </CardContent>
        </Card>

        {/* Service info card */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">{serviceTypeMap[request?.service_type] || request?.service_type}</Badge>
              <Badge variant="outline">{categoryMap[request?.vehicle_category] || "Carro"}</Badge>
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
            {request?.notes && (
              <p className="text-sm text-muted-foreground border-l-2 border-muted pl-3">{request.notes}</p>
            )}
          </CardContent>
        </Card>

        {/* Quick nav to origin */}
        {request?.origin_lat && (
          <Card>
            <CardContent className="pt-4 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#22c55e" }} />
                Ir até o cliente (Origem)
              </h3>
              {request.origin_address && (
                <p className="text-sm text-muted-foreground">{request.origin_address}</p>
              )}
              <div className="flex gap-2">
                <Button size="sm" className="flex-1" asChild>
                  <a href={originGoogleUrl} target="_blank" rel="noopener noreferrer" className="gap-2">
                    <Navigation className="h-4 w-4" />
                    Google Maps
                  </a>
                </Button>
                <Button size="sm" variant="secondary" className="flex-1" asChild>
                  <a href={originWazeUrl} target="_blank" rel="noopener noreferrer" className="gap-2">
                    <MapPin className="h-4 w-4" />
                    Waze
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick nav to destination */}
        {request?.destination_lat && (
          <Card>
            <CardContent className="pt-4 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#ef4444" }} />
                Levar ao destino
              </h3>
              {request.destination_address && (
                <p className="text-sm text-muted-foreground">{request.destination_address}</p>
              )}
              <div className="flex gap-2">
                <Button size="sm" className="flex-1" asChild>
                  <a href={destGoogleUrl} target="_blank" rel="noopener noreferrer" className="gap-2">
                    <Navigation className="h-4 w-4" />
                    Google Maps
                  </a>
                </Button>
                <Button size="sm" variant="secondary" className="flex-1" asChild>
                  <a href={destWazeUrl} target="_blank" rel="noopener noreferrer" className="gap-2">
                    <MapPin className="h-4 w-4" />
                    Waze
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* CSS animation for truck pulse */}
      <style>{`
        @keyframes provider-pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 4px 14px rgba(0,0,0,0.35); }
          50% { transform: scale(1.08); box-shadow: 0 6px 20px rgba(0,0,0,0.45); }
        }
      `}</style>
    </div>
  );
}

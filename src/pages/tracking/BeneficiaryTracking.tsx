import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Loader2, AlertCircle, Clock, Bell, CheckCircle2, Navigation, ShieldCheck, Truck, Search, Calendar as CalendarIcon, Phone, MessageCircle } from "lucide-react";
import logoTrilho from "@/assets/logo-trilho.png";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { GPSKalmanFilter } from "@/lib/gpsKalmanFilter";

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
  tow_light: "Reboque Leve", tow_heavy: "Reboque Pesado", tow_motorcycle: "Reboque Moto", tow_utility: "Reboque Utilitário",
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
  const [providerPhone, setProviderPhone] = useState<string>("");
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
  const receiverKalman = useRef(new GPSKalmanFilter(3));

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const providerMarkerRef = useRef<L.Marker | null>(null);
  const originMarkerRef = useRef<L.Marker | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);
  const currentDispatchIdRef = useRef<string | null>(null);

  // Kalman-based position smoother for received provider positions
  const smoothPosition = useCallback((lat: number, lng: number, accuracy?: number): { lat: number; lng: number } => {
    return receiverKalman.current.process(lat, lng, accuracy || 30, Date.now());
  }, []);

  // Load data
  const [beneficiaryInactive, setBeneficiaryInactive] = useState(false);

  const loadData = useCallback(async () => {
    if (!token) return;
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

    // Check if beneficiary is active
    if (sr.beneficiary_id) {
      const { data: ben } = await supabase
        .from("beneficiaries")
        .select("active")
        .eq("id", sr.beneficiary_id)
        .maybeSingle();
      if (ben && ben.active === false) {
        setBeneficiaryInactive(true);
        setLoading(false);
        return;
      }
    }

    setRequest(sr);

    const { data: d } = await supabase
      .from("dispatches")
      .select("*, providers(name, latitude, longitude, phone)")
      .eq("service_request_id", sr.id)
      .in("status", ["accepted", "sent", "pending", "completed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (d) {
      // If dispatch changed, reset map markers
      if (currentDispatchIdRef.current && d.id !== currentDispatchIdRef.current) {
        if (providerMarkerRef.current && mapInstanceRef.current) {
          mapInstanceRef.current.removeLayer(providerMarkerRef.current);
          providerMarkerRef.current = null;
        }
        if (routePolylineRef.current && mapInstanceRef.current) {
          mapInstanceRef.current.removeLayer(routePolylineRef.current);
          routePolylineRef.current = null;
        }
        setProviderPos(null);
        setProviderArrived(false);
        arrivalNotifiedRef.current = false;
        notifiedRef.current = false;
        receiverKalman.current.reset(); // Reset Kalman for new dispatch
      }

      currentDispatchIdRef.current = d.id;
      setDispatch(d);
      const prov = (d as any).providers;
      setProviderName(prov?.name || "Prestador");
      setProviderPhone(prov?.phone || "");
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
      } else if (prov?.latitude && prov?.longitude) {
        setProviderPos({ lat: prov.latitude, lng: prov.longitude });
      }
    } else {
      currentDispatchIdRef.current = null;
      setDispatch(null);
      setProviderName("");
      setProviderPos(null);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { loadData(); }, [loadData]);

  // Subscribe to service_request updates to detect new dispatches (provider swap)
  useEffect(() => {
    if (!request?.id) return;
    const channel = supabase
      .channel(`sr-dispatch-change-${request.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dispatches",
          filter: `service_request_id=eq.${request.id}`,
        },
        () => {
          // Re-load data when any dispatch changes (new dispatch, cancellation, etc.)
          loadData();
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [request?.id, loadData]);

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
          const { latitude, longitude, created_at, accuracy } = payload.new;
          const smoothed = smoothPosition(latitude, longitude, accuracy);
          setProviderPos(smoothed);
          setLastUpdate(new Date(created_at));
          resetWaitingTimer();
        }
      )
      .subscribe();

    // 2. Broadcast channel (instant, low latency)
    const broadcastChannel = supabase
      .channel(`provider-location-${request.id}`)
      .on("broadcast", { event: "location" }, (payload: any) => {
        const { lat, lng, ts, accuracy } = payload.payload;
        if (lat && lng) {
          const smoothed = smoothPosition(lat, lng, accuracy);
          setProviderPos(smoothed);
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

  // Map initialization counter - used to force re-init if needed
  const [mapInitAttempt, setMapInitAttempt] = useState(0);
  const mapInitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize map using a callback ref for more reliable DOM access
  const initMap = useCallback((container: HTMLDivElement | null) => {
    // Store the ref for other effects
    mapRef.current = container;
    
    if (!container || !request || mapInstanceRef.current) return;

    // Clear any previous initialization timer
    if (mapInitTimerRef.current) clearTimeout(mapInitTimerRef.current);

    // Wait for container to have dimensions
    const tryInit = () => {
      if (!container.isConnected) return;
      
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        // Container not ready yet, retry
        mapInitTimerRef.current = setTimeout(tryInit, 200);
        return;
      }

      if (mapInstanceRef.current) return; // Already initialized

      const centerLat = request.origin_lat || -15.79;
      const centerLng = request.origin_lng || -47.88;
      const zoom = request.origin_lat ? 14 : 5;

      try {
        const map = L.map(container, {
          zoomControl: false,
        }).setView([centerLat, centerLng], zoom);

        L.control.zoom({ position: "bottomright" }).addTo(map);

        const tileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap",
          maxZoom: 19,
        });
        tileLayer.addTo(map);

        // Listen for tile errors to detect loading issues
        tileLayer.on('tileerror', (e: any) => {
          console.warn("Tile load error:", e.tile?.src);
        });

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

        // Aggressive invalidateSize calls
        [0, 50, 150, 300, 600, 1000, 2000, 3000].forEach(delay => {
          setTimeout(() => {
            if (mapInstanceRef.current) {
              mapInstanceRef.current.invalidateSize();
            }
          }, delay);
        });

        // ResizeObserver for ongoing size changes
        const ro = new ResizeObserver(() => {
          if (mapInstanceRef.current) {
            mapInstanceRef.current.invalidateSize();
          }
        });
        ro.observe(container);

        // Store cleanup
        (container as any)._mapCleanup = () => {
          ro.disconnect();
          map.remove();
          mapInstanceRef.current = null;
          providerMarkerRef.current = null;
          routePolylineRef.current = null;
        };
      } catch (err) {
        console.error("Map initialization error:", err);
      }
    };

    // Small initial delay for SPA redirect scenarios
    mapInitTimerRef.current = setTimeout(tryInit, 100);
  }, [request]);

  // Cleanup map on unmount
  useEffect(() => {
    return () => {
      if (mapInitTimerRef.current) clearTimeout(mapInitTimerRef.current);
      if (mapRef.current && (mapRef.current as any)._mapCleanup) {
        (mapRef.current as any)._mapCleanup();
      }
    };
  }, []);

  // Re-trigger map init when request loads
  useEffect(() => {
    if (request && mapRef.current && !mapInstanceRef.current) {
      initMap(mapRef.current);
    }
  }, [request, initMap]);

  // Update provider marker with smooth animation
  useEffect(() => {
    if (!mapInstanceRef.current || !providerPos) return;

    const isMoto = request?.service_type === "tow_motorcycle" || request?.vehicle_category === "motorcycle";
    const vehicleEmoji = isMoto ? "🏍️" : "🚗";

    const providerIcon = L.divIcon({
      html: `<div style="
        width: 40px; height: 40px; 
        background: hsl(218, 58%, 26%); 
        border-radius: 50%; 
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 4px 14px rgba(0,0,0,0.35);
        border: 3px solid white;
        animation: provider-pulse 2s ease-in-out infinite;
      ">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
          <path d="M15 18H9"/>
          <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>
          <circle cx="17" cy="18" r="2"/>
          <circle cx="7" cy="18" r="2"/>
        </svg>
      </div>`,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
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
    // Set nearby when within 1km, clear when beyond 1.5km (hysteresis to prevent flickering)
    if (dist <= 1) {
      if (!isNearby && !notifiedRef.current) {
        setIsNearby(true);
        notifiedRef.current = true;
        playNotificationSound();
        if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
      } else if (!isNearby) {
        setIsNearby(true);
      }
    } else if (dist > 1.5) {
      setIsNearby(false);
    }
  }, [providerPos, request?.origin_lat, request?.origin_lng, isNearby]);

  // Countdown timer for ETA
  useEffect(() => {
    let targetTime: Date | null = null;

    if (dispatch?.scheduled_arrival_date) {
      const timeStr = dispatch.scheduled_arrival_time || "00:00:00";
      targetTime = new Date(`${dispatch.scheduled_arrival_date}T${timeStr}`);
    } else if (dispatch?.estimated_arrival_min && (dispatch?.accepted_at || dispatch?.created_at)) {
      const baseTime = new Date(dispatch.accepted_at || dispatch.created_at);
      targetTime = new Date(baseTime.getTime() + dispatch.estimated_arrival_min * 60 * 1000);
    }

    if (!targetTime || providerArrived) {
      setEtaText(null);
      setEtaMinutes(null);
      return;
    }

    const updateCountdown = () => {
      const now = Date.now();
      const diffMs = targetTime!.getTime() - now;

      if (diffMs <= 0) {
        setEtaText("Chegando...");
        setEtaMinutes(0);
        return;
      }

      const totalSec = Math.floor(diffMs / 1000);
      const hours = Math.floor(totalSec / 3600);
      const mins = Math.floor((totalSec % 3600) / 60);
      const secs = totalSec % 60;

      setEtaMinutes(Math.ceil(diffMs / 60000));

      if (hours > 0) {
        setEtaText(`${hours}h ${String(mins).padStart(2, "0")}min ${String(secs).padStart(2, "0")}s`);
      } else if (mins > 0) {
        setEtaText(`${mins}min ${String(secs).padStart(2, "0")}s`);
      } else {
        setEtaText(`${secs}s`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [dispatch?.estimated_arrival_min, dispatch?.accepted_at, dispatch?.created_at, dispatch?.scheduled_arrival_date, dispatch?.scheduled_arrival_time, providerArrived]);

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

  if (beneficiaryInactive) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 p-4">
        <img src={logoTrilho} alt="ASSIST AI" className="h-12 mb-4" />
        <Card className="max-w-md w-full border-destructive bg-destructive/10">
          <CardContent className="p-6 text-center space-y-3">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <h2 className="text-lg font-bold text-destructive">Situação: INATIVA</h2>
            <p className="text-sm text-muted-foreground">
              Este beneficiário não está ativo no sistema. Entre em contato com sua associação.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isCompleted = dispatch?.status === "completed";
  const isCollision = request?.service_type === "collision";

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
        @keyframes provider-pulse {
          0%, 100% { box-shadow: 0 4px 14px rgba(0,0,0,0.35); }
          50% { box-shadow: 0 4px 20px rgba(0,0,0,0.5), 0 0 0 8px rgba(30,64,120,0.15); }
        }
        @keyframes float-dots {
          0%, 80%, 100% { opacity: 0; transform: translateY(0); }
          40% { opacity: 1; transform: translateY(-4px); }
        }
        .arrival-alert {
          animation: slide-in 0.5s ease-out;
        }
      `}</style>

      {/* Header */}
      <div className="bg-primary text-primary-foreground p-4 shadow-lg">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <img src={logoTrilho} alt="Logo" className="h-10 w-10 rounded-lg shadow" />
          <div className="flex-1">
            <h1 className="text-lg font-bold tracking-tight">Acompanhamento em Tempo Real</h1>
            <p className="text-xs opacity-80">Protocolo: {request?.protocol}</p>
          </div>
          {providerPos && !providerArrived && (
            <div className="flex items-center gap-1.5 bg-primary-foreground/20 rounded-full px-3 py-1.5 backdrop-blur-sm">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs font-semibold">AO VIVO</span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* ══════ COLISÃO: mensagem informativa, sem tracking ══════ */}
        {isCollision ? (
          <>
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary">Colisão</Badge>
                  {request?.vehicle_plate && <Badge variant="outline">{request.vehicle_plate}</Badge>}
                  {isCompleted && <Badge className="bg-green-500 text-white">Concluído</Badge>}
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary/30">
              <CardContent className="pt-6 pb-6 flex flex-col items-center text-center gap-4">
                <div className="bg-primary/10 rounded-full p-4">
                  <ShieldCheck className="h-10 w-10 text-primary" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-lg font-bold">Registro recebido com sucesso</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
                    Em breve, o <strong>setor de eventos</strong> entrará em contato com você para dar sequência ao processo de <strong>reparo ou indenização</strong>.
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
                    Fique atento ao seu telefone. Caso precise, entre em contato conosco pelo mesmo número de WhatsApp.
                  </p>
                </div>
                <div className="text-xs text-muted-foreground pt-2">
                  Protocolo: <span className="font-medium">{request?.protocol}</span>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
        {/* Provider arrived alert */}
        {providerArrived && !isCompleted && (
          <Card className="border-green-500 border-2 bg-green-50 dark:bg-green-950/30 arrival-alert">
            <CardContent className="pt-5 pb-5 flex items-center gap-4">
              <div className="bg-green-500 text-white rounded-full p-3 shrink-0">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <div>
                <p className="font-bold text-green-700 dark:text-green-400 text-base">
                  O prestador chegou ao local! 🎉
                </p>
                <p className="text-sm text-green-600 dark:text-green-500 mt-0.5">
                  <strong>{providerName}</strong> está no ponto de atendimento
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Searching for provider - no dispatch yet */}
        {!dispatch && !isCompleted && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-6 pb-6 flex flex-col items-center text-center gap-4">
              <div className="bg-primary/10 rounded-full p-4">
                <Search className="h-8 w-8 text-primary animate-pulse" />
              </div>
              <div className="space-y-2">
                <h2 className="text-lg font-bold">Estamos localizando o prestador mais próximo</h2>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
                  Nosso time já está buscando o melhor prestador para atender você. Assim que ele for acionado, você poderá acompanhar a chegada <strong>em tempo real</strong> nesta tela.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Fique tranquilo, iremos notificá-lo quando o prestador estiver a caminho.
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
              {request?.vehicle_model && <span className="text-xs text-muted-foreground">{request.vehicle_model}</span>}
              {isCompleted && <Badge className="bg-green-500 text-white">Concluído</Badge>}
            </div>
            {providerName && dispatch && (
              <div className="flex items-center gap-3 bg-muted/30 rounded-lg p-3">
                <div className="bg-primary rounded-full p-2 shrink-0">
                  <Truck className="h-4 w-4 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{providerName}</p>
                  <p className="text-xs text-muted-foreground">Prestador a caminho</p>
                </div>
              </div>
            )}
            {etaText && !providerArrived && (
              <div className="flex items-center gap-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <div className="bg-blue-500 rounded-full p-2 shrink-0">
                  {dispatch?.scheduled_arrival_date ? (
                    <CalendarIcon className="h-5 w-5 text-white" />
                  ) : (
                    <Clock className="h-5 w-5 text-white" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-300 tabular-nums tracking-tight">
                    {etaText}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {dispatch?.scheduled_arrival_date
                      ? `Chegada prevista: ${new Date(dispatch.scheduled_arrival_date + "T00:00:00").toLocaleDateString("pt-BR")}${dispatch.scheduled_arrival_time ? ` às ${dispatch.scheduled_arrival_time.slice(0, 5)}` : ""}`
                      : "Previsão de chegada do prestador"
                    }
                  </p>
                </div>
              </div>
            )}

            {/* Timeline de atualizações */}
            {dispatch && (
              <div className="border-t pt-3 mt-1">
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Histórico</p>
                <div className="space-y-2">
                  {request?.created_at && (
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                      <span className="text-muted-foreground">Solicitação aberta</span>
                      <span className="ml-auto font-medium">{new Date(request.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  )}
                  {dispatch?.created_at && (
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                      <span className="text-muted-foreground">Prestador acionado</span>
                      <span className="ml-auto font-medium">{new Date(dispatch.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  )}
                  {dispatch?.accepted_at && (
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                      <span className="text-muted-foreground">Prestador aceitou</span>
                      <span className="ml-auto font-medium">{new Date(dispatch.accepted_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  )}
                  {dispatch?.provider_arrived_at && (
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                      <span className="text-muted-foreground">Chegou ao local</span>
                      <span className="ml-auto font-medium">{new Date(dispatch.provider_arrived_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  )}
                  {dispatch?.completed_at && (
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-2 h-2 rounded-full bg-green-600 shrink-0" />
                      <span className="text-muted-foreground">Concluído</span>
                      <span className="ml-auto font-medium">{new Date(dispatch.completed_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  )}
                  {lastUpdate && !providerArrived && (
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
                      <span className="text-muted-foreground">Última posição GPS</span>
                      <span className="ml-auto font-medium">{lastUpdate.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Nearby alert */}
        {isNearby && !providerArrived && (
          <Card className="border-primary border-2 bg-primary/10 arrival-alert">
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <Bell className="h-6 w-6 text-primary animate-bounce" />
              <div>
                <p className="font-bold text-primary text-sm">Prestador muito próximo!</p>
                <p className="text-xs text-muted-foreground">
                  {distanceKm !== null && `A apenas ${(distanceKm * 1000).toFixed(0)}m de distância`}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Waiting for location warning */}
        {waitingLocation && !providerPos && dispatch && (
          <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <Clock className="h-5 w-5 text-amber-600" />
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  Aguardando localização do prestador...
                </p>
                <p className="text-xs text-amber-600/70 dark:text-amber-500/70">
                  O GPS do prestador será ativado em breve
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Map */}
        <Card className="overflow-hidden shadow-md">
          <CardContent className="p-0">
            <div className="px-4 pt-4 pb-2 flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                {providerArrived ? "Prestador no local" : providerPos ? "Acompanhe em tempo real" : "Mapa do atendimento"}
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

            {!providerPos && dispatch && !waitingLocation && (
              <div className="flex items-center gap-2 px-4 pb-3">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Conectando ao GPS do prestador...</p>
              </div>
            )}

            <div
              ref={initMap}
              className="w-full"
              style={{ height: "400px", minHeight: "400px" }}
            />

            {/* Map legend */}
            <div className="px-4 py-3 flex items-center gap-4 text-xs text-muted-foreground border-t bg-muted/30">
              {providerPos && (
                <span className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                    <Truck className="h-2.5 w-2.5 text-primary-foreground" />
                  </div>
                  Prestador
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-primary" />
                Seu veículo
              </span>
              {providerPos && (
                <span className="flex items-center gap-1.5">
                  <div className="w-4 h-0.5 border-t-2 border-dashed border-primary/60" />
                  Rota estimada
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Beneficiary arrival confirmation */}
        {dispatch && !beneficiaryArrived && !isCompleted && (
          <Button onClick={handleBeneficiaryArrival} className="w-full gap-2 shadow-md" size="lg">
            <CheckCircle2 className="h-5 w-5" />
            Confirmar que o prestador chegou
          </Button>
        )}
        {beneficiaryArrived && (
          <div className="flex items-center justify-center gap-2 text-sm text-green-600 font-medium py-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
            <CheckCircle2 className="h-5 w-5" />
            Chegada do prestador confirmada ✓
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}
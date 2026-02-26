import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Loader2, Route } from "lucide-react";

interface Props {
  originCoords: { lat: number; lng: number } | null;
  destinationCoords: { lat: number; lng: number } | null;
  providerCoords?: { lat: number; lng: number } | null;
  onDistanceCalculated?: (km: number) => void;
}

async function fetchOSRMDistance(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<{ km: number; min: number } | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code !== "Ok") return null;
    return {
      km: (data.routes[0]?.distance || 0) / 1000,
      min: (data.routes[0]?.duration || 0) / 60,
    };
  } catch (err) {
    console.error("OSRM route calculation error:", err);
    return null;
  }
}

async function calculateRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  providerBase?: { lat: number; lng: number } | null
): Promise<{ distanceKm: number; durationMin: number; description: string } | null> {
  try {
    if (providerBase) {
      // Phase 2: Provider Base → Origin → Destination + provider return km
      const [leg1, leg2, leg3] = await Promise.all([
        fetchOSRMDistance(providerBase, origin),
        fetchOSRMDistance(origin, destination),
        fetchOSRMDistance(destination, providerBase),
      ]);
      if (!leg1 || !leg2 || !leg3) return null;
      const totalKm = leg1.km + leg2.km + leg3.km;
      const totalMin = leg1.min + leg2.min + leg3.min;
      return { distanceKm: totalKm, durationMin: totalMin, description: "Base Prestador → Origem → Destino → Retorno Prestador" };
    } else {
      // Phase 1: Origin → Destination → Origin + 10km
      const [leg1, leg2] = await Promise.all([
        fetchOSRMDistance(origin, destination),
        fetchOSRMDistance(destination, origin),
      ]);
      if (!leg1 || !leg2) return null;
      const totalKm = leg1.km + leg2.km + 10;
      const totalMin = leg1.min + leg2.min;
      return { distanceKm: totalKm, durationMin: totalMin, description: "Origem → Destino → Retorno + 10 km" };
    }
  } catch (err) {
    console.error("Route calculation error:", err);
    return null;
  }
}

export default function RouteDistanceDisplay({ originCoords, destinationCoords, providerCoords, onDistanceCalculated }: Props) {
  const [loading, setLoading] = useState(false);
  const [routeData, setRouteData] = useState<{ distanceKm: number; durationMin: number; description: string } | null>(null);

  useEffect(() => {
    if (!originCoords || !destinationCoords) {
      setRouteData(null);
      return;
    }

    let cancelled = false;
    const calc = async () => {
      setLoading(true);
      const result = await calculateRoute(originCoords, destinationCoords, providerCoords);
      if (!cancelled) {
        setRouteData(result);
        setLoading(false);
        if (result && onDistanceCalculated) {
          onDistanceCalculated(result.distanceKm);
        }
      }
    };
    calc();
    return () => { cancelled = true; };
  }, [originCoords?.lat, originCoords?.lng, destinationCoords?.lat, destinationCoords?.lng, providerCoords?.lat, providerCoords?.lng]);

  if (!originCoords || !destinationCoords) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Calculando roteirização...
      </div>
    );
  }

  if (!routeData) return null;

  const formatDuration = (min: number) => {
    if (min < 60) return `${Math.round(min)} min`;
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return `${h}h${m > 0 ? ` ${m}min` : ""}`;
  };

  return (
    <div className="rounded-md border bg-muted/50 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Route className="h-4 w-4 text-primary" />
        Roteirização Estimada
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary" className="text-sm">
          📏 {routeData.distanceKm.toFixed(1)} km
        </Badge>
        <Badge variant="outline" className="text-sm">
          ⏱️ {formatDuration(routeData.durationMin)}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        {routeData.description}
      </p>
    </div>
  );
}

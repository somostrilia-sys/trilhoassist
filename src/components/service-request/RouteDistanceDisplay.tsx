import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Loader2, Route } from "lucide-react";

interface Props {
  originCoords: { lat: number; lng: number } | null;
  destinationCoords: { lat: number; lng: number } | null;
  onDistanceCalculated?: (km: number) => void;
}

async function calculateOSRMRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<{ distanceKm: number; durationMin: number } | null> {
  try {
    // Origin → Destination
    const leg1Url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=false`;
    // Destination → Origin (return)
    const leg2Url = `https://router.project-osrm.org/route/v1/driving/${destination.lng},${destination.lat};${origin.lng},${origin.lat}?overview=false`;

    const [res1, res2] = await Promise.all([fetch(leg1Url), fetch(leg2Url)]);
    const [data1, data2] = await Promise.all([res1.json(), res2.json()]);

    if (data1.code !== "Ok" || data2.code !== "Ok") return null;

    const leg1Km = (data1.routes[0]?.distance || 0) / 1000;
    const leg2Km = (data2.routes[0]?.distance || 0) / 1000;
    const leg1Min = (data1.routes[0]?.duration || 0) / 60;
    const leg2Min = (data2.routes[0]?.duration || 0) / 60;

    // Total: Origem → Destino → Origem + 10km
    const totalKm = leg1Km + leg2Km + 10;
    const totalMin = leg1Min + leg2Min;

    return { distanceKm: totalKm, durationMin: totalMin };
  } catch (err) {
    console.error("OSRM route calculation error:", err);
    return null;
  }
}

export default function RouteDistanceDisplay({ originCoords, destinationCoords, onDistanceCalculated }: Props) {
  const [loading, setLoading] = useState(false);
  const [routeData, setRouteData] = useState<{ distanceKm: number; durationMin: number } | null>(null);

  useEffect(() => {
    if (!originCoords || !destinationCoords) {
      setRouteData(null);
      return;
    }

    let cancelled = false;
    const calc = async () => {
      setLoading(true);
      const result = await calculateOSRMRoute(originCoords, destinationCoords);
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
  }, [originCoords?.lat, originCoords?.lng, destinationCoords?.lat, destinationCoords?.lng]);

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
        Origem → Destino → Retorno + 10 km
      </p>
    </div>
  );
}

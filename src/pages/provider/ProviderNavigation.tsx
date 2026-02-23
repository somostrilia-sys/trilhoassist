import { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Navigation, ExternalLink, Car, Phone, Copy, CheckCheck } from "lucide-react";
import RouteMap, { type RoutePoint } from "@/components/RouteMap";
import logoTrilho from "@/assets/logo-trilho.png";

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

function buildGoogleMapsUrl(points: RoutePoint[]): string {
  if (points.length < 2) return "";
  const origin = `${points[0].lat},${points[0].lng}`;
  const destination = `${points[points.length - 1].lat},${points[points.length - 1].lng}`;
  const waypoints = points
    .slice(1, -1)
    .map((p) => `${p.lat},${p.lng}`)
    .join("|");
  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
  if (waypoints) url += `&waypoints=${waypoints}`;
  url += `&travelmode=driving`;
  return url;
}

function buildWazeUrl(lat: number, lng: number): string {
  return `https://www.waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}

export default function ProviderNavigation() {
  const { dispatchId } = useParams<{ dispatchId: string }>();
  const [dispatch, setDispatch] = useState<any>(null);
  const [request, setRequest] = useState<any>(null);
  const [provider, setProvider] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dispatchId) return;
    const load = async () => {
      // Fetch dispatch with provider
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

      // Fetch service request
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

  const routePoints = useMemo<RoutePoint[]>(() => {
    if (!request) return [];
    const pts: RoutePoint[] = [];
    const hasOrigin = request.origin_lat && request.origin_lng;
    const hasDest = request.destination_lat && request.destination_lng;
    const hasProvider = provider?.latitude && provider?.longitude;

    if (!hasOrigin) return [];

    const providerLabel = provider?.name || "Sua base";

    if (hasProvider) {
      pts.push({ label: `${providerLabel} (saída)`, lat: provider.latitude, lng: provider.longitude, color: "#6366f1" });
    }
    pts.push({ label: "Origem (cliente)", lat: request.origin_lat, lng: request.origin_lng, color: "#22c55e" });
    if (hasDest) {
      pts.push({ label: "Destino", lat: request.destination_lat, lng: request.destination_lng, color: "#ef4444" });
    }
    if (hasProvider) {
      pts.push({ label: `${providerLabel} (retorno)`, lat: provider.latitude, lng: provider.longitude, color: "#6366f1" });
    }

    return pts;
  }, [request, provider]);

  // Quick navigation buttons for origin only
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

  const fullRouteGoogleUrl = routePoints.length >= 2 ? buildGoogleMapsUrl(routePoints) : "";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Carregando navegação...</p>
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
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
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

        {/* Full route map */}
        {routePoints.length >= 2 && <RouteMap points={routePoints} title="ROTA COMPLETA" />}

        {/* Full route in Google Maps */}
        {fullRouteGoogleUrl && (
          <Button variant="outline" className="w-full gap-2" asChild>
            <a href={fullRouteGoogleUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
              Abrir rota completa no Google Maps
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

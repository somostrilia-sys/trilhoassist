import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Navigation, ExternalLink } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface RoutePoint {
  label: string;
  lat: number;
  lng: number;
  color: string;
}

interface RouteMapProps {
  points: RoutePoint[];
  /** Title to display above the map */
  title?: string;
}

// Fix default marker icon issue with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function createColorIcon(color: string) {
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="
      width: 28px; height: 28px; border-radius: 50% 50% 50% 0;
      background: ${color}; transform: rotate(-45deg);
      border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      display: flex; align-items: center; justify-content: center;
    "><div style="
      width: 10px; height: 10px; border-radius: 50%;
      background: white; transform: rotate(45deg);
    "></div></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  });
}

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

function buildWazeUrl(points: RoutePoint[]): string {
  // Waze only supports navigate to a single destination, use final destination
  const dest = points[points.length - 1];
  return `https://www.waze.com/ul?ll=${dest.lat},${dest.lng}&navigate=yes`;
}

async function fetchOSRMRoute(points: RoutePoint[]): Promise<[number, number][]> {
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`
    );
    const data = await res.json();
    if (data.routes?.[0]?.geometry?.coordinates) {
      return data.routes[0].geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]);
    }
  } catch (err) {
    console.error("OSRM routing failed:", err);
  }
  // Fallback: straight lines
  return points.map((p) => [p.lat, p.lng]);
}

export default function RouteMap({ points, title = "ROTEIRIZAÇÃO" }: RouteMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [totalKm, setTotalKm] = useState<number | null>(null);

  useEffect(() => {
    if (!mapRef.current || points.length < 2) return;

    // Clean up previous map
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: true });
    mapInstanceRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    // Add markers
    const bounds = L.latLngBounds([]);
    points.forEach((point, idx) => {
      const marker = L.marker([point.lat, point.lng], { icon: createColorIcon(point.color) }).addTo(map);
      marker.bindPopup(`<b>${idx + 1}. ${point.label}</b>`);
      bounds.extend([point.lat, point.lng]);
    });

    map.fitBounds(bounds, { padding: [40, 40] });

    // Fetch route
    fetchOSRMRoute(points).then((routeCoords) => {
      L.polyline(routeCoords, {
        color: "hsl(220, 70%, 50%)",
        weight: 4,
        opacity: 0.8,
        dashArray: "8, 4",
      }).addTo(map);

      // Calculate total distance
      let totalM = 0;
      for (let i = 1; i < routeCoords.length; i++) {
        totalM += L.latLng(routeCoords[i - 1]).distanceTo(L.latLng(routeCoords[i]));
      }
      setTotalKm(Math.round(totalM / 1000));
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [points]);

  if (points.length < 2) return null;

  const googleUrl = buildGoogleMapsUrl(points);
  const wazeUrl = buildWazeUrl(points);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Navigation className="h-5 w-5" /> {title}
          {totalKm !== null && (
            <span className="text-sm font-normal text-muted-foreground ml-2">
              ~ {totalKm} km total
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Route steps */}
        <div className="flex flex-wrap gap-2 items-center text-sm">
          {points.map((point, idx) => (
            <div key={idx} className="flex items-center gap-1">
              {idx > 0 && <span className="text-muted-foreground mx-1">→</span>}
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: point.color }}
              />
              <span className="font-medium">{point.label}</span>
            </div>
          ))}
        </div>

        {/* Map */}
        <div
          ref={mapRef}
          className="w-full rounded-lg border overflow-hidden"
          style={{ height: 380 }}
        />

        {/* External links */}
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" asChild>
            <a href={googleUrl} target="_blank" rel="noopener noreferrer" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Abrir no Google Maps
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={wazeUrl} target="_blank" rel="noopener noreferrer" className="gap-2">
              <MapPin className="h-4 w-4" />
              Abrir no Waze
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Navigation, ExternalLink } from "lucide-react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export interface RoutePoint {
  label: string;
  lat: number;
  lng: number;
  color: string;
}

interface RouteMapProps {
  points: RoutePoint[];
  title?: string;
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
      return data.routes[0].geometry.coordinates as [number, number][];
    }
  } catch (err) {
    console.error("OSRM routing failed:", err);
  }
  return points.map((p) => [p.lng, p.lat]);
}

function haversineDistance(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return Math.round(total);
}

export default function RouteMap({ points, title = "ROTEIRIZAÇÃO" }: RouteMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [totalKm, setTotalKm] = useState<number | null>(null);

  useEffect(() => {
    if (!mapContainer.current || points.length < 2) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: [points[0].lng, points[0].lat],
      zoom: 10,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;

    // Add markers
    const bounds = new maplibregl.LngLatBounds();
    points.forEach((point, idx) => {
      const el = document.createElement("div");
      el.innerHTML = `<div style="
        width: 28px; height: 28px; border-radius: 50% 50% 50% 0;
        background: ${point.color}; transform: rotate(-45deg);
        border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        display: flex; align-items: center; justify-content: center;
      "><div style="
        width: 10px; height: 10px; border-radius: 50%;
        background: white; transform: rotate(45deg);
      "></div></div>`;
      el.style.cursor = "pointer";

      new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([point.lng, point.lat])
        .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(`<b>${idx + 1}. ${point.label}</b>`))
        .addTo(map);

      bounds.extend([point.lng, point.lat]);
    });

    map.fitBounds(bounds, { padding: 50 });

    // Fetch and draw route
    map.on("load", () => {
      fetchOSRMRoute(points).then((routeCoords) => {
        map.addSource("route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: routeCoords },
          },
        });

        map.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "hsl(220, 70%, 50%)",
            "line-width": 4,
            "line-opacity": 0.8,
            "line-dasharray": [2, 1],
          },
        });

        setTotalKm(haversineDistance(routeCoords));
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
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

        <div
          ref={mapContainer}
          className="w-full rounded-lg border overflow-hidden"
          style={{ height: 380 }}
        />

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

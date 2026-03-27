import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Navigation, ExternalLink, AlertCircle } from "lucide-react";
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
  distanceKm?: number | null;
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

async function fetchOSRMRoute(
  points: RoutePoint[]
): Promise<{ coords: [number, number][]; distanceKm: number }> {
  const coordsStr = points.map((p) => `${p.lng},${p.lat}`).join(";");
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`,
        { signal: controller.signal }
      );
      const data = await res.json();
      if (data.routes?.[0]?.geometry?.coordinates) {
        const distanceKm = (data.routes[0].distance || 0) / 1000;
        return {
          coords: data.routes[0].geometry.coordinates as [number, number][],
          distanceKm,
        };
      }
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    console.error("OSRM routing failed:", err);
  }
  return { coords: points.map((p) => [p.lng, p.lat]), distanceKm: 0 };
}

// Multiple tile style options to try in order
const TILE_STYLES = [
  // OpenFreeMap (Liberty style) - free, no auth, good CORS
  "https://tiles.openfreemap.org/styles/liberty",
  // Fallback: MapTiler basic (free tier, may need key but works without for basic)
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
];

export default function RouteMap({
  points,
  title = "ROTEIRIZAÇÃO",
  distanceKm: externalDistanceKm,
}: RouteMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [calculatedKm, setCalculatedKm] = useState<number | null>(null);
  const [mapError, setMapError] = useState(false);
  const totalKm =
    externalDistanceKm != null ? Math.round(externalDistanceKm) : calculatedKm;

  useEffect(() => {
    if (!mapContainer.current || points.length < 2) return;

    let map: maplibregl.Map | null = null;
    let destroyed = false;

    const initMap = async (styleIndex = 0) => {
      if (destroyed || !mapContainer.current) return;

      const style = TILE_STYLES[styleIndex] || TILE_STYLES[0];

      try {
        map = new maplibregl.Map({
          container: mapContainer.current,
          style,
          center: [points[0].lng, points[0].lat],
          zoom: 10,
        });

        map.addControl(new maplibregl.NavigationControl(), "top-right");
        mapRef.current = map;

        map.on("error", (e) => {
          console.error("MapLibre error:", e);
          if (!destroyed && styleIndex + 1 < TILE_STYLES.length) {
            // Try next style
            map?.remove();
            mapRef.current = null;
            initMap(styleIndex + 1);
          } else if (!destroyed) {
            setMapError(true);
          }
        });

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
            .setPopup(
              new maplibregl.Popup({ offset: 25 }).setHTML(
                `<b>${idx + 1}. ${point.label}</b>`
              )
            )
            .addTo(map!);

          bounds.extend([point.lng, point.lat]);
        });

        map.fitBounds(bounds, { padding: 50 });

        // Fetch and draw route
        map.on("load", () => {
          if (destroyed) return;
          fetchOSRMRoute(points).then(({ coords: routeCoords, distanceKm }) => {
            if (destroyed || !map) return;

            try {
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
            } catch (err) {
              console.error("Error adding route layer:", err);
            }

            // Only set calculated km if no external value provided
            if (externalDistanceKm == null) {
              setCalculatedKm(Math.round(distanceKm));
            }
          });
        });
      } catch (err) {
        console.error("MapLibre init failed:", err);
        if (!destroyed) setMapError(true);
      }
    };

    initMap(0);

    return () => {
      destroyed = true;
      map?.remove();
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
        {/* Route summary */}
        <div className="flex flex-wrap gap-2 items-center text-sm">
          {points.map((point, idx) => (
            <div key={idx} className="flex items-center gap-1">
              {idx > 0 && (
                <span className="text-muted-foreground mx-1">→</span>
              )}
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: point.color }}
              />
              <span className="font-medium">{point.label}</span>
            </div>
          ))}
        </div>

        {/* Map or fallback */}
        {mapError ? (
          <div className="w-full rounded-lg border bg-muted/30 flex flex-col items-center justify-center gap-3 p-6" style={{ height: 200 }}>
            <AlertCircle className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center">
              Mapa indisponível. Use os links abaixo para navegação.
            </p>
            {totalKm !== null && (
              <p className="text-sm font-medium">
                Distância estimada: ~{totalKm} km
              </p>
            )}
          </div>
        ) : (
          <div
            ref={mapContainer}
            className="w-full rounded-lg border overflow-hidden"
            style={{ height: 380 }}
          />
        )}

        {/* Navigation buttons */}
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" asChild>
            <a
              href={googleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              Abrir no Google Maps
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a
              href={wazeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="gap-2"
            >
              <MapPin className="h-4 w-4" />
              Abrir no Waze
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

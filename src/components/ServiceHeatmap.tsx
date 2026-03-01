import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

interface HeatmapProps {
  points: [number, number, number?][]; // [lat, lng, intensity?]
}

export default function ServiceHeatmap({ points }: HeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || points.length === 0) return;

    // Wait for container to have dimensions
    const tryInit = () => {
      const el = containerRef.current;
      if (!el || el.offsetWidth === 0 || el.offsetHeight === 0) {
        requestAnimationFrame(tryInit);
        return;
      }

      const map = new maplibregl.Map({
        container: el,
        style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
        center: [-47.93, -15.78],
        zoom: 3,
      });

      map.addControl(new maplibregl.NavigationControl(), "top-right");
      mapRef.current = map;

      map.on("load", () => {
        map.resize();

        // Add heatmap source + layers
        const geojson: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: points.map(([lat, lng, intensity]) => ({
            type: "Feature" as const,
            properties: { intensity: intensity ?? 1 },
            geometry: { type: "Point" as const, coordinates: [lng, lat] },
          })),
        };

        if (!map.getSource("heat-source")) {
          map.addSource("heat-source", { type: "geojson", data: geojson });

          map.addLayer({
            id: "heat-layer",
            type: "heatmap",
            source: "heat-source",
            paint: {
              "heatmap-weight": ["get", "intensity"],
              "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 12, 3],
              "heatmap-color": [
                "interpolate", ["linear"], ["heatmap-density"],
                0, "rgba(0,0,0,0)",
                0.2, "#2563eb",
                0.4, "#06b6d4",
                0.6, "#22c55e",
                0.8, "#eab308",
                1.0, "#ef4444",
              ],
              "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 6, 12, 30],
              "heatmap-opacity": 0.7,
            },
          });

          map.addLayer({
            id: "points-layer",
            type: "circle",
            source: "heat-source",
            paint: {
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 4, 8, 6, 14, 10],
              "circle-color": "#2563eb",
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
              "circle-opacity": 0.9,
            },
          });
        }

        // Also add native HTML markers as guaranteed fallback
        markersRef.current.forEach((m) => m.remove());
        markersRef.current = [];

        points.forEach(([lat, lng]) => {
          const markerEl = document.createElement("div");
          markerEl.style.cssText =
            "width:12px;height:12px;border-radius:50%;background:#2563eb;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);";

          const marker = new maplibregl.Marker({ element: markerEl })
            .setLngLat([lng, lat])
            .addTo(map);
          markersRef.current.push(marker);
        });

        // Fit bounds
        if (points.length > 0) {
          const bounds = new maplibregl.LngLatBounds();
          points.forEach(([lat, lng]) => bounds.extend([lng, lat]));
          map.fitBounds(bounds, { padding: 50, maxZoom: 12 });
        }

        setTimeout(() => map.resize(), 300);
      });
    };

    tryInit();

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [points]);

  return (
    <div ref={containerRef} className="h-[450px] w-full rounded-lg overflow-hidden border" />
  );
}

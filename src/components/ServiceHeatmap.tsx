import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

interface HeatmapProps {
  points: [number, number, number?][]; // [lat, lng, intensity?]
}

export default function ServiceHeatmap({ points }: HeatmapProps) {
  const mapRef = useRef<maplibregl.Map | null>(null);

  const containerRef = useCallback(
    (node: HTMLDivElement | null) => {
      // Cleanup previous map
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      if (!node || points.length === 0) return;

      const initMap = () => {
        if (!node.offsetWidth || !node.offsetHeight) {
          requestAnimationFrame(initMap);
          return;
        }

        const map = new maplibregl.Map({
          container: node,
          style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
          center: [-47.93, -15.78],
          zoom: 3,
        });

        map.addControl(new maplibregl.NavigationControl(), "top-right");
        mapRef.current = map;

        map.on("load", () => {
          map.resize();

          const geojson: GeoJSON.FeatureCollection = {
            type: "FeatureCollection",
            features: points.map(([lat, lng, intensity]) => ({
              type: "Feature" as const,
              properties: { intensity: intensity ?? 1 },
              geometry: {
                type: "Point" as const,
                coordinates: [lng, lat],
              },
            })),
          };

          map.addSource("heat-source", { type: "geojson", data: geojson });

          map.addLayer({
            id: "heat-layer",
            type: "heatmap",
            source: "heat-source",
            paint: {
              "heatmap-weight": ["get", "intensity"],
              "heatmap-intensity": [
                "interpolate", ["linear"], ["zoom"],
                0, 1,
                12, 3,
              ],
              "heatmap-color": [
                "interpolate", ["linear"], ["heatmap-density"],
                0, "rgba(0,0,0,0)",
                0.2, "#2563eb",
                0.4, "#06b6d4",
                0.6, "#22c55e",
                0.8, "#eab308",
                1.0, "#ef4444",
              ],
              "heatmap-radius": [
                "interpolate", ["linear"], ["zoom"],
                0, 4,
                12, 30,
              ],
              "heatmap-opacity": 0.8,
            },
          });

          if (points.length > 0) {
            const bounds = new maplibregl.LngLatBounds();
            points.forEach(([lat, lng]) => bounds.extend([lng, lat]));
            map.fitBounds(bounds, { padding: 40, maxZoom: 12 });
          }

          // Force resize after layout settles
          setTimeout(() => map.resize(), 200);
          setTimeout(() => map.resize(), 1000);
        });
      };

      initMap();
    },
    [points]
  );

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-[450px] w-full rounded-lg overflow-hidden border"
    />
  );
}

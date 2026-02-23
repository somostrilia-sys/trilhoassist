import { useEffect } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";

// Extend L type for heat
declare module "leaflet" {
  function heatLayer(latlngs: [number, number, number?][], options?: any): any;
}

interface HeatmapProps {
  points: [number, number, number?][]; // [lat, lng, intensity?]
}

function HeatLayer({ points }: HeatmapProps) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;

    const heat = L.heatLayer(points, {
      radius: 25,
      blur: 15,
      maxZoom: 17,
      max: 1.0,
      gradient: {
        0.2: "#2563eb",
        0.4: "#06b6d4",
        0.6: "#22c55e",
        0.8: "#eab308",
        1.0: "#ef4444",
      },
    }).addTo(map);

    // Fit bounds to points
    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map(([lat, lng]) => [lat, lng]));
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
    }

    return () => {
      map.removeLayer(heat);
    };
  }, [map, points]);

  return null;
}

export default function ServiceHeatmap({ points }: HeatmapProps) {
  // Default center: Brazil
  const defaultCenter: [number, number] = [-15.78, -47.93];
  const hasPoints = points.length > 0;

  return (
    <div className="h-[450px] w-full rounded-lg overflow-hidden border">
      <MapContainer
        center={defaultCenter}
        zoom={4}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {hasPoints && <HeatLayer points={points} />}
      </MapContainer>
    </div>
  );
}

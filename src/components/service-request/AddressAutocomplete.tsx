import { useState, useRef, useCallback, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin, MapPinned, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Prediction {
  place_id: string;
  description: string;
  main_text: string;
  secondary_text: string;
}

interface PlaceResult {
  formatted_address: string;
  name: string;
  lat: number;
  lng: number;
  city?: string;
  state?: string;
  address_components?: Array<{ long_name: string; short_name: string; types: string[] }>;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect: (place: PlaceResult) => void;
  placeholder?: string;
  error?: string;
  tenantId?: string | null;
  disabled?: boolean;
  className?: string;
  coords?: { lat: number; lng: number } | null;
  /** Google Places types filter, e.g. "address" for exact addresses only */
  types?: string;
}

export default function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  placeholder = "Digite o endereço...",
  error,
  tenantId,
  disabled,
  className,
  coords,
  types,
}: Props) {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectingPlace, setSelectingPlace] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTokenRef = useRef(crypto.randomUUID());
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchPredictions = useCallback(async (input: string) => {
    if (input.trim().length < 3) {
      setPredictions([]);
      setShowDropdown(false);
      return;
    }

    setLoading(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/google-places`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          action: "autocomplete",
          input,
          tenant_id: tenantId,
          sessiontoken: sessionTokenRef.current,
          ...(types ? { types } : {}),
        }),
      });
      const data = await res.json();
      if (data.success && data.predictions?.length > 0) {
        setPredictions(data.predictions);
        setShowDropdown(true);
      } else {
        setPredictions([]);
        setShowDropdown(false);
      }
    } catch (err) {
      console.error("Autocomplete error:", err);
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  const handleInputChange = (newValue: string) => {
    onChange(newValue);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPredictions(newValue), 400);
  };

  const handleSelectPrediction = async (prediction: Prediction) => {
    setSelectingPlace(true);
    setShowDropdown(false);
    onChange(prediction.description);

    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/google-places`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          action: "place_details",
          place_id: prediction.place_id,
          tenant_id: tenantId,
          sessiontoken: sessionTokenRef.current,
        }),
      });
      const data = await res.json();
      if (data.success && data.place) {
        onChange(data.place.formatted_address);
        // Extract city and state from address_components
        const components = data.place.address_components || [];
        const cityComp = components.find((c: any) => c.types?.includes("administrative_area_level_2")) 
          || components.find((c: any) => c.types?.includes("locality"));
        const stateComp = components.find((c: any) => c.types?.includes("administrative_area_level_1"));
        onPlaceSelect({
          ...data.place,
          city: cityComp?.long_name || "",
          state: stateComp?.short_name || "",
        });
      }
      // Rotate session token after place details call
      sessionTokenRef.current = crypto.randomUUID();
    } catch (err) {
      console.error("Place details error:", err);
    } finally {
      setSelectingPlace(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={cn("pr-9", error ? "border-destructive" : "", className)}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {(loading || selectingPlace) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {!loading && !selectingPlace && coords && <MapPinned className="h-4 w-4 text-green-600" />}
          {!loading && !selectingPlace && !coords && value.length > 0 && <MapPin className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      {coords && (
        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
          <MapPinned className="h-3 w-3" /> Localizado: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
        </p>
      )}

      {showDropdown && predictions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
          {predictions.map((p) => (
            <button
              key={p.place_id}
              type="button"
              className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors border-b border-border/50 last:border-0"
              onClick={() => handleSelectPrediction(p)}
            >
              <p className="text-sm font-medium text-foreground">{p.main_text}</p>
              <p className="text-xs text-muted-foreground">{p.secondary_text}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

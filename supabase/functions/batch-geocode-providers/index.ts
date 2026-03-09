import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get tenant API key (which works for Places API)
    const { data: tenant } = await supabase
      .from("tenants")
      .select("google_api_key")
      .not("google_api_key", "is", null)
      .limit(1)
      .single();

    const apiKey = tenant?.google_api_key || Deno.env.get("GOOGLE_PLACES_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Google API Key not configured" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get providers missing lat/lng but having city (at minimum)
    const { data: providers, error } = await supabase
      .from("providers")
      .select("id, name, street, address_number, neighborhood, city, state")
      .is("latitude", null)
      .not("city", "is", null)
      .limit(25); // Smaller batch - 2 API calls per provider

    if (error) throw error;
    if (!providers || providers.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No providers to geocode", processed: 0, remaining: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const provider of providers) {
      try {
        // Build search query
        const parts = [
          provider.street,
          provider.address_number,
          provider.neighborhood,
          provider.city,
          provider.state,
        ].filter(Boolean);
        const query = parts.join(", ");

        // Step 1: Autocomplete to get place_id
        const autoUrl = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
        autoUrl.searchParams.set("input", query);
        autoUrl.searchParams.set("language", "pt-BR");
        autoUrl.searchParams.set("components", "country:br");
        autoUrl.searchParams.set("key", apiKey);

        const autoResp = await fetch(autoUrl.toString());
        const autoData = await autoResp.json();

        if (autoData.status !== "OK" || !autoData.predictions?.[0]?.place_id) {
          // Fallback: try city only
          const cityQuery = [provider.city, provider.state].filter(Boolean).join(", ");
          const cityUrl = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
          cityUrl.searchParams.set("input", cityQuery);
          cityUrl.searchParams.set("language", "pt-BR");
          cityUrl.searchParams.set("components", "country:br");
          cityUrl.searchParams.set("key", apiKey);

          const cityResp = await fetch(cityUrl.toString());
          const cityData = await cityResp.json();

          if (cityData.status !== "OK" || !cityData.predictions?.[0]?.place_id) {
            errors.push(`${provider.name}: no results for "${query}"`);
            failed++;
            continue;
          }

          // Get details for city
          const loc = await getPlaceLocation(cityData.predictions[0].place_id, apiKey);
          if (loc) {
            await supabase.from("providers").update({ latitude: loc.lat, longitude: loc.lng }).eq("id", provider.id);
            processed++;
          } else {
            errors.push(`${provider.name}: city details failed`);
            failed++;
          }
          await new Promise((r) => setTimeout(r, 150));
          continue;
        }

        // Step 2: Get place details for lat/lng
        const placeId = autoData.predictions[0].place_id;
        const loc = await getPlaceLocation(placeId, apiKey);
        
        if (loc) {
          await supabase.from("providers").update({ latitude: loc.lat, longitude: loc.lng }).eq("id", provider.id);
          processed++;
        } else {
          errors.push(`${provider.name}: details failed`);
          failed++;
        }

        await new Promise((r) => setTimeout(r, 150));
      } catch (e) {
        errors.push(`${provider.name}: ${(e as Error).message}`);
        failed++;
      }
    }

    const { count } = await supabase
      .from("providers")
      .select("id", { count: "exact", head: true })
      .is("latitude", null)
      .not("city", "is", null);

    return new Response(
      JSON.stringify({ success: true, processed, failed, remaining: count || 0, errors: errors.slice(0, 10) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error("Batch geocode error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function getPlaceLocation(placeId: string, apiKey: string): Promise<{ lat: number; lng: number } | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "geometry");
  url.searchParams.set("language", "pt-BR");
  url.searchParams.set("key", apiKey);

  const resp = await fetch(url.toString());
  const data = await resp.json();

  if (data.status === "OK" && data.result?.geometry?.location) {
    return data.result.geometry.location;
  }
  return null;
}

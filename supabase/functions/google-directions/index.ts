import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getGoogleApiKey(tenantId?: string): Promise<string> {
  const adminSupabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  if (!tenantId) return "";

  const { data: tenant } = await adminSupabase
    .from("tenants")
    .select("google_api_key")
    .eq("id", tenantId)
    .maybeSingle();

  return (tenant as any)?.google_api_key || "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { tenant_id, origin, destination } = body || {};

    if (!tenant_id) {
      return new Response(JSON.stringify({ success: false, error: "tenant_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!origin?.lat || !origin?.lng || !destination?.lat || !destination?.lng) {
      return new Response(JSON.stringify({ success: false, error: "origin e destination com lat/lng são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = await getGoogleApiKey(tenant_id);
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: "Google API Key não configurada no tenant" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Route: origin -> destination -> origin (via waypoints)
    const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
    url.searchParams.set("origin", `${origin.lat},${origin.lng}`);
    url.searchParams.set("destination", `${origin.lat},${origin.lng}`);
    url.searchParams.set("waypoints", `${destination.lat},${destination.lng}`);
    url.searchParams.set("mode", "driving");
    url.searchParams.set("language", "pt-BR");
    url.searchParams.set("key", apiKey);

    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.status !== "OK") {
      return new Response(
        JSON.stringify({ success: false, error: `Google Directions: ${data.status}`, details: data.error_message || null }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const legs = data.routes?.[0]?.legs || [];
    const distanceMeters = legs.reduce((acc: number, l: any) => acc + (l.distance?.value || 0), 0);
    const durationSeconds = legs.reduce((acc: number, l: any) => acc + (l.duration?.value || 0), 0);

    return new Response(
      JSON.stringify({
        success: true,
        distance_meters: distanceMeters,
        distance_km: distanceMeters / 1000,
        duration_seconds: durationSeconds,
        legs: legs.map((l: any) => ({
          start_address: l.start_address,
          end_address: l.end_address,
          distance_meters: l.distance?.value || 0,
          duration_seconds: l.duration?.value || 0,
        })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in google-directions:", error);
    return new Response(JSON.stringify({ success: false, error: "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

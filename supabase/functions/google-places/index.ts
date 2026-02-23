import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { latitude, longitude, radius = 30000, keyword = 'guincho reboque auto socorro', tenant_id } = await req.json();

    if (!latitude || !longitude) {
      return new Response(
        JSON.stringify({ success: false, error: 'Latitude e longitude são obrigatórios.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get API key from tenant config, fallback to env
    let apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY') || '';

    if (tenant_id) {
      const adminSupabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: tenant } = await adminSupabase
        .from("tenants")
        .select("google_api_key")
        .eq("id", tenant_id)
        .single();

      if ((tenant as any)?.google_api_key) {
        apiKey = (tenant as any).google_api_key;
      }
    }

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Google API Key não configurada. Vá em Configurações → Integrações → Google Maps e adicione sua chave.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Searching places near ${latitude},${longitude} radius=${radius} keyword="${keyword}"`);

    const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
    url.searchParams.set('location', `${latitude},${longitude}`);
    url.searchParams.set('radius', String(radius));
    url.searchParams.set('keyword', keyword);
    url.searchParams.set('language', 'pt-BR');
    url.searchParams.set('key', apiKey);

    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('Google Places API error:', data.status, data.error_message);
      return new Response(
        JSON.stringify({ success: false, error: `Google API: ${data.status} - ${data.error_message || ''}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const toRad = (v: number) => (v * Math.PI) / 180;
    const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const results = (data.results || []).map((place: any) => ({
      place_id: place.place_id,
      name: place.name,
      address: place.vicinity || '',
      latitude: place.geometry?.location?.lat,
      longitude: place.geometry?.location?.lng,
      rating: place.rating || null,
      user_ratings_total: place.user_ratings_total || 0,
      open_now: place.opening_hours?.open_now ?? null,
      distance_km: haversine(latitude, longitude, place.geometry?.location?.lat, place.geometry?.location?.lng),
    }));

    results.sort((a: any, b: any) => a.distance_km - b.distance_km);

    console.log(`Found ${results.length} places`);

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in google-places:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

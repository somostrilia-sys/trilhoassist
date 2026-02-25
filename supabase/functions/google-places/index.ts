import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function getGoogleApiKey(tenantId?: string): Promise<string> {
  let apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY') || '';

  if (tenantId) {
    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: tenant } = await adminSupabase
      .from("tenants")
      .select("google_api_key")
      .eq("id", tenantId)
      .single();

    if ((tenant as any)?.google_api_key) {
      apiKey = (tenant as any).google_api_key;
    }
  }

  return apiKey;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // Route to the appropriate handler
    if (action === 'autocomplete') {
      return await handleAutocomplete(body);
    } else if (action === 'place_details') {
      return await handlePlaceDetails(body);
    } else {
      return await handleNearbySearch(body);
    }
  } catch (error) {
    console.error('Error in google-places:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function handleAutocomplete(body: any) {
  const { input, tenant_id, sessiontoken } = body;

  if (!input || input.trim().length < 3) {
    return new Response(
      JSON.stringify({ success: true, predictions: [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const apiKey = await getGoogleApiKey(tenant_id);
  if (!apiKey) {
    return new Response(
      JSON.stringify({ success: false, error: 'Google API Key não configurada.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
  url.searchParams.set('input', input);
  url.searchParams.set('language', 'pt-BR');
  url.searchParams.set('components', 'country:br');
  url.searchParams.set('key', apiKey);
  if (sessiontoken) url.searchParams.set('sessiontoken', sessiontoken);

  const response = await fetch(url.toString());
  const data = await response.json();

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    console.error('Autocomplete error:', data.status, data.error_message);
    return new Response(
      JSON.stringify({ success: false, error: `Google API: ${data.status}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const predictions = (data.predictions || []).map((p: any) => ({
    place_id: p.place_id,
    description: p.description,
    main_text: p.structured_formatting?.main_text || '',
    secondary_text: p.structured_formatting?.secondary_text || '',
  }));

  return new Response(
    JSON.stringify({ success: true, predictions }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handlePlaceDetails(body: any) {
  const { place_id, tenant_id, sessiontoken } = body;

  if (!place_id) {
    return new Response(
      JSON.stringify({ success: false, error: 'place_id é obrigatório' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const apiKey = await getGoogleApiKey(tenant_id);
  if (!apiKey) {
    return new Response(
      JSON.stringify({ success: false, error: 'Google API Key não configurada.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', place_id);
  url.searchParams.set('fields', 'formatted_address,geometry,name,address_components');
  url.searchParams.set('language', 'pt-BR');
  url.searchParams.set('key', apiKey);
  if (sessiontoken) url.searchParams.set('sessiontoken', sessiontoken);

  const response = await fetch(url.toString());
  const data = await response.json();

  if (data.status !== 'OK') {
    return new Response(
      JSON.stringify({ success: false, error: `Google API: ${data.status}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const result = data.result;
  return new Response(
    JSON.stringify({
      success: true,
      place: {
        formatted_address: result.formatted_address,
        name: result.name,
        lat: result.geometry?.location?.lat,
        lng: result.geometry?.location?.lng,
        address_components: result.address_components,
      },
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleNearbySearch(body: any) {
  const { latitude, longitude, radius = 30000, keyword = 'guincho reboque auto socorro', tenant_id } = body;

  if (!latitude || !longitude) {
    return new Response(
      JSON.stringify({ success: false, error: 'Latitude e longitude são obrigatórios.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const apiKey = await getGoogleApiKey(tenant_id);
  if (!apiKey) {
    return new Response(
      JSON.stringify({ success: false, error: 'Google API Key não configurada.' }),
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

  return new Response(
    JSON.stringify({ success: true, results }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

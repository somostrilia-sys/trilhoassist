import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return new Response(JSON.stringify({ error: "Token is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch the service request by share_token
    const { data: request, error: reqError } = await supabase
      .from("service_requests")
      .select("id, protocol, requester_name, requester_phone, vehicle_plate, vehicle_model, vehicle_year, vehicle_category, service_type, event_type, origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng, notes, status, created_at, completed_at, share_token, clients(name)")
      .eq("share_token", token)
      .eq("service_type", "collision")
      .maybeSingle();

    if (reqError || !request) {
      return new Response(JSON.stringify({ error: "Collision not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch associated media
    const { data: media } = await supabase
      .from("collision_media")
      .select("id, file_url, file_name, file_type, mime_type, file_size, created_at")
      .eq("service_request_id", request.id)
      .order("created_at", { ascending: true });

    return new Response(
      JSON.stringify({
        request: {
          ...request,
          client_name: (request as any).clients?.name || null,
        },
        media: media || [],
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

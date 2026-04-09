import { corsHeaders } from "@supabase/supabase-js/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      event_type,
      plate,
      associate_name,
      associate_phone,
      vehicle_category,
      location,
      description,
      external_reference,
      files,
    } = body;

    // Validate required fields
    if (!event_type || !plate || !associate_name || !associate_phone) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: event_type, plate, associate_name, associate_phone" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const crmToken = Deno.env.get("CRM_EVENTOS_TOKEN");
    if (!crmToken) {
      console.error("CRM_EVENTOS_TOKEN secret not configured");
      return new Response(
        JSON.stringify({ error: "CRM not configured", fallback: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const crmUrl = "https://zplcfkesjwbklqariocx.supabase.co/functions/v1/external-intake";

    console.log(`CRM Eventos: sending event for protocol=${external_reference}, plate=${plate}`);

    const crmResponse = await fetch(crmUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${crmToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_type,
        plate,
        associate_name,
        associate_phone,
        vehicle_category,
        location,
        description,
        external_reference,
        files: files || [],
      }),
    });

    const responseText = await crmResponse.text();

    if (!crmResponse.ok) {
      console.error(`CRM Eventos error: status=${crmResponse.status}, body=${responseText}`);
      return new Response(
        JSON.stringify({
          error: `CRM returned ${crmResponse.status}`,
          fallback: crmResponse.status >= 500,
          details: responseText,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`CRM Eventos success: protocol=${external_reference}, response=${responseText.substring(0, 200)}`);

    // Parse and forward the CRM response
    let crmData;
    try {
      crmData = JSON.parse(responseText);
    } catch {
      crmData = { raw: responseText };
    }

    return new Response(
      JSON.stringify({ success: true, crm: crmData }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("CRM Eventos unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal error", fallback: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

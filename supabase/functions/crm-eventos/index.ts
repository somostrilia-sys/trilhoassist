const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Map internal event types to CRM-accepted sinistro types
const eventTypeMap: Record<string, string> = {
  accident: "colisao",
  collision: "colisao",
  colisao: "colisao",
  furto_roubo: "furto_roubo",
  incendio: "incendio",
  alagamento: "alagamento",
  fenomeno_natural: "fenomeno_natural",
  vidros: "vidros",
  periferico: "vidros",
  pt: "pt",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      action,
      event_type,
      event_id,
      event_number,
      plate,
      associate_name,
      associate_phone,
      associate_cpf,
      driver_name,
      driver_phone,
      driver_cpf,
      vehicle_category,
      location,
      description,
      occurred_at,
      third_party_involved,
      third_party_plate,
      priority,
      external_reference,
      files,
      audio_url,
      audio_transcription,
      custom_data,
    } = body;

    // Validate required fields
    if (!event_type || (!plate && !associate_phone)) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: event_type and (plate or associate_phone)" }),
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

    // Map event_type to CRM-accepted value
    const mappedEventType = eventTypeMap[event_type] || event_type;

    const effectiveAction = action || "create-event";
    console.log(`CRM Eventos: action=${effectiveAction}, protocol=${external_reference}, plate=${plate}, type=${event_type} → ${mappedEventType}`);

    const payload: Record<string, unknown> = {
      action: effectiveAction,
      event_type: mappedEventType,
      plate,
      associate_name,
      associate_phone,
      vehicle_category,
      location,
      description,
      external_reference,
      files: files || [],
    };

    // For update-event, include event_id/event_number
    if (event_id) payload.event_id = event_id;
    if (event_number) payload.event_number = event_number;

    // Add optional fields only if provided
    if (associate_cpf) payload.associate_cpf = associate_cpf;
    if (driver_name) payload.driver_name = driver_name;
    if (driver_phone) payload.driver_phone = driver_phone;
    if (driver_cpf) payload.driver_cpf = driver_cpf;
    if (occurred_at) payload.occurred_at = occurred_at;
    if (third_party_involved !== undefined) payload.third_party_involved = third_party_involved;
    if (third_party_plate) payload.third_party_plate = third_party_plate;
    if (priority) payload.priority = priority;
    if (audio_url) payload.audio_url = audio_url;
    if (audio_transcription) payload.audio_transcription = audio_transcription;
    if (custom_data) payload.custom_data = custom_data;

    const crmResponse = await fetch(crmUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${crmToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
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

    console.log(`CRM Eventos success: action=${effectiveAction}, protocol=${external_reference}, response=${responseText.substring(0, 200)}`);

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

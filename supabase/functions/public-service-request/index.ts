import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // ═══ Plate lookup action (used by public form) ═══
    if (body.action === "lookup_plate") {
      const cleanPlate = (body.plate || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
      if (cleanPlate.length < 7) {
        return new Response(JSON.stringify({ beneficiary: null }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: ben } = await supabaseAdmin
        .from("beneficiaries")
        .select("id, name, phone, vehicle_model, vehicle_year")
        .eq("vehicle_plate", cleanPlate)
        .eq("active", true)
        .limit(1)
        .maybeSingle();
      return new Response(JSON.stringify({ beneficiary: ben || null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate required fields
    const { requester_name, requester_phone, origin_address, vehicle_plate, service_type, event_type } = body;

    if (!requester_name?.trim()) throw new Error("Nome do solicitante é obrigatório");
    if (!requester_phone?.trim()) throw new Error("Telefone do solicitante é obrigatório");
    if (!origin_address?.trim()) throw new Error("Endereço de origem é obrigatório");

    // Validate string lengths
    if (requester_name.length > 200) throw new Error("Nome muito longo");
    if (requester_phone.length > 30) throw new Error("Telefone inválido");
    if (origin_address.length > 500) throw new Error("Endereço muito longo");
    if (body.destination_address && body.destination_address.length > 500) throw new Error("Endereço de destino muito longo");
    if (body.notes && body.notes.length > 2000) throw new Error("Observações muito longas");

    // Validate enum values
    const validServiceTypes = [
      "tow_light", "tow_heavy", "tow_motorcycle", "locksmith",
      "tire_change", "battery", "fuel", "lodging", "collision", "other",
    ];
    const validEventTypes = [
      "mechanical_failure", "accident", "theft", "flat_tire",
      "locked_out", "battery_dead", "fuel_empty", "other",
    ];

    if (service_type && !validServiceTypes.includes(service_type)) {
      throw new Error("Tipo de serviço inválido");
    }
    if (event_type && !validEventTypes.includes(event_type)) {
      throw new Error("Tipo de evento inválido");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Look up beneficiary by plate to find client/plan
    let beneficiaryId: string | null = null;
    let clientId: string | null = null;
    let planId: string | null = null;
    let tenantId: string | null = null;

    const cleanPlate = (vehicle_plate || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
    if (cleanPlate.length >= 7) {
      const { data: ben } = await supabase
        .from("beneficiaries")
        .select("id, client_id, plan_id, clients(tenant_id)")
        .eq("vehicle_plate", cleanPlate)
        .eq("active", true)
        .limit(1)
        .maybeSingle();

      if (ben) {
        beneficiaryId = ben.id;
        clientId = ben.client_id;
        planId = ben.plan_id;
        tenantId = (ben as any).clients?.tenant_id || null;
      }
    }

    // If no tenant found via beneficiary, try to get a default tenant
    if (!tenantId) {
      const { data: defaultTenant } = await supabase
        .from("tenants")
        .select("id")
        .eq("active", true)
        .limit(1)
        .maybeSingle();
      tenantId = defaultTenant?.id || null;
    }

    const beneficiaryToken = crypto.randomUUID();

    const vehicleCategory = body.vehicle_category || "car";

    const { data: inserted, error } = await supabase.from("service_requests").insert({
      requester_name: requester_name.trim(),
      requester_phone: requester_phone.trim(),
      requester_phone_secondary: body.requester_phone_secondary?.trim() || null,
      vehicle_plate: cleanPlate || null,
      vehicle_model: body.vehicle_model?.trim() || null,
      vehicle_year: body.vehicle_year ? parseInt(body.vehicle_year) : null,
      vehicle_lowered: !!body.vehicle_lowered,
      difficult_access: !!body.difficult_access,
      service_type: service_type || "tow_light",
      event_type: event_type || "other",
      origin_address: origin_address.trim(),
      origin_lat: body.origin_lat || null,
      origin_lng: body.origin_lng || null,
      destination_address: body.destination_address?.trim() || null,
      destination_lat: body.destination_lat || null,
      destination_lng: body.destination_lng || null,
      notes: body.notes?.trim() || null,
      protocol: "temp",
      vehicle_category: vehicleCategory,
      verification_answers: body.verification_answers || {},
      beneficiary_token: beneficiaryToken,
      beneficiary_id: beneficiaryId,
      client_id: clientId,
      plan_id: planId,
      tenant_id: tenantId,
      provider_cost: 0,
      charged_amount: 0,
    }).select("id, protocol").single();

    if (error) {
      console.error("Insert error:", error);
      throw new Error("Erro ao criar solicitação");
    }

    // Log creation event
    await supabase.from("service_request_events").insert({
      service_request_id: inserted.id,
      event_type: "creation",
      description: "Solicitação criada pelo associado via página pública",
      user_id: null,
    });

    return new Response(
      JSON.stringify({
        success: true,
        id: inserted.id,
        protocol: inserted.protocol,
        beneficiary_token: beneficiaryToken,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Public service request error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

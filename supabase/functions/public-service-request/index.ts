import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ===== RATE LIMITER =====
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function isRateLimited(ip: string, max = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count++;
  return entry.count > max;
}

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Rate limiting
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(clientIp, 20)) {
    return new Response(
      JSON.stringify({ error: "Muitas requisições. Aguarde um momento." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();

    // ═══ Get default tenant for public pages ═══
    if (body.action === "get_default_tenant") {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: defaultTenant } = await supabaseAdmin
        .from("tenants")
        .select("id")
        .eq("active", true)
        .limit(1)
        .maybeSingle();

      return new Response(
        JSON.stringify({ tenant_id: defaultTenant?.id || null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ═══ Plate lookup action ═══
    if (body.action === "lookup_plate") {
      const cleanPlate = (body.plate || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
      if (cleanPlate.length < 7 || cleanPlate.length > 8) {
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
        .select("id, name, phone, vehicle_model, vehicle_year, clients(tenant_id)")
        .eq("vehicle_plate", cleanPlate)
        .eq("active", true)
        .limit(1)
        .maybeSingle();

      // Don't expose beneficiary phone to public
      const tenant_id = (ben as any)?.clients?.tenant_id || null;
      return new Response(JSON.stringify({ 
        beneficiary: ben ? { 
          id: ben.id, 
          name: ben.name, 
          vehicle_model: ben.vehicle_model, 
          vehicle_year: ben.vehicle_year, 
          tenant_id 
        } : null 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== VALIDATE REQUIRED FIELDS =====
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
    if (body.vehicle_model && body.vehicle_model.length > 100) throw new Error("Modelo do veículo muito longo");
    if (body.requester_phone_secondary && body.requester_phone_secondary.length > 30) throw new Error("Telefone secundário inválido");

    // Validate phone format
    const cleanPhone = requester_phone.replace(/\D/g, "");
    if (cleanPhone.length < 10 || cleanPhone.length > 15) throw new Error("Telefone inválido");

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

    // Validate coordinates if provided
    if (body.origin_lat != null && (typeof body.origin_lat !== "number" || Math.abs(body.origin_lat) > 90)) {
      throw new Error("Coordenada de origem inválida");
    }
    if (body.origin_lng != null && (typeof body.origin_lng !== "number" || Math.abs(body.origin_lng) > 180)) {
      throw new Error("Coordenada de origem inválida");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Look up beneficiary by plate
    let beneficiaryId: string | null = null;
    let clientId: string | null = null;
    let planId: string | null = null;
    let tenantId: string | null = null;

    const cleanPlate = (vehicle_plate || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
    if (cleanPlate.length >= 7 && cleanPlate.length <= 8) {
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
    const validCategories = ["car", "motorcycle", "truck", "van"];
    const safeCategory = validCategories.includes(vehicleCategory) ? vehicleCategory : "car";

    const { data: inserted, error } = await supabase.from("service_requests").insert({
      requester_name: requester_name.trim().slice(0, 200),
      requester_phone: cleanPhone,
      requester_phone_secondary: body.requester_phone_secondary?.replace(/\D/g, "").slice(0, 15) || null,
      vehicle_plate: cleanPlate || null,
      vehicle_model: body.vehicle_model?.trim()?.slice(0, 100) || null,
      vehicle_year: body.vehicle_year ? parseInt(body.vehicle_year) : null,
      vehicle_lowered: !!body.vehicle_lowered,
      difficult_access: !!body.difficult_access,
      service_type: service_type || "tow_light",
      event_type: event_type || "other",
      origin_address: origin_address.trim().slice(0, 500),
      origin_lat: body.origin_lat || null,
      origin_lng: body.origin_lng || null,
      destination_address: body.destination_address?.trim()?.slice(0, 500) || null,
      destination_lat: body.destination_lat || null,
      destination_lng: body.destination_lng || null,
      notes: body.notes?.trim()?.slice(0, 2000) || null,
      protocol: "temp",
      vehicle_category: safeCategory,
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
         tenant_id: tenantId,
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
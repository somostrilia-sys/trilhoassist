import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const serviceTypeMap: Record<string, string> = {
  tow_light: "REBOQUE LEVE",
  tow_heavy: "REBOQUE PESADO",
  tow_motorcycle: "REBOQUE MOTO",
  locksmith: "CHAVEIRO",
  tire_change: "TROCA DE PNEU",
  battery: "BATERIA",
  fuel: "COMBUSTÍVEL",
  lodging: "HOSPEDAGEM",
  collision: "COLISÃO",
  other: "OUTRO",
};

const eventTypeMap: Record<string, string> = {
  mechanical_failure: "PANE MECÂNICA",
  accident: "ACIDENTE",
  theft: "ROUBO/FURTO",
  flat_tire: "PNEU FURADO",
  locked_out: "CHAVE TRANCADA",
  battery_dead: "BATERIA DESCARREGADA",
  fuel_empty: "SEM COMBUSTÍVEL",
  other: "OUTRO",
};

async function fetchOSRMRoute(
  originLat: number, originLng: number,
  destLat: number, destLng: number
): Promise<{ km: number; min: number } | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=false`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.routes?.[0]) {
      return {
        km: Math.round(data.routes[0].distance / 1000 * 10) / 10,
        min: Math.round(data.routes[0].duration / 60),
      };
    }
  } catch (err) {
    console.error("OSRM error:", err);
  }
  return null;
}

interface RouteBreakdown {
  legs: { label: string; km: number; min: number }[];
  totalKm: number;
  totalMin: number;
  description: string;
}

async function calculateFullRoute(
  originLat: number, originLng: number,
  destLat: number | null, destLng: number | null,
  providerLat: number | null, providerLng: number | null
): Promise<RouteBreakdown | null> {
  try {
    if (providerLat && providerLng && destLat && destLng) {
      // Full: Base Prestador → Origem → Destino → Retorno Base
      const [leg1, leg2, leg3] = await Promise.all([
        fetchOSRMRoute(providerLat, providerLng, originLat, originLng),
        fetchOSRMRoute(originLat, originLng, destLat, destLng),
        fetchOSRMRoute(destLat, destLng, providerLat, providerLng),
      ]);
      if (!leg1 || !leg2 || !leg3) return null;
      return {
        legs: [
          { label: "Base → Origem", km: leg1.km, min: leg1.min },
          { label: "Origem → Destino", km: leg2.km, min: leg2.min },
          { label: "Destino → Retorno", km: leg3.km, min: leg3.min },
        ],
        totalKm: leg1.km + leg2.km + leg3.km,
        totalMin: leg1.min + leg2.min + leg3.min,
        description: "Base Prestador → Origem → Destino → Retorno",
      };
    } else if (providerLat && providerLng && (!destLat || !destLng)) {
      // Provider but no destination: Base Prestador → Origem → Retorno
      const [leg1, leg2] = await Promise.all([
        fetchOSRMRoute(providerLat, providerLng, originLat, originLng),
        fetchOSRMRoute(originLat, originLng, providerLat, providerLng),
      ]);
      if (!leg1 || !leg2) return null;
      return {
        legs: [
          { label: "Base → Origem", km: leg1.km, min: leg1.min },
          { label: "Origem → Retorno", km: leg2.km, min: leg2.min },
        ],
        totalKm: leg1.km + leg2.km,
        totalMin: leg1.min + leg2.min,
        description: "Base Prestador → Origem → Retorno",
      };
    } else if (destLat && destLng) {
      // Without provider: Origem → Destino (ida e volta + 10km margem)
      const [leg1, leg2] = await Promise.all([
        fetchOSRMRoute(originLat, originLng, destLat, destLng),
        fetchOSRMRoute(destLat, destLng, originLat, originLng),
      ]);
      if (!leg1 || !leg2) return null;
      return {
        legs: [
          { label: "Origem → Destino", km: leg1.km, min: leg1.min },
          { label: "Destino → Retorno", km: leg2.km, min: leg2.min },
        ],
        totalKm: leg1.km + leg2.km + 10,
        totalMin: leg1.min + leg2.min,
        description: "Origem → Destino → Retorno + 10km margem",
      };
    }
    // No destination and no provider — no route to calculate
    console.log("No route: missing destination and provider coordinates");
  } catch (err) {
    console.error("Route calculation error:", err);
  }
  return null;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatCurrency(value: number | null): string {
  if (!value) return "R$ 0,00";
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function extractNeighborhood(address: string): string {
  const parts = address.split(",").map(p => p.trim());
  if (parts.length >= 2) return parts[1];
  return address;
}

function extractCity(address: string): string {
  const parts = address.split(",").map(p => p.trim());
  if (parts.length >= 3) return parts.slice(2).join(", ");
  if (parts.length >= 2) return parts[1];
  return address;
}

// ========== LABEL BUILDERS (unchanged logic) ==========

function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${m > 0 ? `${m}min` : ""}`;
}

function buildRouteSection(route: RouteBreakdown | null, kmMargin: number, estimatedKm?: number | null): string {
  if (!route) {
    if (estimatedKm) {
      return `\n*ROTEIRIZAÇÃO ESTIMADA*: ${(estimatedKm + kmMargin).toFixed(1)} km`;
    }
    return "";
  }
  const totalWithMargin = route.totalKm + kmMargin;
  return `\n*ROTEIRIZAÇÃO ESTIMADA*: ${totalWithMargin.toFixed(1)} km`;
}

function buildCreationLabel(sr: any, client: any, beneficiary: any, tenant: any, operator: any, route: RouteBreakdown | null, kmMargin: number): string {
  const benName = beneficiary?.name || sr.requester_name;
  const baseUrl = "https://trilhoassist.com.br";
  const trackingLink = sr.beneficiary_token ? `${baseUrl}/tracking/${sr.beneficiary_token}` : "";

  return `*ATENDIMENTO*

*BENEFICIÁRIO*: ${benName.toUpperCase()}
*SOLICITANTE*: ${sr.requester_name.toUpperCase()}
*CONTATO SOLICITANTE*: ${sr.requester_phone}${sr.requester_phone_secondary ? `\n*CONTATO 2*: ${sr.requester_phone_secondary}` : ""}
*VEÍCULO*: ${(sr.vehicle_model || "").toUpperCase()} (${(sr.vehicle_plate || "").toUpperCase()})
*CLIENTE*: ${(client?.name || "").toUpperCase()}
*SERVIÇO*: ${serviceTypeMap[sr.service_type] || sr.service_type}
*DATA*: ${formatDate(sr.created_at)}
*PROTOCOLO*: ${sr.protocol}

*DADOS ORIGEM*
*LOGRADOURO*: ${(sr.origin_address || "").toUpperCase()}
*BAIRRO*: ${extractNeighborhood(sr.origin_address || "").toUpperCase()}
*CIDADE*: ${extractCity(sr.origin_address || "").toUpperCase()}

*DADOS DESTINO*
*LOGRADOURO*: ${(sr.destination_address || "").toUpperCase()}
*BAIRRO*: ${extractNeighborhood(sr.destination_address || "").toUpperCase()}
*CIDADE*: ${extractCity(sr.destination_address || "").toUpperCase()}

*DADOS DE ACIONAMENTO*
*TIPO DE EVENTO*: ${eventTypeMap[sr.event_type] || sr.event_type}
*ATENDIMENTO REALIZADO POR*: ${(operator?.full_name || "SISTEMA").toUpperCase()}
*ASSISTÊNCIA*: ${(tenant?.name || "").toUpperCase()}
${buildRouteSection(route, kmMargin, sr.estimated_km)}
${trackingLink ? `\nOlá, segue o link com as informações do serviço: ${trackingLink}` : ""}`;
}

function buildDispatchPreviewLabel(sr: any, provider: any, quotedAmount: number | null, client: any, route: RouteBreakdown | null, kmMargin: number): string {
  return `*PRÉVIA DE ACIONAMENTO* 🚗

*PROTOCOLO*: ${sr.protocol}
*CLIENTE*: ${(client?.name || "").toUpperCase()}
*VEÍCULO*: ${(sr.vehicle_model || "").toUpperCase()} (${(sr.vehicle_plate || "").toUpperCase()})
*SERVIÇO*: ${serviceTypeMap[sr.service_type] || sr.service_type}

*PRESTADOR ACIONADO*: ${(provider?.name || "").toUpperCase()}
*TELEFONE PRESTADOR*: ${provider?.phone || "—"}
*CIDADE PRESTADOR*: ${[provider?.city, provider?.state].filter(Boolean).join(" - ").toUpperCase() || "—"}

*VALOR COBRADO*: ${formatCurrency(quotedAmount)}
${buildRouteSection(route, kmMargin, sr.estimated_km)}`;
}

function buildCompletionLabel(sr: any, client: any, provider: any, finalAmount: number | null): string {
  return `✅ *ATENDIMENTO FINALIZADO*

*PROTOCOLO*: ${sr.protocol}
*CLIENTE*: ${(client?.name || "").toUpperCase()}
*VEÍCULO*: ${(sr.vehicle_model || "").toUpperCase()} (${(sr.vehicle_plate || "").toUpperCase()})
*SERVIÇO*: ${serviceTypeMap[sr.service_type] || sr.service_type}
*PRESTADOR*: ${(provider?.name || "").toUpperCase()}
*VALOR FINAL*: ${formatCurrency(finalAmount || sr.charged_amount)}
*FINALIZADO EM*: ${formatDate(sr.completed_at || new Date().toISOString())}`;
}

function buildCancellationLabel(sr: any, client: any, reason: string): string {
  return `❌ *ATENDIMENTO CANCELADO*

*PROTOCOLO*: ${sr.protocol}
*CLIENTE*: ${(client?.name || "").toUpperCase()}
*VEÍCULO*: ${(sr.vehicle_model || "").toUpperCase()} (${(sr.vehicle_plate || "").toUpperCase()})
*SERVIÇO*: ${serviceTypeMap[sr.service_type] || sr.service_type}
*MOTIVO*: ${reason || "Não informado"}
*CANCELADO EM*: ${formatDate(new Date().toISOString())}`;
}

// ========== SEND VIA UAZAPI GO ==========
async function sendViaUazapi(
  adminSupabase: any,
  tenantId: string,
  groupId: string,
  message: string
): Promise<{ ok: boolean; result: any }> {
  // Get UazapiGO config from tenant
  let serverUrl = "";
  let instanceToken = "";
  let instanceName = "";

  if (tenantId) {
    const { data: tenant } = await adminSupabase
      .from("tenants")
      .select("uazapi_server_url, uazapi_admin_token")
      .eq("id", tenantId)
      .single();

    if (tenant) {
      serverUrl = (tenant as any).uazapi_server_url || "";
    }

    // Find any active UazapiGO instance for this tenant to send group messages
    const { data: inst } = await adminSupabase
      .from("zapi_instances")
      .select("instance_token, evolution_instance_name")
      .eq("tenant_id", tenantId)
      .eq("api_type", "uazapi")
      .eq("active", true)
      .eq("connection_status", "connected")
      .limit(1)
      .single();

    if (inst) {
      instanceToken = (inst as any).instance_token || "";
      instanceName = (inst as any).evolution_instance_name || "";
    }
  }

  if (!serverUrl || !instanceToken || !instanceName) {
    return { ok: false, result: { error: "UazapiGO not configured or no connected instance" } };
  }

  const baseUrl = serverUrl.replace(/\/$/, "");

  const response = await fetch(`${baseUrl}/instance/${instanceName}/send-text`, {
    method: "POST",
    headers: {
      token: instanceToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      number: groupId,
      text: message,
    }),
  });

  const result = await response.json();
  return { ok: response.ok, result };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      console.error("Auth error:", userErr?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;

    const { service_request_id, trigger, cancel_reason, provider_id, quoted_amount } = await req.json();

    if (!service_request_id || !trigger) {
      return new Response(JSON.stringify({ error: "service_request_id and trigger are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: sr, error: srErr } = await adminSupabase
      .from("service_requests")
      .select("*, clients(name, whatsapp_group_id, km_margin)")
      .eq("id", service_request_id)
      .single();

    if (srErr || !sr) {
      return new Response(JSON.stringify({ error: "Service request not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const client = (sr as any).clients;
    const groupId = client?.whatsapp_group_id;

    if (!groupId) {
      return new Response(JSON.stringify({ success: false, reason: "no_group_id", message: "Client has no WhatsApp group configured" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch related data
    const { data: tenant } = await adminSupabase
      .from("tenants")
      .select("name")
      .eq("id", sr.tenant_id)
      .single();

    const { data: operator } = await adminSupabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", userId)
      .single();

    let beneficiary = null;
    if (sr.beneficiary_id) {
      const { data: ben } = await adminSupabase
        .from("beneficiaries")
        .select("name")
        .eq("id", sr.beneficiary_id)
        .single();
      beneficiary = ben;
    }

    let providerData = null;
    let dispatchData = null;
    if (trigger === "dispatch_preview" || trigger === "completion") {
      const { data: dispatch } = await adminSupabase
        .from("dispatches")
        .select("*, providers(name, phone, city, state, latitude, longitude)")
        .eq("service_request_id", service_request_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (dispatch) {
        dispatchData = dispatch;
        providerData = (dispatch as any).providers;
      }
    }

    // Build the message
    let message = "";
    const kmMargin = client?.km_margin || 10;

    // Calculate route if we have origin coordinates
    let route: RouteBreakdown | null = null;
    if (sr.origin_lat && sr.origin_lng) {
      const provLat = providerData?.latitude || null;
      const provLng = providerData?.longitude || null;
      console.log(`Route calc: origin=(${sr.origin_lat},${sr.origin_lng}), dest=(${sr.destination_lat},${sr.destination_lng}), provider=(${provLat},${provLng})`);
      route = await calculateFullRoute(
        sr.origin_lat, sr.origin_lng,
        sr.destination_lat, sr.destination_lng,
        provLat, provLng
      );
      console.log(`Route result: ${route ? `${route.totalKm.toFixed(1)}km` : "null"}`);
    } else {
      console.log(`No origin coordinates: origin_lat=${sr.origin_lat}, origin_lng=${sr.origin_lng}`);
    }

    switch (trigger) {
      case "creation": {
        message = buildCreationLabel(sr, client, beneficiary, tenant, operator, route, kmMargin);
        break;
      }
      case "dispatch_preview":
        message = buildDispatchPreviewLabel(sr, providerData, quoted_amount || dispatchData?.quoted_amount, client, route, kmMargin);
        break;
      case "completion":
        message = buildCompletionLabel(sr, client, providerData, dispatchData?.final_amount);
        break;
      case "cancellation":
        message = buildCancellationLabel(sr, client, cancel_reason || "");
        break;
      default:
        return new Response(JSON.stringify({ error: `Unknown trigger: ${trigger}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // Send via UazapiGO
    const { ok, result } = await sendViaUazapi(adminSupabase, sr.tenant_id, groupId, message);

    if (!ok) {
      console.error("UazapiGO error:", result);
      return new Response(
        JSON.stringify({ error: "Failed to send label", details: result }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Label sent: trigger=${trigger}, protocol=${sr.protocol}, group=${groupId}`);

    return new Response(JSON.stringify({ success: true, trigger, protocol: sr.protocol }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Service label error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

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

async function calculateRouteKm(
  originLat: number, originLng: number,
  destLat: number, destLng: number
): Promise<number | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=false`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.routes?.[0]?.distance) {
      return Math.round(data.routes[0].distance / 1000);
    }
  } catch (err) {
    console.error("OSRM error:", err);
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

function buildCreationLabel(sr: any, client: any, beneficiary: any, tenant: any, operator: any, estimatedKm: number | null, kmMargin: number): string {
  const totalKm = estimatedKm ? estimatedKm + kmMargin : null;
  const benName = beneficiary?.name || sr.requester_name;
  const baseUrl = "https://veniti-watch.lovable.app";
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
${totalKm ? `\n*APROX: ${totalKm}KM*` : ""}
${trackingLink ? `\nOlá, segue o link com as informações do serviço: ${trackingLink}` : ""}`;
}

function buildDispatchPreviewLabel(sr: any, provider: any, quotedAmount: number | null, client: any): string {
  return `*PRÉVIA DE ACIONAMENTO* 🚗

*PROTOCOLO*: ${sr.protocol}
*CLIENTE*: ${(client?.name || "").toUpperCase()}
*VEÍCULO*: ${(sr.vehicle_model || "").toUpperCase()} (${(sr.vehicle_plate || "").toUpperCase()})
*SERVIÇO*: ${serviceTypeMap[sr.service_type] || sr.service_type}

*PRESTADOR ACIONADO*: ${(provider?.name || "").toUpperCase()}
*TELEFONE PRESTADOR*: ${provider?.phone || "—"}
*CIDADE PRESTADOR*: ${[provider?.city, provider?.state].filter(Boolean).join(" - ").toUpperCase() || "—"}

*VALOR COBRADO*: ${formatCurrency(quotedAmount)}`;
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

// ========== SEND VIA EVOLUTION API ==========
async function sendViaEvolution(groupId: string, message: string): Promise<{ ok: boolean; result: any }> {
  const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
  const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");
  const EVOLUTION_INSTANCE = Deno.env.get("EVOLUTION_INSTANCE") || "default";

  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    return { ok: false, result: { error: "Evolution API not configured" } };
  }

  const baseUrl = EVOLUTION_API_URL.replace(/\/$/, "");

  const response = await fetch(`${baseUrl}/message/sendText/${EVOLUTION_INSTANCE}`, {
    method: "POST",
    headers: {
      apikey: EVOLUTION_API_KEY,
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

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;

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
        .select("*, providers(name, phone, city, state)")
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

    switch (trigger) {
      case "creation": {
        let estimatedKm: number | null = null;
        if (sr.origin_lat && sr.origin_lng && sr.destination_lat && sr.destination_lng) {
          estimatedKm = await calculateRouteKm(sr.origin_lat, sr.origin_lng, sr.destination_lat, sr.destination_lng);
        }
        message = buildCreationLabel(sr, client, beneficiary, tenant, operator, estimatedKm, kmMargin);
        break;
      }
      case "dispatch_preview":
        message = buildDispatchPreviewLabel(sr, providerData, quoted_amount || dispatchData?.quoted_amount, client);
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

    // Send via Evolution API
    const { ok, result } = await sendViaEvolution(groupId, message);

    if (!ok) {
      console.error("Evolution API error:", result);
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
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const serviceTypeMap: Record<string, string> = {
  tow_light: "Reboque Leve",
  tow_heavy: "Reboque Pesado",
  tow_motorcycle: "Reboque Moto",
  locksmith: "Chaveiro",
  tire_change: "Troca de Pneu",
  battery: "Bateria",
  fuel: "Combustível",
  lodging: "Hospedagem",
  collision: "Colisão",
  other: "Outro",
};

async function sendEvolutionMessage(phone: string, message: string): Promise<{ ok: boolean; result: any }> {
  const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
  const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");
  const EVOLUTION_INSTANCE = Deno.env.get("EVOLUTION_INSTANCE") || "default";

  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    return { ok: false, result: { error: "Evolution API not configured" } };
  }

  const baseUrl = EVOLUTION_API_URL.replace(/\/$/, "");

  // Clean phone
  let cleanPhone = phone.replace(/\D/g, "");
  if (cleanPhone.length <= 11) {
    cleanPhone = `55${cleanPhone}`;
  }

  const response = await fetch(`${baseUrl}/message/sendText/${EVOLUTION_INSTANCE}`, {
    method: "POST",
    headers: {
      apikey: EVOLUTION_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      number: cleanPhone,
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

    const {
      service_request_id,
      trigger,
      // Dispatch-specific
      provider_name,
      provider_phone,
      estimated_arrival_min,
      provider_tracking_url,
      beneficiary_tracking_url,
      // NPS
      nps_link,
    } = await req.json();

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

    // Fetch service request
    const { data: sr, error: srErr } = await adminSupabase
      .from("service_requests")
      .select("*, clients(name), beneficiaries(name, phone)")
      .eq("id", service_request_id)
      .single();

    if (srErr || !sr) {
      return new Response(JSON.stringify({ error: "Service request not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch tenant for branding
    const { data: tenant } = await adminSupabase
      .from("tenants")
      .select("name")
      .eq("id", sr.tenant_id)
      .single();

    const tenantName = tenant?.name || "Assistência";
    const beneficiaryPhone = (sr as any).beneficiaries?.phone || sr.requester_phone;
    const beneficiaryName = (sr as any).beneficiaries?.name || sr.requester_name;
    const serviceName = serviceTypeMap[sr.service_type] || sr.service_type;
    const results: any[] = [];

    switch (trigger) {
      // ================================================================
      // BENEFICIARY: Service created → "Dados encaminhados"
      // ================================================================
      case "beneficiary_creation": {
        if (!beneficiaryPhone) break;
        const msg = `Olá, ${beneficiaryName}! 👋

Seu atendimento foi registrado com sucesso pelo *${tenantName}*.

*Protocolo*: ${sr.protocol}
*Serviço*: ${serviceName}

Excelente! 👌 Encaminhei seus dados para o setor de acionamento. Agora estamos localizando o prestador mais próximo. Assim que tiver a previsão de chegada, retorno aqui com as informações.

Aguarde, por favor! 🙏`;

        const r = await sendEvolutionMessage(beneficiaryPhone, msg);
        results.push({ target: "beneficiary", trigger, ok: r.ok });
        break;
      }

      // ================================================================
      // BENEFICIARY: Provider dispatched → "Prestador a caminho"
      // ================================================================
      case "beneficiary_dispatch": {
        if (!beneficiaryPhone) break;
        const etaText = estimated_arrival_min
          ? `aproximadamente *${estimated_arrival_min} minutos* do local`
          : "a caminho do local";

        const trackingText = beneficiary_tracking_url
          ? `\n\n📍 Segue o link pra você acompanhar o andamento e a chegada do prestador:\n${beneficiary_tracking_url}\n\nPor favor, *não se esqueça de marcar no seu link quando ele chegar*, isso ajuda a gente a acompanhar aqui. ✅`
          : "";

        const msg = `Boa notícia! 😀

O prestador já foi localizado e está a ${etaText}.

*Prestador*: ${provider_name || "—"}
*Protocolo*: ${sr.protocol}${trackingText}`;

        const r = await sendEvolutionMessage(beneficiaryPhone, msg);
        results.push({ target: "beneficiary", trigger, ok: r.ok });
        break;
      }

      // ================================================================
      // BENEFICIARY: Completion → NPS
      // ================================================================
      case "beneficiary_completion": {
        if (!beneficiaryPhone) break;
        const npsText = nps_link
          ? `\n\nPor favor, nos ajude a melhorar! Avalie nosso atendimento:\n${nps_link}`
          : "\n\nEm breve você receberá uma pesquisa de satisfação. Sua opinião é muito importante para nós! ⭐";

        const msg = `Olá, ${beneficiaryName}! ✅

Seu atendimento *${sr.protocol}* foi *finalizado com sucesso*!

Agradecemos por confiar no *${tenantName}*. Esperamos que tenha tido uma boa experiência.${npsText}

Obrigado! 🙏`;

        const r = await sendEvolutionMessage(beneficiaryPhone, msg);
        results.push({ target: "beneficiary", trigger, ok: r.ok });
        break;
      }

      // ================================================================
      // PROVIDER: Dispatched → Link + info
      // ================================================================
      case "provider_dispatch": {
        if (!provider_phone) break;
        const trackingText = provider_tracking_url
          ? `\n\n📍 *Navegação e rastreamento*:\n${provider_tracking_url}\n\nPor favor, acesse o link acima para iniciar a navegação e compartilhar sua localização em tempo real.`
          : "";

        const msg = `🚗 *Novo Acionamento!*

*${tenantName}*

*Protocolo*: ${sr.protocol}
*Serviço*: ${serviceName}
*Veículo*: ${(sr.vehicle_model || "").toUpperCase()} ${(sr.vehicle_plate || "").toUpperCase()}
*Solicitante*: ${sr.requester_name}
*Contato*: ${sr.requester_phone}

*Origem*: ${sr.origin_address || "—"}
*Destino*: ${sr.destination_address || "—"}${trackingText}`;

        const r = await sendEvolutionMessage(provider_phone, msg);
        results.push({ target: "provider", trigger, ok: r.ok });
        break;
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown trigger: ${trigger}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    console.log(`Auto-notify sent: trigger=${trigger}, protocol=${sr.protocol}, results=`, results);

    return new Response(JSON.stringify({ success: true, trigger, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Auto-notify error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

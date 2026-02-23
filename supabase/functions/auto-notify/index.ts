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

// Default message templates
const DEFAULT_MESSAGES: Record<string, string> = {
  beneficiary_creation: `Olá, {{beneficiary_name}}! 👋

Seu atendimento foi registrado com sucesso pelo *{{tenant_name}}*.

*Protocolo*: {{protocol}}
*Serviço*: {{service_name}}

Excelente! 👌 Encaminhei seus dados para o setor de acionamento. Agora estamos localizando o prestador mais próximo. Assim que tiver a previsão de chegada, retorno aqui com as informações.

Aguarde, por favor! 🙏`,

  beneficiary_dispatch: `Boa notícia! 😀

O prestador já foi localizado e está a {{eta_text}}.

*Prestador*: {{provider_name}}
*Protocolo*: {{protocol}}{{tracking_text}}`,

  beneficiary_completion: `Olá, {{beneficiary_name}}! ✅

Seu atendimento *{{protocol}}* foi *finalizado com sucesso*!

Agradecemos por confiar no *{{tenant_name}}*. Esperamos que tenha tido uma boa experiência.{{nps_text}}

Obrigado! 🙏`,

  provider_dispatch: `🚗 *Novo Acionamento!*

*{{tenant_name}}*

*Protocolo*: {{protocol}}
*Serviço*: {{service_name}}
*Veículo*: {{vehicle_model}} {{vehicle_plate}}
*Solicitante*: {{requester_name}}
*Contato*: {{requester_phone}}

*Origem*: {{origin_address}}
*Destino*: {{destination_address}}{{tracking_text}}`,
};

function interpolateMessage(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "—");
}

async function sendEvolutionMessage(phone: string, message: string): Promise<{ ok: boolean; result: any }> {
  const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
  const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");
  const EVOLUTION_INSTANCE = Deno.env.get("EVOLUTION_INSTANCE") || "default";

  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    return { ok: false, result: { error: "Evolution API not configured" } };
  }

  const baseUrl = EVOLUTION_API_URL.replace(/\/$/, "");
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
    body: JSON.stringify({ number: cleanPhone, text: message }),
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
      provider_name,
      provider_phone,
      estimated_arrival_min,
      provider_tracking_url,
      beneficiary_tracking_url,
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

    // Fetch tenant for branding + notification settings
    const { data: tenant } = await adminSupabase
      .from("tenants")
      .select("name, notification_settings")
      .eq("id", sr.tenant_id)
      .single();

    const tenantName = tenant?.name || "Assistência";
    const notifSettings = (tenant?.notification_settings as any) || {};
    const autoNotifyConfig = notifSettings.auto_notify || {};

    // Check if this trigger is enabled
    const phaseConfig = autoNotifyConfig[trigger];
    if (phaseConfig?.enabled === false) {
      console.log(`Auto-notify skipped: trigger=${trigger} is disabled for tenant`);
      return new Response(JSON.stringify({ success: true, trigger, skipped: true, reason: "disabled" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const beneficiaryPhone = (sr as any).beneficiaries?.phone || sr.requester_phone;
    const beneficiaryName = (sr as any).beneficiaries?.name || sr.requester_name;
    const serviceName = serviceTypeMap[sr.service_type] || sr.service_type;

    // Build variable map for interpolation
    const vars: Record<string, string> = {
      beneficiary_name: beneficiaryName || "—",
      tenant_name: tenantName,
      protocol: sr.protocol,
      service_name: serviceName,
      provider_name: provider_name || "—",
      estimated_arrival_min: estimated_arrival_min ? String(estimated_arrival_min) : "—",
      beneficiary_tracking_url: beneficiary_tracking_url || "",
      provider_tracking_url: provider_tracking_url || "",
      vehicle_model: (sr.vehicle_model || "").toUpperCase(),
      vehicle_plate: (sr.vehicle_plate || "").toUpperCase(),
      requester_name: sr.requester_name || "—",
      requester_phone: sr.requester_phone || "—",
      origin_address: sr.origin_address || "—",
      destination_address: sr.destination_address || "—",
      nps_link: nps_link || "",
    };

    // Build composite vars used only in default templates
    const etaText = estimated_arrival_min
      ? `aproximadamente *${estimated_arrival_min} minutos* do local`
      : "a caminho do local";
    vars.eta_text = etaText;

    // Tracking text for beneficiary_dispatch
    vars.tracking_text = "";
    if (trigger === "beneficiary_dispatch" && beneficiary_tracking_url) {
      vars.tracking_text = `\n\n📍 Segue o link pra você acompanhar o andamento e a chegada do prestador:\n${beneficiary_tracking_url}\n\nPor favor, *não se esqueça de marcar no seu link quando ele chegar*, isso ajuda a gente a acompanhar aqui. ✅`;
    } else if (trigger === "provider_dispatch" && provider_tracking_url) {
      vars.tracking_text = `\n\n📍 *Navegação e rastreamento*:\n${provider_tracking_url}\n\nPor favor, acesse o link acima para iniciar a navegação e compartilhar sua localização em tempo real.`;
    }

    // NPS text for beneficiary_completion
    if (trigger === "beneficiary_completion") {
      vars.nps_text = nps_link
        ? `\n\nPor favor, nos ajude a melhorar! Avalie nosso atendimento:\n${nps_link}`
        : "\n\nEm breve você receberá uma pesquisa de satisfação. Sua opinião é muito importante para nós! ⭐";
    }

    // Get message template: custom if set, otherwise default
    const customMessage = phaseConfig?.custom_message;
    const messageTemplate = customMessage && customMessage.trim()
      ? customMessage
      : DEFAULT_MESSAGES[trigger];

    if (!messageTemplate) {
      return new Response(JSON.stringify({ error: `Unknown trigger: ${trigger}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const finalMessage = interpolateMessage(messageTemplate, vars);
    const results: any[] = [];

    // Determine recipient
    if (trigger.startsWith("beneficiary_")) {
      if (beneficiaryPhone) {
        const r = await sendEvolutionMessage(beneficiaryPhone, finalMessage);
        results.push({ target: "beneficiary", trigger, ok: r.ok });
      }
    } else if (trigger === "provider_dispatch") {
      if (provider_phone) {
        const r = await sendEvolutionMessage(provider_phone, finalMessage);
        results.push({ target: "provider", trigger, ok: r.ok });
      }
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

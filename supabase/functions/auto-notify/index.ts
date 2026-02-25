import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const serviceTypeMap: Record<string, string> = {
  tow_light: "Reboque Leve", tow_heavy: "Reboque Pesado", tow_motorcycle: "Reboque Moto",
  locksmith: "Chaveiro", tire_change: "Troca de Pneu", battery: "Bateria",
  fuel: "Combustível", lodging: "Hospedagem", collision: "Colisão", other: "Outro",
};

const DEFAULT_MESSAGES: Record<string, string> = {
  beneficiary_creation: `Olá, {{beneficiary_name}}! 👋

Seu atendimento foi registrado com sucesso pelo *{{tenant_name}}*.

*Protocolo*: {{protocol}}
*Serviço*: {{service_name}}

Excelente! 👌 Encaminhei seus dados para o setor de acionamento. Agora estamos localizando o prestador mais próximo. Assim que tiver a previsão de chegada, retorno aqui com as informações.{{tracking_text}}

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

// Send via UazapiGO using a connected instance from the tenant
async function sendUazapiMessage(
  adminSupabase: any,
  tenantId: string,
  phone: string,
  message: string
): Promise<{ ok: boolean; result: any }> {
  // Get server URL from tenant
  const { data: tenant } = await adminSupabase
    .from("tenants")
    .select("uazapi_server_url")
    .eq("id", tenantId)
    .single();

  const serverUrl = ((tenant as any)?.uazapi_server_url || "").replace(/\/$/, "");
  if (!serverUrl) {
    return { ok: false, result: { error: "UazapiGO server URL not configured" } };
  }

  // Find any connected instance for this tenant
  const { data: inst } = await adminSupabase
    .from("zapi_instances")
    .select("instance_token, evolution_instance_name")
    .eq("tenant_id", tenantId)
    .eq("api_type", "uazapi")
    .eq("active", true)
    .eq("connection_status", "connected")
    .limit(1)
    .single();

  if (!inst) {
    return { ok: false, result: { error: "No connected UazapiGO instance found" } };
  }

  const instanceToken = (inst as any).instance_token || "";
  const instanceName = (inst as any).evolution_instance_name || "";

  if (!instanceToken || !instanceName) {
    return { ok: false, result: { error: "Instance token/name missing" } };
  }

  let cleanPhone = phone.replace(/\D/g, "");
  if (cleanPhone.length <= 11) {
    cleanPhone = `55${cleanPhone}`;
  }

  const response = await fetch(`${serverUrl}/instance/${instanceName}/send-text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      token: instanceToken,
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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const tokenStr = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await supabase.auth.getUser(tokenStr);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      service_request_id, trigger, provider_name, provider_phone,
      estimated_arrival_min, provider_tracking_url, beneficiary_tracking_url, nps_link,
    } = await req.json();

    if (!service_request_id || !trigger) {
      return new Response(JSON.stringify({ error: "service_request_id and trigger are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: sr, error: srErr } = await adminSupabase
      .from("service_requests")
      .select("*, clients(name), beneficiaries(name, phone)")
      .eq("id", service_request_id)
      .single();

    if (srErr || !sr) {
      return new Response(JSON.stringify({ error: "Service request not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch tenant for branding and notification settings
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
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const beneficiaryPhone = (sr as any).beneficiaries?.phone || sr.requester_phone;
    const beneficiaryName = (sr as any).beneficiaries?.name || sr.requester_name;
    const serviceName = serviceTypeMap[sr.service_type] || sr.service_type;

    const vars: Record<string, string> = {
      beneficiary_name: beneficiaryName || "—", tenant_name: tenantName,
      protocol: sr.protocol, service_name: serviceName,
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

    const etaText = estimated_arrival_min
      ? `aproximadamente *${estimated_arrival_min} minutos* do local`
      : "a caminho do local";
    vars.eta_text = etaText;

    vars.tracking_text = "";
    if (trigger === "beneficiary_creation" && beneficiary_tracking_url) {
      vars.tracking_text = `\n\n📍 Acompanhe seu atendimento em tempo real:\n${beneficiary_tracking_url}`;
    } else if (trigger === "beneficiary_dispatch" && beneficiary_tracking_url) {
      vars.tracking_text = `\n\n📍 Segue o link pra você acompanhar o andamento e a chegada do prestador:\n${beneficiary_tracking_url}\n\nPor favor, *não se esqueça de marcar no seu link quando ele chegar*, isso ajuda a gente a acompanhar aqui. ✅`;
    } else if (trigger === "provider_dispatch" && provider_tracking_url) {
      vars.tracking_text = `\n\n📍 *Navegação e rastreamento*:\n${provider_tracking_url}\n\nPor favor, acesse o link acima para iniciar a navegação e compartilhar sua localização em tempo real.`;
    }

    if (trigger === "beneficiary_completion") {
      vars.nps_text = nps_link
        ? `\n\nPor favor, nos ajude a melhorar! Avalie nosso atendimento:\n${nps_link}`
        : "\n\nEm breve você receberá uma pesquisa de satisfação. Sua opinião é muito importante para nós! ⭐";
    }

    const customMessage = phaseConfig?.custom_message;
    const messageTemplate = customMessage && customMessage.trim() ? customMessage : DEFAULT_MESSAGES[trigger];

    if (!messageTemplate) {
      return new Response(JSON.stringify({ error: `Unknown trigger: ${trigger}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const finalMessage = interpolateMessage(messageTemplate, vars);
    const results: any[] = [];

    if (trigger.startsWith("beneficiary_")) {
      if (beneficiaryPhone) {
        const r = await sendUazapiMessage(adminSupabase, sr.tenant_id, beneficiaryPhone, finalMessage);
        results.push({ target: "beneficiary", trigger, ok: r.ok });
        if (!r.ok) console.error("UazapiGO send error:", r.result);
      }
    } else if (trigger === "provider_dispatch") {
      if (provider_phone) {
        const r = await sendUazapiMessage(adminSupabase, sr.tenant_id, provider_phone, finalMessage);
        results.push({ target: "provider", trigger, ok: r.ok });
        if (!r.ok) console.error("UazapiGO send error:", r.result);
      }
    }

    console.log(`Auto-notify sent: trigger=${trigger}, protocol=${sr.protocol}, results=`, results);

    return new Response(JSON.stringify({ success: true, trigger, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Auto-notify error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { createClient } from "npm:@supabase/supabase-js@2";

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

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;

    const { phone, message, conversation_id, template, group_id, tenant_id } = await req.json();

    if (!phone && !group_id) {
      return new Response(JSON.stringify({ error: "phone or group_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!message && !template) {
      return new Response(JSON.stringify({ error: "message or template is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get Evolution API config from tenant if tenant_id provided, fallback to env
    let EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") || "";
    let EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";
    const EVOLUTION_INSTANCE = Deno.env.get("EVOLUTION_INSTANCE") || "default";

    if (tenant_id) {
      const adminSupabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: tenant } = await adminSupabase
        .from("tenants")
        .select("evolution_api_url, evolution_api_key")
        .eq("id", tenant_id)
        .single();

      if ((tenant as any)?.evolution_api_url) EVOLUTION_API_URL = (tenant as any).evolution_api_url;
      if ((tenant as any)?.evolution_api_key) EVOLUTION_API_KEY = (tenant as any).evolution_api_key;
    }

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      return new Response(
        JSON.stringify({
          error: "Evolution API não configurada. Vá em Configurações → Integrações → WhatsApp e configure sua instância.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseUrl = EVOLUTION_API_URL.replace(/\/$/, "");

    let cleanPhone = (phone || "").replace(/\D/g, "");
    if (cleanPhone.length <= 11) {
      cleanPhone = `55${cleanPhone}`;
    }

    let result: any;
    let response: Response;

    if (group_id) {
      response = await fetch(`${baseUrl}/message/sendText/${EVOLUTION_INSTANCE}`, {
        method: "POST",
        headers: { apikey: EVOLUTION_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ number: group_id, text: message }),
      });
      result = await response.json();
    } else if (template) {
      const templateText = template.body_text || template.name || message;
      response = await fetch(`${baseUrl}/message/sendText/${EVOLUTION_INSTANCE}`, {
        method: "POST",
        headers: { apikey: EVOLUTION_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ number: cleanPhone, text: templateText }),
      });
      result = await response.json();
    } else {
      response = await fetch(`${baseUrl}/message/sendText/${EVOLUTION_INSTANCE}`, {
        method: "POST",
        headers: { apikey: EVOLUTION_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ number: cleanPhone, text: message }),
      });
      result = await response.json();
    }

    if (!response.ok) {
      console.error("Evolution API error:", result);
      return new Response(
        JSON.stringify({ error: "Failed to send message", details: result }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save outbound message to DB
    if (conversation_id) {
      const adminSupabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const messageContent = template ? `[Template: ${template.name}]` : message;

      await adminSupabase.from("whatsapp_messages").insert({
        conversation_id, direction: "outbound",
        message_type: template ? "template" : "text",
        content: messageContent, external_id: result.key?.id || null,
      });

      await adminSupabase.from("whatsapp_conversations").update({
        last_message_at: new Date().toISOString(), assigned_to: userId,
      }).eq("id", conversation_id);
    }

    return new Response(JSON.stringify({ success: true, message_id: result.key?.id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Send WhatsApp error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

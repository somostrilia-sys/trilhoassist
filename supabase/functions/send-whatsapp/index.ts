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

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Try to find the operator's own Z-API instance first
    let zapiInstanceId = "";
    let zapiToken = "";
    let zapiSecurityToken = "";
    let zapiInstanceDbId: string | null = null;

    if (tenant_id && userId) {
      const { data: operatorInstance } = await adminSupabase
        .from("zapi_instances")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("operator_id", userId)
        .eq("active", true)
        .single();

      if (operatorInstance) {
        zapiInstanceId = operatorInstance.zapi_instance_id;
        zapiToken = operatorInstance.zapi_token;
        zapiSecurityToken = operatorInstance.zapi_security_token || "";
        zapiInstanceDbId = operatorInstance.id;
      }
    }

    // Fallback: use tenant-level Z-API config (legacy)
    if (!zapiInstanceId && tenant_id) {
      const { data: tenant } = await adminSupabase
        .from("tenants")
        .select("zapi_instance_id, zapi_token, zapi_security_token")
        .eq("id", tenant_id)
        .single();

      if (tenant) {
        zapiInstanceId = (tenant as any).zapi_instance_id || "";
        zapiToken = (tenant as any).zapi_token || "";
        zapiSecurityToken = (tenant as any).zapi_security_token || "";
      }
    }

    if (!zapiInstanceId || !zapiToken) {
      return new Response(
        JSON.stringify({
          error: "Z-API não configurada. Vá em Integrações → WhatsApp e configure sua instância.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let cleanPhone = (phone || "").replace(/\D/g, "");
    if (cleanPhone.length <= 11) {
      cleanPhone = `55${cleanPhone}`;
    }

    const textToSend = template ? (template.body_text || template.name || message) : message;
    const recipient = group_id || cleanPhone;

    const zapiUrl = `https://api.z-api.io/instances/${zapiInstanceId}/token/${zapiToken}/send-text`;
    const zapiHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (zapiSecurityToken) {
      zapiHeaders["Client-Token"] = zapiSecurityToken;
    }

    const response = await fetch(zapiUrl, {
      method: "POST",
      headers: zapiHeaders,
      body: JSON.stringify({ phone: recipient, message: textToSend }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Z-API error:", result);
      return new Response(
        JSON.stringify({ error: "Failed to send message", details: result }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save outbound message and update conversation
    if (conversation_id) {
      const messageContent = template ? `[Template: ${template.name}]` : message;

      await adminSupabase.from("whatsapp_messages").insert({
        conversation_id, direction: "outbound",
        message_type: template ? "template" : "text",
        content: messageContent, external_id: result.messageId || result.zaapId || null,
      });

      const convUpdate: Record<string, any> = {
        last_message_at: new Date().toISOString(),
        assigned_to: userId,
      };
      // Track which Z-API instance is handling this conversation
      if (zapiInstanceDbId) {
        convUpdate.operator_zapi_instance_id = zapiInstanceDbId;
      }

      await adminSupabase.from("whatsapp_conversations").update(convUpdate).eq("id", conversation_id);
    }

    return new Response(JSON.stringify({ success: true, message_id: result.messageId || result.zaapId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Send WhatsApp error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

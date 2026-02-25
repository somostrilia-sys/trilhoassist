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
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
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

    // Find the operator's UazapiGO instance
    let instanceToken = "";
    let serverUrl = "";
    let instanceName = "";
    let instanceDbId: string | null = null;
    let apiType = "uazapi";

    // Legacy Z-API fallback vars
    let zapiInstanceId = "";
    let zapiToken = "";
    let zapiSecurityToken = "";

    if (tenant_id && userId) {
      const { data: operatorInstance } = await adminSupabase
        .from("zapi_instances")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("operator_id", userId)
        .eq("active", true)
        .single();

      if (operatorInstance) {
        apiType = (operatorInstance as any).api_type || "uazapi";
        instanceToken = (operatorInstance as any).instance_token || "";
        instanceName = (operatorInstance as any).evolution_instance_name || (operatorInstance as any).zapi_instance_id || "";
        instanceDbId = operatorInstance.id;

        // Legacy Z-API fields
        zapiInstanceId = operatorInstance.zapi_instance_id;
        zapiToken = operatorInstance.zapi_token;
        zapiSecurityToken = operatorInstance.zapi_security_token || "";
      }
    }

    // Get UazapiGO server URL from tenant
    if ((apiType === "uazapi" || apiType === "evolution") && tenant_id) {
      const { data: tenantData } = await adminSupabase
        .from("tenants")
        .select("uazapi_server_url, uazapi_admin_token")
        .eq("id", tenant_id)
        .single();
      if (tenantData) {
        serverUrl = (tenantData as any).uazapi_server_url || "";
      }
      if (!serverUrl) serverUrl = Deno.env.get("UAZAPI_SERVER_URL") || Deno.env.get("EVOLUTION_API_URL") || "";
    }

    // Fallback: legacy Z-API tenant config
    if (!instanceToken && !zapiInstanceId && tenant_id) {
      const { data: tenant } = await adminSupabase
        .from("tenants")
        .select("zapi_instance_id, zapi_token, zapi_security_token")
        .eq("id", tenant_id)
        .single();

      if (tenant) {
        zapiInstanceId = (tenant as any).zapi_instance_id || "";
        zapiToken = (tenant as any).zapi_token || "";
        zapiSecurityToken = (tenant as any).zapi_security_token || "";
        apiType = "zapi";
      }
    }

    let cleanPhone = (phone || "").replace(/\D/g, "");
    if (cleanPhone.length <= 11) {
      cleanPhone = `55${cleanPhone}`;
    }

    const textToSend = template ? (template.body_text || template.name || message) : message;
    const recipient = group_id || cleanPhone;

    let result: any;

    // ====== UAZAPI GO V2 ======
    if ((apiType === "uazapi" || apiType === "evolution") && instanceToken && serverUrl && instanceName) {
      serverUrl = serverUrl.replace(/\/$/, "");

      const uazapiHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        token: instanceToken,
      };

      const uazapiResp = await fetch(`${serverUrl}/message/send-text`, {
        method: "POST",
        headers: uazapiHeaders,
        body: JSON.stringify({
          phone: recipient,
          message: textToSend,
        }),
      });

      result = await uazapiResp.json();

      if (!uazapiResp.ok) {
        console.error("UazapiGO send error:", result);
        return new Response(
          JSON.stringify({ error: "Failed to send message", details: result }),
          { status: uazapiResp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
    // ====== Z-API (legacy) ======
    else if (zapiInstanceId && zapiToken && zapiToken !== "uazapi") {
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

      result = await response.json();

      if (!response.ok) {
        console.error("Z-API error:", result);
        return new Response(
          JSON.stringify({ error: "Failed to send message", details: result }),
          { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      return new Response(
        JSON.stringify({
          error: "WhatsApp não configurado. Vá em Integrações → WhatsApp e configure sua instância.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save outbound message and update conversation
    if (conversation_id) {
      const messageContent = template ? `[Template: ${template.name}]` : message;

      await adminSupabase.from("whatsapp_messages").insert({
        conversation_id, direction: "outbound",
        message_type: template ? "template" : "text",
        content: messageContent,
        external_id: result.messageId || result.zaapId || result.key?.id || result.id || null,
      });

      const convUpdate: Record<string, any> = {
        last_message_at: new Date().toISOString(),
        assigned_to: userId,
      };
      if (instanceDbId) {
        convUpdate.operator_zapi_instance_id = instanceDbId;
      }

      await adminSupabase.from("whatsapp_conversations").update(convUpdate).eq("id", conversation_id);
    }

    return new Response(JSON.stringify({
      success: true,
      message_id: result.messageId || result.zaapId || result.key?.id || result.id,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Send WhatsApp error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

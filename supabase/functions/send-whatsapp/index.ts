import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Check UazapiGO connection status
async function checkUazapiStatus(serverUrl: string, instName: string, instToken: string): Promise<boolean> {
  try {
    const resp = await fetch(`${serverUrl}/instance/connectionState/${instName}`, {
      method: "GET",
      headers: { "Content-Type": "application/json", token: instToken },
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    const state = data.state || data.instance?.state || data.connectionState || data.status || "";
    return ["connected", "open", "CONNECTED"].includes(state) || data.connected === true || data.loggedIn === true;
  } catch {
    return false;
  }
}

// Try to reconnect UazapiGO instance
async function reconnectUazapi(serverUrl: string, instName: string, instToken: string): Promise<boolean> {
  try {
    console.log("Attempting UazapiGO reconnect for:", instName);
    const resp = await fetch(`${serverUrl}/instance/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: instToken },
      body: "{}",
    });
    const data = await resp.json();
    const state = data.state || data.instance?.state || data.instance?.status || "";
    const isConnected = data.connected === true || data.loggedIn === true
      || ["connected", "open", "CONNECTED"].includes(state)
      || data.response === "Already connected";
    if (isConnected) {
      console.log("UazapiGO reconnected successfully");
      return true;
    }
    console.log("UazapiGO reconnect response (not yet connected):", JSON.stringify(data).slice(0, 200));
    return false;
  } catch (e) {
    console.error("UazapiGO reconnect error:", e);
    return false;
  }
}

// Send text message with retry
async function sendUazapiText(
  serverUrl: string,
  instToken: string,
  recipient: string,
  text: string,
  maxRetries = 2
): Promise<{ ok: boolean; result: any }> {
  const sendUrl = `${serverUrl}/send/text`;
  const headers: Record<string, string> = { "Content-Type": "application/json", token: instToken };
  const body = JSON.stringify({ number: recipient, text });

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`UazapiGO send-text attempt ${attempt}/${maxRetries} to:`, recipient);
    try {
      const resp = await fetch(sendUrl, { method: "POST", headers, body });
      const result = await resp.json();
      console.log(`UazapiGO send response (attempt ${attempt}):`, resp.status, JSON.stringify(result).slice(0, 300));

      if (resp.ok) return { ok: true, result };

      // If last attempt, return error
      if (attempt === maxRetries) return { ok: false, result };

      // Wait before retry
      console.log("Send failed, retrying in 2s...");
      await sleep(2000);
    } catch (err) {
      console.error(`Send attempt ${attempt} network error:`, err);
      if (attempt === maxRetries) return { ok: false, result: { message: String(err) } };
      await sleep(2000);
    }
  }
  return { ok: false, result: { message: "Max retries exceeded" } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const userId = user.id;
    const { phone, message, conversation_id, template, group_id, tenant_id } = await req.json();

    if (!phone && !group_id) {
      return json({ error: "phone or group_id is required" }, 400);
    }

    if (!message && !template) {
      return json({ error: "message or template is required" }, 400);
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

    if (tenant_id && userId) {
      const { data: operatorInstance } = await adminSupabase
        .from("zapi_instances")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("operator_id", userId)
        .eq("active", true)
        .single();

      if (operatorInstance) {
        instanceToken = (operatorInstance as any).instance_token || "";
        instanceName = (operatorInstance as any).evolution_instance_name || (operatorInstance as any).instance_name || "";
        instanceDbId = operatorInstance.id;
      }
    }

    // Get UazapiGO server URL from tenant
    if (tenant_id) {
      const { data: tenantData } = await adminSupabase
        .from("tenants")
        .select("uazapi_server_url")
        .eq("id", tenant_id)
        .single();
      if (tenantData) {
        serverUrl = (tenantData as any).uazapi_server_url || "";
      }
      if (!serverUrl) serverUrl = Deno.env.get("UAZAPI_SERVER_URL") || "";
    }

    if (!instanceToken || !serverUrl || !instanceName) {
      return json({
        error: "WhatsApp não configurado. Vá em Integrações → WhatsApp e configure sua instância.",
      }, 200);
    }

    serverUrl = serverUrl.replace(/\/$/, "");

    let cleanPhone = (phone || "").replace(/\D/g, "");
    if (cleanPhone.length <= 11) {
      cleanPhone = `55${cleanPhone}`;
    }

    const textToSend = template ? (template.body_text || template.name || message) : message;
    const recipient = group_id || cleanPhone;

    // ====== PRE-SEND: Check connection status and reconnect if needed ======
    const isConnected = await checkUazapiStatus(serverUrl, instanceName, instanceToken);
    if (!isConnected) {
      console.log("UazapiGO not connected, attempting reconnect before send...");
      const reconnected = await reconnectUazapi(serverUrl, instanceName, instanceToken);
      if (reconnected) {
        // Update DB status
        if (instanceDbId) {
          await adminSupabase.from("zapi_instances").update({ connection_status: "connected" }).eq("id", instanceDbId);
        }
      } else {
        // Wait 3s and check once more
        await sleep(3000);
        const retryConnected = await checkUazapiStatus(serverUrl, instanceName, instanceToken);
        if (!retryConnected) {
          // Update DB to disconnected
          if (instanceDbId) {
            await adminSupabase.from("zapi_instances").update({ connection_status: "disconnected" }).eq("id", instanceDbId);
          }
          return json({
            error: "WhatsApp desconectado. Reconexão automática falhou. Reconecte manualmente em Integrações.",
          }, 200);
        }
        if (instanceDbId) {
          await adminSupabase.from("zapi_instances").update({ connection_status: "connected" }).eq("id", instanceDbId);
        }
      }
    }

    // ====== SEND with retry (2 attempts) ======
    const { ok, result } = await sendUazapiText(serverUrl, instanceToken, recipient, textToSend, 2);

    if (!ok) {
      const detail = result?.message || "Falha ao enviar mensagem";
      return json({ error: detail, details: result }, 200);
    }

    // Save outbound message and update conversation
    if (conversation_id) {
      const messageContent = template ? `[Template: ${template.name}]` : message;

      await adminSupabase.from("whatsapp_messages").insert({
        conversation_id, direction: "outbound",
        message_type: template ? "template" : "text",
        content: messageContent,
        external_id: result.messageId || result.zaapId || result.key?.id || result.id || null,
        sender_user_id: userId,
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

    return json({
      success: true,
      message_id: result.messageId || result.zaapId || result.key?.id || result.id,
    });
  } catch (err) {
    console.error("Send WhatsApp error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});

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
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { action, tenant_id, operator_id, instance_name, instance_db_id } = await req.json();

    // Get UazapiGO config: tenant-level first, then global env fallback
    let serverUrl = "";
    let adminToken = "";

    if (tenant_id) {
      const { data: tenant } = await adminSupabase
        .from("tenants")
        .select("uazapi_server_url, uazapi_admin_token")
        .eq("id", tenant_id)
        .single();

      if (tenant) {
        serverUrl = (tenant as any).uazapi_server_url || "";
        adminToken = (tenant as any).uazapi_admin_token || "";
      }
    }

    if (!serverUrl) serverUrl = Deno.env.get("UAZAPI_SERVER_URL") || Deno.env.get("EVOLUTION_API_URL") || "";
    if (!adminToken) adminToken = Deno.env.get("UAZAPI_ADMIN_TOKEN") || Deno.env.get("EVOLUTION_API_KEY") || "";

    if (!serverUrl || !adminToken) {
      return new Response(
        JSON.stringify({ error: "UazapiGO não configurada. Vá em Integrações e configure Server URL e Admin Token." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    serverUrl = serverUrl.replace(/\/$/, "");

    const adminHeaders = {
      "Content-Type": "application/json",
      admintoken: adminToken,
    };

      // Helper: POST /webhook to configure webhook on instance
      async function configureWebhook(instanceToken: string, tenantId: string): Promise<any> {
            const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-webhook?tenant=${tenantId}&source=uazapi`;
            console.log("Configuring webhook for instance, url:", webhookUrl);
            try {
                    const resp = await fetch(`${serverUrl}/webhook`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', 'token': instanceToken },
                              body: JSON.stringify({ url: webhookUrl, enabled: true, events: ['messages', 'connection'] })
                    });
                    const result = await resp.json();
                    console.log("Webhook configured:", JSON.stringify(result));
                    return result;
            } catch (err) {
                    console.error("Error configuring webhook:", err);
                    return null;
            }
      }

    // Helper: POST /instance/connect with instance token
    async function fetchConnect(instName: string, instanceToken: string): Promise<any> {
      const url = `${serverUrl}/instance/connect`;
      console.log("Calling UazapiGO connect (POST):", url, "instanceName:", instName);
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          token: instanceToken,
        },
        body: "{}",
      });
      return { status: resp.status, data: await resp.json() };
    }

    // Helper: configure webhook separately via POST /webhook (UazapiGO ignores webhook in /instance/create)
    async function configureWebhook2(instanceToken: string, tenantId: string): Promise<void> {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook?tenant=${tenantId}&source=uazapi`;
      const webhookBody = {
        url: webhookUrl,
        enabled: true,
        events: ['messages', 'connection'],
      };
      console.log("Configuring webhook separately via POST /webhook:", JSON.stringify(webhookBody));
      try {
        const resp = await fetch(`${serverUrl}/webhook`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            token: instanceToken,
          },
          body: JSON.stringify(webhookBody),
        });
        const result = await resp.json();
        console.log("Webhook config response:", resp.status, JSON.stringify(result));
        if (!resp.ok) {
          console.error("Webhook config failed (non-fatal):", result);
        }
      } catch (e) {
        console.error("Webhook config error (non-fatal):", e);
      }
    }

    // Helper: recreate instance on UazapiGO and update DB row
    async function recreateInstance(instName: string, dbId: string, tenantId: string): Promise<any> {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook?tenant=${tenantId}&source=uazapi`;
      const createBody = { name: instName, instanceName: instName, webhook: webhookUrl };
      console.log("Recreating UazapiGO instance:", JSON.stringify(createBody));

      const resp = await fetch(`${serverUrl}/instance/create`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify(createBody),
      });
      const result = await resp.json();
      if (!resp.ok) {
        console.error("UazapiGO recreate error:", result);
        return null;
      }
      const newToken = result.token || result.instance?.token || "";
      // Configure webhook separately after recreation
      if (newToken) {
        await configureWebhook(newToken, tenantId);
      }
      await adminSupabase
        .from("zapi_instances")
        .update({ instance_token: newToken, connection_status: "disconnected" })
        .eq("id", dbId);
      return result;
    }

    // Helper: extract QR from connect response
    function extractQr(data: any): { qrcode: string | null; status: string } {
      // Check all possible "connected" indicators from UazapiGO
      const state = data.state || data.instance?.state || data.instance?.status || data.status;
      const isConnected = data.connected === true 
        || data.loggedIn === true
        || ["connected", "open", "CONNECTED"].includes(state)
        || data.response === "Already connected";
      
      if (isConnected) {
        console.log("extractQr: detected connected state", JSON.stringify({ state, connected: data.connected, loggedIn: data.loggedIn, response: data.response }));
        return { qrcode: null, status: "connected" };
      }
      
      const qr = data.instance?.qrcode || data.qrcode || data.base64 || null;
      // Filter out empty strings
      const validQr = qr && qr.length > 10 ? qr : null;
      return { qrcode: validQr, status: validQr ? "qr_ready" : "waiting_qr" };
    }

    // ====== CREATE INSTANCE ======
    if (action === "create_instance") {
      if (!instance_name || !tenant_id || !operator_id) {
        return new Response(JSON.stringify({ error: "instance_name, tenant_id and operator_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook?tenant=${tenant_id}&source=uazapi`;

      const createBody = {
        name: instance_name,
        instanceName: instance_name,
        webhook: webhookUrl,
      };

      console.log("Creating UazapiGO instance:", JSON.stringify(createBody));

      const createResp = await fetch(`${serverUrl}/instance/create`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify(createBody),
      });

      const createResult = await createResp.json();

      if (!createResp.ok) {
        console.error("UazapiGO create error:", createResult);
        return new Response(
          JSON.stringify({ error: "Falha ao criar instância", details: createResult }),
          { status: createResp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const instanceToken = createResult.token || createResult.instance?.token || "";
      const instanceId = createResult.instance?.instanceName || createResult.instanceName || instance_name;

      // Configure webhook separately (UazapiGO ignores webhook param in /instance/create)
      if (instanceToken) {
        await configureWebhook(instanceToken, tenant_id);
      }

      const { data: dbInstance, error: dbErr } = await adminSupabase
        .from("zapi_instances")
        .insert({
          tenant_id,
          operator_id,
          instance_name,
          api_type: "uazapi",
          evolution_instance_name: instanceId,
          evolution_instance_id: instanceId,
          zapi_instance_id: instanceId,
          zapi_token: "uazapi",
          instance_token: instanceToken,
          connection_status: "disconnected",
          active: true,
        })
        .select()
        .single();

      if (dbErr) {
        console.error("DB insert error:", dbErr);
        return new Response(
          JSON.stringify({ error: "Instância criada mas erro ao salvar no banco", details: dbErr }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Immediately call /instance/connect to get QR code
      let qrcode: string | null = null;
      let qrStatus = "waiting_qr";
      try {
        const connectResult = await fetchConnect(instance_name, instanceToken);
        const extracted = extractQr(connectResult.data);
        qrcode = extracted.qrcode;
        qrStatus = extracted.status;
      } catch (e) {
        console.error("Connect after create error (non-fatal):", e);
      }

      return new Response(
        JSON.stringify({
          success: true,
          instance: dbInstance,
          qrcode,
          status: qrStatus,
          uazapi_data: createResult,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ====== GET QR CODE ======
    if (action === "get_qrcode") {
      if (!instance_db_id) {
        return new Response(JSON.stringify({ error: "instance_db_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: inst } = await adminSupabase
        .from("zapi_instances")
        .select("*")
        .eq("id", instance_db_id)
        .single();

      if (!inst) {
        return new Response(JSON.stringify({ error: "Instance not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const instName = (inst as any).instance_name || (inst as any).evolution_instance_name || (inst as any).zapi_instance_id;
      const instToken = (inst as any).instance_token || "";
      const instTenantId = (inst as any).tenant_id;

      // Call POST /instance/connect with instance token
      let connectResult = await fetchConnect(instName, instToken);

      // If 404, instance doesn't exist on UazapiGO — recreate it
      if (connectResult.status === 404 || connectResult.status === 401) {
        console.log("Instance not found on UazapiGO, recreating:", instName);
        const recreated = await recreateInstance(instName, instance_db_id, instTenantId);
        if (!recreated) {
          return new Response(
            JSON.stringify({ error: "Falha ao recriar instância no UazapiGO" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        // Try connect again after recreation
        // After recreation, re-fetch instance to get new token
        const { data: updatedInst } = await adminSupabase
          .from("zapi_instances")
          .select("instance_token")
          .eq("id", instance_db_id)
          .single();
        const newToken = (updatedInst as any)?.instance_token || "";
        connectResult = await fetchConnect(instName, newToken);
      }

      const extracted = extractQr(connectResult.data);

      if (extracted.status === "connected") {
        await adminSupabase
          .from("zapi_instances")
          .update({ connection_status: "connected" })
          .eq("id", instance_db_id);
      }

      return new Response(
        JSON.stringify({
          success: true,
          qrcode: extracted.qrcode,
          pairingCode: connectResult.data.pairingCode || null,
          status: extracted.status,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ====== CHECK STATUS ======
    if (action === "check_status") {
      if (!instance_db_id) {
        return new Response(JSON.stringify({ error: "instance_db_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: inst } = await adminSupabase
        .from("zapi_instances")
        .select("*")
        .eq("id", instance_db_id)
        .single();

      if (!inst) {
        return new Response(JSON.stringify({ error: "Instance not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const instName = (inst as any).instance_name || (inst as any).evolution_instance_name || (inst as any).zapi_instance_id;
      const instToken = (inst as any).instance_token || "";

      // Try multiple endpoints to check status
      let state = "unknown";
      let isConnected = false;

      // 1) Try /instance/connectionState/{name} with instance token
      try {
        const statusResp = await fetch(`${serverUrl}/instance/connectionState/${instName}`, {
          method: "GET",
          headers: { "Content-Type": "application/json", token: instToken },
        });
        const statusResult = await statusResp.json();
        console.log("check_status connectionState response:", JSON.stringify(statusResult));
        state = statusResult.state || statusResult.instance?.state || statusResult.connectionState || statusResult.status || "unknown";
      } catch (e) {
        console.log("connectionState endpoint failed, trying /instance/info:", e);
      }

      // 2) Fallback: try /instance/{name}/info with admintoken
      if (state === "unknown") {
        try {
          const statusResp2 = await fetch(`${serverUrl}/instance/${instName}/info`, {
            method: "GET",
            headers: adminHeaders,
          });
          const statusResult2 = await statusResp2.json();
          console.log("check_status info response:", JSON.stringify(statusResult2));
          state = statusResult2.state || statusResult2.instance?.state || statusResult2.connectionState || statusResult2.status || "unknown";
        } catch (e2) {
          console.error("info endpoint also failed:", e2);
        }
      }

      // 3) Fallback: try POST /instance/connect with instance token
      if (state === "unknown") {
        try {
          const connectResult = await fetchConnect(instName, instToken);
          console.log("check_status connect fallback response:", JSON.stringify(connectResult.data));
          const extracted = extractQr(connectResult.data);
          if (extracted.status === "connected") {
            state = "connected";
          }
        } catch (e3) {
          console.error("connect fallback also failed:", e3);
        }
      }

      isConnected = ["connected", "open", "CONNECTED"].includes(state);

      // Auto-reconnect if disconnected
      if (!isConnected) {
        console.log("check_status: disconnected, attempting auto-reconnect for:", instName);
        try {
          const reconnectResult = await fetchConnect(instName, instToken);
          const reconnectState = reconnectResult.data?.state || reconnectResult.data?.instance?.state || "";
          const reconnected = reconnectResult.data?.connected === true 
            || reconnectResult.data?.loggedIn === true
            || ["connected", "open", "CONNECTED"].includes(reconnectState)
            || reconnectResult.data?.response === "Already connected";
          if (reconnected) {
            console.log("Auto-reconnect successful!");
            isConnected = true;
            state = "connected";
          }
        } catch (e) {
          console.error("Auto-reconnect failed:", e);
        }
      }

      await adminSupabase
        .from("zapi_instances")
        .update({ connection_status: isConnected ? "connected" : "disconnected" })
        .eq("id", instance_db_id);

      return new Response(
        JSON.stringify({
          success: true,
          connected: isConnected,
          state: state || "unknown",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ====== DELETE INSTANCE ======
    if (action === "delete_instance") {
      if (!instance_db_id) {
        return new Response(JSON.stringify({ error: "instance_db_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: inst } = await adminSupabase
        .from("zapi_instances")
        .select("*")
        .eq("id", instance_db_id)
        .single();

      if (inst) {
        const instName = (inst as any).evolution_instance_name || (inst as any).zapi_instance_id;

        try {
          await fetch(`${serverUrl}/instance/${instName}/delete`, {
            method: "DELETE",
            headers: adminHeaders,
          });
        } catch (e) {
          console.error("UazapiGO delete error (non-fatal):", e);
        }

        await adminSupabase.from("zapi_instances").delete().eq("id", instance_db_id);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ====== LOGOUT (disconnect WhatsApp) ======
    if (action === "logout") {
      if (!instance_db_id) {
        return new Response(JSON.stringify({ error: "instance_db_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: inst } = await adminSupabase
        .from("zapi_instances")
        .select("*")
        .eq("id", instance_db_id)
        .single();

      if (inst) {
        const instName = (inst as any).evolution_instance_name || (inst as any).zapi_instance_id;

        try {
          await fetch(`${serverUrl}/instance/${instName}/logout`, {
            method: "DELETE",
            headers: adminHeaders,
          });
        } catch (e) {
          console.error("UazapiGO logout error:", e);
        }

        await adminSupabase
          .from("zapi_instances")
          .update({ connection_status: "disconnected" })
          .eq("id", instance_db_id);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ====== SET WEBHOOK (re-apply webhook URL on UazapiGO instance) ======
    if (action === "set_webhook") {
      if (!instance_db_id) {
        return new Response(JSON.stringify({ error: "instance_db_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: inst } = await adminSupabase
        .from("zapi_instances")
        .select("*")
        .eq("id", instance_db_id)
        .single();

      if (!inst) {
        return new Response(JSON.stringify({ error: "Instance not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const instToken = (inst as any).instance_token || "";
      const instTenantId = (inst as any).tenant_id;

      if (!instToken) {
        return new Response(JSON.stringify({ error: "Instância sem token. Recrie a instância." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const webhookResult = await configureWebhook(instToken, instTenantId);

      return new Response(
        JSON.stringify({
          success: true,
          webhook_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-webhook?tenant=${instTenantId}&source=uazapi`,
          uazapi_response: webhookResult,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("UazapiGO API error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

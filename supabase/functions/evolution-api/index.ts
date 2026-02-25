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

      // UazapiGO accepts both "name" and "instanceName" — send both to guarantee compatibility
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

      // UazapiGO returns instance token on creation
      const instanceToken = createResult.token || createResult.instance?.token || "";
      const instanceId = createResult.instance?.instanceName || createResult.instanceName || instance_name;

      // Save to DB
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

      return new Response(
        JSON.stringify({
          success: true,
          instance: dbInstance,
          qrcode: createResult.qrcode,
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

      console.log("Fetching QR for instance:", instName, "URL:", `${serverUrl}/instance/qrcode/${instName}`);

      const qrResp = await fetch(`${serverUrl}/instance/qrcode/${instName}`, {
        method: "GET",
        headers: adminHeaders,
      });

      const qrResult = await qrResp.json();

      // Check if already connected
      const state = qrResult.state || qrResult.instance?.state;
      if (state === "connected" || state === "open") {
        await adminSupabase
          .from("zapi_instances")
          .update({ connection_status: "connected" })
          .eq("id", instance_db_id);

        return new Response(
          JSON.stringify({ success: true, qrcode: null, status: "connected" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          qrcode: qrResult.qrcode || qrResult.base64 || qrResult.qr || null,
          pairingCode: qrResult.pairingCode || null,
          status: state || "waiting_qr",
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

      const instName = (inst as any).evolution_instance_name || (inst as any).zapi_instance_id;

      const statusResp = await fetch(`${serverUrl}/instance/${instName}/info`, {
        method: "GET",
        headers: adminHeaders,
      });

      const statusResult = await statusResp.json();
      const state = statusResult.state || statusResult.instance?.state || statusResult.connectionState;
      const isConnected = state === "connected" || state === "open";

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

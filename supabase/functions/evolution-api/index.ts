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

    // Get Evolution API config: first try tenant-level, then fallback to global env
    let evolutionUrl = "";
    let evolutionApiKey = "";

    if (tenant_id) {
      const { data: tenant } = await adminSupabase
        .from("tenants")
        .select("evolution_api_url, evolution_api_key")
        .eq("id", tenant_id)
        .single();

      if (tenant) {
        evolutionUrl = (tenant as any).evolution_api_url || "";
        evolutionApiKey = (tenant as any).evolution_api_key || "";
      }
    }

    // Fallback to global secrets
    if (!evolutionUrl) evolutionUrl = Deno.env.get("EVOLUTION_API_URL") || "";
    if (!evolutionApiKey) evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY") || "";

    if (!evolutionUrl || !evolutionApiKey) {
      return new Response(
        JSON.stringify({ error: "Evolution API não configurada." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize URL (remove trailing slash)
    evolutionUrl = evolutionUrl.replace(/\/$/, "");

    const evolutionHeaders = {
      "Content-Type": "application/json",
      apikey: evolutionApiKey,
    };

    // ====== CREATE INSTANCE ======
    if (action === "create_instance") {
      if (!instance_name || !tenant_id || !operator_id) {
        return new Response(JSON.stringify({ error: "instance_name, tenant_id and operator_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create instance in Evolution API
      const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-webhook?tenant=${tenant_id}&source=evolution`;

      // Step 1: Create instance without webhook (Evolution API expects webhook as string or separate call)
      const createResp = await fetch(`${evolutionUrl}/instance/create`, {
        method: "POST",
        headers: evolutionHeaders,
        body: JSON.stringify({
          instanceName: instance_name,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
        }),
      });

      const createResult = await createResp.json();

      if (!createResp.ok) {
        console.error("Evolution create error:", createResult);
        return new Response(
          JSON.stringify({ error: "Falha ao criar instância", details: createResult }),
          { status: createResp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Step 2: Set webhook separately
      const evoInstanceName = createResult.instance?.instanceName || instance_name;
      try {
        await fetch(`${evolutionUrl}/webhook/set/${evoInstanceName}`, {
          method: "POST",
          headers: evolutionHeaders,
          body: JSON.stringify({
            url: webhookUrl,
            webhook_by_events: false,
            webhook_base64: false,
            events: [
              "MESSAGES_UPSERT",
              "CONNECTION_UPDATE",
              "QRCODE_UPDATED",
            ],
          }),
        });
      } catch (whErr) {
        console.error("Webhook set error (non-fatal):", whErr);
      }

      const createResult = await createResp.json();

      if (!createResp.ok) {
        console.error("Evolution create error:", createResult);
        return new Response(
          JSON.stringify({ error: "Falha ao criar instância", details: createResult }),
          { status: createResp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Save to DB
      const { data: dbInstance, error: dbErr } = await adminSupabase
        .from("zapi_instances")
        .insert({
          tenant_id,
          operator_id,
          instance_name,
          api_type: "evolution",
          evolution_instance_name: instance_name,
          evolution_instance_id: createResult.instance?.instanceName || instance_name,
          zapi_instance_id: createResult.instance?.instanceName || instance_name,
          zapi_token: "evolution",
          connection_status: "disconnected",
          active: true,
        })
        .select()
        .single();

      if (dbErr) {
        console.error("DB insert error:", dbErr);
        return new Response(
          JSON.stringify({ error: "Instância criada na Evolution mas erro ao salvar no banco", details: dbErr }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          instance: dbInstance,
          qrcode: createResult.qrcode,
          evolution_data: createResult,
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

      const evoName = (inst as any).evolution_instance_name || (inst as any).zapi_instance_id;

      // Connect to get QR code
      const connectResp = await fetch(
        `${evolutionUrl}/instance/connect/${evoName}`,
        { method: "GET", headers: evolutionHeaders }
      );

      const connectResult = await connectResp.json();

      return new Response(
        JSON.stringify({
          success: true,
          qrcode: connectResult.base64 || connectResult.qrcode?.base64 || null,
          pairingCode: connectResult.pairingCode || null,
          status: connectResult.instance?.state || "unknown",
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

      const evoName = (inst as any).evolution_instance_name || (inst as any).zapi_instance_id;

      const statusResp = await fetch(
        `${evolutionUrl}/instance/connectionState/${evoName}`,
        { method: "GET", headers: evolutionHeaders }
      );

      const statusResult = await statusResp.json();
      const isConnected = statusResult.instance?.state === "open";

      // Update DB status
      await adminSupabase
        .from("zapi_instances")
        .update({ connection_status: isConnected ? "connected" : "disconnected" })
        .eq("id", instance_db_id);

      return new Response(
        JSON.stringify({
          success: true,
          connected: isConnected,
          state: statusResult.instance?.state || "unknown",
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
        const evoName = (inst as any).evolution_instance_name || (inst as any).zapi_instance_id;

        // Delete from Evolution API (best effort)
        try {
          await fetch(`${evolutionUrl}/instance/delete/${evoName}`, {
            method: "DELETE",
            headers: evolutionHeaders,
          });
        } catch (e) {
          console.error("Evolution delete error (non-fatal):", e);
        }

        // Delete from DB
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
        const evoName = (inst as any).evolution_instance_name || (inst as any).zapi_instance_id;

        await fetch(`${evolutionUrl}/instance/logout/${evoName}`, {
          method: "DELETE",
          headers: evolutionHeaders,
        });

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
    console.error("Evolution API error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const body = await req.json();
    const { action } = body;

    // ─── AUTO SYNC (called by cron, no user auth) ───
    if (action === "auto_sync") {
      const serviceSupabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { data: clients } = await serviceSupabase
        .from("clients")
        .select("id, name, api_endpoint, api_key, api_auth_header, tenant_id, auto_sync_enabled")
        .eq("auto_sync_enabled", true);

      if (!clients || clients.length === 0) {
        return jsonResponse({ message: "No clients with auto sync enabled" });
      }

      const results = [];
      for (const client of clients) {
        if (!client.api_endpoint || !client.api_key) continue;
        try {
          const importResult = await importBeneficiaries(serviceSupabase, client, client.tenant_id, "automatic");
          results.push({ client: client.name, ...importResult });
        } catch (err: any) {
          results.push({ client: client.name, error: err.message });
        }
      }

      return jsonResponse({ synced: results.length, results });
    }

    // ─── AUTHENTICATED ACTIONS ───
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
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { client_id, tenant_id } = body;

    // Get client's API config
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, name, api_endpoint, api_key")
      .eq("id", client_id)
      .single();

    if (clientError || !client) {
      return jsonResponse({ error: "Cliente não encontrado" }, 404);
    }

    if (!client.api_endpoint || !client.api_key) {
      return jsonResponse({ error: "API endpoint ou chave não configurados para este cliente" }, 400);
    }

    // Build auth headers based on client config
    const buildApiHeaders = (apiKey: string, authHeader?: string) => {
      const h: Record<string, string> = { "Content-Type": "application/json", "Accept": "application/json" };
      const headerType = authHeader || "bearer";
      if (headerType === "token") {
        h["token"] = apiKey;
      } else if (headerType === "raw") {
        // Raw Authorization header without prefix
        h["Authorization"] = apiKey;
      } else {
        // Default: Bearer token
        h["Authorization"] = `Bearer ${apiKey}`;
      }
      return h;
    };

    // Get extended client config (auth header type)
    const { data: clientExt } = await supabase
      .from("clients")
      .select("api_auth_header")
      .eq("id", client_id)
      .single();

    const apiHeaders = buildApiHeaders(client.api_key, clientExt?.api_auth_header);
    console.log("API headers keys:", Object.keys(apiHeaders), "authHeader config:", clientExt?.api_auth_header);
    // ─── ACTION: TEST CONNECTION ───
    if (action === "test") {
      try {
        // Try POST first (Hinova and most ERPs use POST for listing endpoints), fallback to GET
        let response = await fetch(client.api_endpoint, {
          method: "POST",
          headers: apiHeaders,
          body: JSON.stringify({}),
        });

        if (response.status === 405 || response.status === 404) {
          // Endpoint doesn't accept POST, try GET
          response = await fetch(client.api_endpoint, {
            method: "GET",
            headers: apiHeaders,
          });
        }

        if (!response.ok) {
          const text = await response.text();
          return jsonResponse({
            success: false,
            status: response.status,
            message: `ERP retornou erro ${response.status}: ${text.substring(0, 200)}`,
          });
        }

        const data = await response.json();

        // Log raw response structure for debugging
        const rawKeys = typeof data === "object" && data !== null ? Object.keys(data) : [];
        console.log("ERP raw response keys:", rawKeys);
        if (rawKeys.length > 0) {
          for (const key of rawKeys.slice(0, 5)) {
            const val = data[key];
            const preview = typeof val === "string" ? val.substring(0, 500) : JSON.stringify(val)?.substring(0, 500);
            console.log(`  key="${key}" type=${typeof val} isArray=${Array.isArray(val)} preview=${preview}`);
          }
        }

        // Try to extract records from any nested key
        const records = extractRecords(data);

        // Try to extract available fields/plans/cooperativas from response
        const sampleFields = extractSampleFields(data);

        return jsonResponse({
          success: true,
          status: response.status,
          message: "Conexão bem-sucedida",
          sample_data: sampleFields,
          raw_count: records.length,
          raw_keys: rawKeys,
        });
      } catch (fetchErr: any) {
        return jsonResponse({
          success: false,
          message: `Erro ao conectar: ${fetchErr.message}`,
        });
      }
    }

    // ─── ACTION: FETCH ERP DATA (for mapping preview) ───
    if (action === "fetch_fields") {
      try {
        let response = await fetch(client.api_endpoint, {
          method: "POST",
          headers: apiHeaders,
          body: JSON.stringify({}),
        });

        if (response.status === 405 || response.status === 404) {
          response = await fetch(client.api_endpoint, {
            method: "GET",
            headers: apiHeaders,
          });
        }

        if (!response.ok) {
          const text = await response.text();
          return jsonResponse({ error: `ERP retornou erro ${response.status}: ${text.substring(0, 200)}` }, 500);
        }

        const data = await response.json();
        const fields = extractUniqueFields(data);

        return jsonResponse({ success: true, fields });
      } catch (fetchErr: any) {
        return jsonResponse({ error: `Erro ao buscar campos: ${fetchErr.message}` }, 500);
      }
    }

    // ─── ACTION: IMPORT BENEFICIARIES ───
    if (action === "import") {
      // Create sync log
      const { data: syncLog, error: logError } = await supabase
        .from("erp_sync_logs")
        .insert({
          client_id,
          tenant_id,
          sync_type: body.sync_type || "manual",
          status: "running",
        })
        .select()
        .single();

      if (logError) {
        return jsonResponse({ error: `Erro ao criar log: ${logError.message}` }, 500);
      }

      try {
        // Fetch data from ERP
        let response = await fetch(client.api_endpoint, {
          method: "POST",
          headers: apiHeaders,
          body: JSON.stringify({}),
        });

        if (response.status === 405 || response.status === 404) {
          response = await fetch(client.api_endpoint, {
            method: "GET",
            headers: apiHeaders,
          });
        }

        if (!response.ok) {
          const text = await response.text();
          await updateSyncLog(supabase, syncLog.id, "error", 0, 0, 0, `ERP erro ${response.status}: ${text.substring(0, 200)}`);
          return jsonResponse({ error: `ERP retornou erro ${response.status}` }, 500);
        }

        const erpData = await response.json();
        console.log("Import - ERP response type:", typeof erpData, "isArray:", Array.isArray(erpData));
        if (typeof erpData === "object" && !Array.isArray(erpData)) {
          console.log("Import - ERP response keys:", Object.keys(erpData));
        }
        const records = extractRecords(erpData);
        console.log("Import - extracted records count:", records.length);

        if (records.length === 0) {
          // Log first-level structure for debugging
          const debugInfo = Array.isArray(erpData) 
            ? `Array with ${erpData.length} items` 
            : `Object with keys: ${Object.keys(erpData).join(", ")}`;
          await updateSyncLog(supabase, syncLog.id, "error", 0, 0, 0, `Nenhum registro encontrado. Estrutura: ${debugInfo}`);
          return jsonResponse({ error: "Nenhum registro encontrado na resposta do ERP", debug: debugInfo }, 400);
        }

        // Get field mappings for this client
        const { data: mappings } = await supabase
          .from("erp_field_mappings")
          .select("*")
          .eq("client_id", client_id);

        const planMap = new Map((mappings || []).filter((m: any) => m.field_type === "plan").map((m: any) => [m.erp_value, m.trilho_id]));
        const coopMap = new Map((mappings || []).filter((m: any) => m.field_type === "cooperativa").map((m: any) => [m.erp_value, m.trilho_value]));

        let created = 0;
        let updated = 0;

        for (const record of records) {
          const plate = record.placa || record.vehicle_plate || record.plate || "";
          const name = record.nome_associado || record.nome || record.name || record.beneficiario || "";
          const phone = record.telefone || record.phone || record.celular || record.telefone_residencial || record.telefone_celular || "";
          const cpf = record.cpf || record.documento || "";
          const vehicleModel = record.modelo || record.vehicle_model || record.veiculo || record.descricao_modelo || "";
          const vehicleYear = record.ano_modelo || record.ano || record.vehicle_year || record.year || null;
          const vehicleChassis = record.chassi || record.chassis || "";
          const erpPlan = record.plano || record.plan || record.plan_name || record.descricao_produto || "";
          const erpCoop = record.nome_cooperativa || record.cooperativa || record.coop || record.cooperative || record.descricao_cooperativa || "";

          if (!name && !plate) continue; // skip empty records

          const planId = planMap.get(erpPlan) || null;
          const cooperativa = coopMap.get(erpCoop) || erpCoop;

          // Check if beneficiary already exists by plate
          const { data: existing } = await supabase
            .from("beneficiaries")
            .select("id")
            .eq("client_id", client_id)
            .eq("vehicle_plate", plate)
            .maybeSingle();

          if (existing) {
            await supabase
              .from("beneficiaries")
              .update({
                name,
                phone: phone || undefined,
                cpf: cpf || undefined,
                vehicle_model: vehicleModel || undefined,
                vehicle_year: vehicleYear ? parseInt(vehicleYear) : undefined,
                vehicle_chassis: vehicleChassis || undefined,
                plan_id: planId || undefined,
                cooperativa: cooperativa || undefined,
              })
              .eq("id", existing.id);
            updated++;
          } else {
            await supabase.from("beneficiaries").insert({
              client_id,
              name,
              vehicle_plate: plate,
              phone: phone || null,
              cpf: cpf || null,
              vehicle_model: vehicleModel || null,
              vehicle_year: vehicleYear ? parseInt(vehicleYear) : null,
              vehicle_chassis: vehicleChassis || null,
              plan_id: planId,
              cooperativa: cooperativa || null,
            });
            created++;
          }
        }

        await updateSyncLog(supabase, syncLog.id, "success", records.length, created, updated, null);

        return jsonResponse({
          success: true,
          records_found: records.length,
          records_created: created,
          records_updated: updated,
        });
      } catch (err: any) {
        await updateSyncLog(supabase, syncLog.id, "error", 0, 0, 0, err.message);
        return jsonResponse({ error: `Erro na importação: ${err.message}` }, 500);
      }
    }

    return jsonResponse({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (err: any) {
    console.error("ERP integration error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function updateSyncLog(
  supabase: any,
  id: string,
  status: string,
  found: number,
  created: number,
  updated: number,
  error: string | null
) {
  await supabase
    .from("erp_sync_logs")
    .update({
      status,
      records_found: found,
      records_created: created,
      records_updated: updated,
      error_message: error,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);
}

async function importBeneficiaries(supabase: any, client: any, tenantId: string, syncType: string) {
  const { data: syncLog } = await supabase
    .from("erp_sync_logs")
    .insert({ client_id: client.id, tenant_id: tenantId, sync_type: syncType, status: "running" })
    .select()
    .single();

  try {
    const authHeader = client.api_auth_header || "token";
    const headers: Record<string, string> = { "Content-Type": "application/json", "Accept": "application/json" };
    if (authHeader === "bearer") {
      headers["Authorization"] = `Bearer ${client.api_key}`;
    } else if (authHeader === "raw") {
      headers["Authorization"] = client.api_key;
    } else {
      headers[authHeader] = client.api_key;
    }
    let response = await fetch(client.api_endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });

    if (response.status === 405 || response.status === 404) {
      response = await fetch(client.api_endpoint, {
        method: "GET",
        headers,
      });
    }

    if (!response.ok) {
      const text = await response.text();
      if (syncLog) await updateSyncLog(supabase, syncLog.id, "error", 0, 0, 0, `ERP erro ${response.status}`);
      return { error: `ERP erro ${response.status}: ${text.substring(0, 100)}` };
    }

    const erpData = await response.json();
    const records = extractRecords(erpData);
    if (records.length === 0) {
      if (syncLog) await updateSyncLog(supabase, syncLog.id, "error", 0, 0, 0, "Nenhum registro encontrado");
      return { error: "Nenhum registro encontrado" };
    }

    const { data: mappings } = await supabase.from("erp_field_mappings").select("*").eq("client_id", client.id);
    const planMap = new Map((mappings || []).filter((m: any) => m.field_type === "plan").map((m: any) => [m.erp_value, m.trilho_id]));
    const coopMap = new Map((mappings || []).filter((m: any) => m.field_type === "cooperativa").map((m: any) => [m.erp_value, m.trilho_value]));

    let created = 0, updated = 0;
    for (const record of records) {
      const plate = record.placa || record.vehicle_plate || record.plate || "";
      const name = record.nome_associado || record.nome || record.name || record.beneficiario || "";
      if (!name && !plate) continue;

      const phone = record.telefone || record.phone || record.celular || record.telefone_residencial || record.telefone_celular || "";
      const cpf = record.cpf || record.documento || "";
      const vehicleModel = record.modelo || record.vehicle_model || record.veiculo || record.descricao_modelo || "";
      const vehicleYear = record.ano_modelo || record.ano || record.vehicle_year || record.year || null;
      const vehicleChassis = record.chassi || record.chassis || "";
      const erpPlan = record.plano || record.plan || record.plan_name || record.descricao_produto || "";
      const erpCoop = record.nome_cooperativa || record.cooperativa || record.coop || record.cooperative || record.descricao_cooperativa || "";
      const planId = planMap.get(erpPlan) || null;
      const cooperativa = coopMap.get(erpCoop) || erpCoop;

      const { data: existing } = await supabase
        .from("beneficiaries").select("id").eq("client_id", client.id).eq("vehicle_plate", plate).maybeSingle();

      if (existing) {
        await supabase.from("beneficiaries").update({
          name, phone: phone || undefined, cpf: cpf || undefined,
          vehicle_model: vehicleModel || undefined, vehicle_year: vehicleYear ? parseInt(vehicleYear) : undefined,
          vehicle_chassis: vehicleChassis || undefined, plan_id: planId || undefined, cooperativa: cooperativa || undefined,
        }).eq("id", existing.id);
        updated++;
      } else {
        await supabase.from("beneficiaries").insert({
          client_id: client.id, name, vehicle_plate: plate, phone: phone || null, cpf: cpf || null,
          vehicle_model: vehicleModel || null, vehicle_year: vehicleYear ? parseInt(vehicleYear) : null,
          vehicle_chassis: vehicleChassis || null, plan_id: planId, cooperativa: cooperativa || null,
        });
        created++;
      }
    }

    if (syncLog) await updateSyncLog(supabase, syncLog.id, "success", records.length, created, updated, null);
    return { records_found: records.length, records_created: created, records_updated: updated };
  } catch (err: any) {
    if (syncLog) await updateSyncLog(supabase, syncLog.id, "error", 0, 0, 0, err.message);
    return { error: err.message };
  }
}

// Smart extraction of records array from any response structure
function extractRecords(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (typeof data !== "object" || data === null) return [];
  
  // Try common keys
  const commonKeys = ["data", "results", "beneficiarios", "registros", "items", "lista", "produtos", "content", "records"];
  for (const key of commonKeys) {
    if (Array.isArray(data[key])) return data[key];
  }
  
  // Try any key that contains an array
  for (const key of Object.keys(data)) {
    if (Array.isArray(data[key]) && data[key].length > 0 && typeof data[key][0] === "object") {
      console.log(`extractRecords: found array in key "${key}" with ${data[key].length} items`);
      return data[key];
    }
  }
  
  // Handle Hinova-style response: {"0": {record}, "1": {record}, "quantidade_veiculos": 1}
  // Filter numeric keys whose values are objects
  const keys = Object.keys(data);
  const numericObjectKeys = keys.filter(k => /^\d+$/.test(k) && typeof data[k] === "object" && data[k] !== null && !Array.isArray(data[k]));
  if (numericObjectKeys.length > 0) {
    console.log(`extractRecords: found ${numericObjectKeys.length} records with numeric keys (Hinova-style)`);
    return numericObjectKeys.map(k => data[k]);
  }
  
  // If response is a single object with typical record fields, wrap it
  if (data.placa || data.nome || data.name || data.plate || data.nome_associado) {
    return [data];
  }
  
  return [];
}

function extractSampleFields(data: any): any {
  const records = extractRecords(data);
  if (records.length === 0) return { keys: [], sample: null, total_records: 0 };
  const sample = records[0];
  return { keys: Object.keys(sample), sample, total_records: records.length };
}

function extractUniqueFields(data: any): any {
  const records = extractRecords(data);
  if (records.length === 0) return { plans: [], cooperativas: [], sample_keys: [] };
  
  // Log sample record keys for debugging
  const sampleKeys = Object.keys(records[0]);
  console.log("extractUniqueFields sample keys:", sampleKeys);
  console.log("extractUniqueFields sample values:", JSON.stringify(records[0]).substring(0, 1000));
  
  const plans = new Set<string>();
  const cooperativas = new Set<string>();
  for (const r of records) {
    // Try many possible field names for plan
    const plan = r.descricao_produto || r.produto || r.plano || r.plan || r.plan_name || r.nome_produto || "";
    // Try many possible field names for cooperativa - Hinova uses nome_cooperativa
    const coop = r.nome_cooperativa || r.descricao_cooperativa || r.cooperativa || r.coop || r.cooperative || r.unidade || "";
    if (plan) plans.add(plan);
    if (coop) cooperativas.add(coop);
  }
  return { plans: [...plans].sort(), cooperativas: [...cooperativas].sort(), sample_keys: sampleKeys };
}

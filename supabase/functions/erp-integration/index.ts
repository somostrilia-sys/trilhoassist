import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Auto-standardize cooperativa names from ERP
// "FILIAL SANTO ANDRÉ" → "Santo André", "OBJETIVO CAPÃO REDONDO" → "Capão Redondo"
function autoStandardizeCoop(raw: string): string {
  if (!raw) return raw;
  let name = raw.trim();
  // Remove common prefixes (case-insensitive)
  name = name.replace(/^(FILIAL|OBJETIVO AUTO E TRUCK|OBJETIVO)\s+/i, "").trim();
  // If still all uppercase, convert to title case
  if (name === name.toUpperCase() && name.length > 2) {
    name = name
      .toLowerCase()
      .split(/\s+/)
      .map(w => {
        // Keep prepositions lowercase
        if (["de", "do", "da", "dos", "das", "e", "em"].includes(w)) return w;
        return w.charAt(0).toUpperCase() + w.slice(1);
      })
      .join(" ");
  }
  // Handle "SãO" → "São" (common OCR/encoding issue)
  name = name.replace(/ã([A-Z])/g, (_, c) => `ã${c.toLowerCase()}`);
  return name;
}

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

    // ─── DIRECT API TEST (for debugging) ───
    if (action === "direct_test") {
      const { endpoint, api_key } = body;
      if (!endpoint || !api_key) {
        return jsonResponse({ error: "endpoint and api_key required" }, 400);
      }

      const results: any[] = [];

      // Test 1: header "token: <key>"
      try {
        const r1 = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json", "token": api_key },
          body: JSON.stringify({}),
        });
        const t1 = await r1.text();
        results.push({ test: "token_header", status: r1.status, body: t1.substring(0, 300) });
      } catch (e: any) { results.push({ test: "token_header", error: e.message }); }

      // Test 2: header "Authorization: <key>" (raw)
      try {
        const r2 = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json", "Authorization": api_key },
          body: JSON.stringify({}),
        });
        const t2 = await r2.text();
        results.push({ test: "auth_raw", status: r2.status, body: t2.substring(0, 300) });
      } catch (e: any) { results.push({ test: "auth_raw", error: e.message }); }

      // Test 3: header "Authorization: Bearer <key>"
      try {
        const r3 = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json", "Authorization": `Bearer ${api_key}` },
          body: JSON.stringify({}),
        });
        const t3 = await r3.text();
        results.push({ test: "auth_bearer", status: r3.status, body: t3.substring(0, 300) });
      } catch (e: any) { results.push({ test: "auth_bearer", error: e.message }); }

      // Test 4: header "Authorization: token <key>"
      try {
        const r4 = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json", "Authorization": `token ${api_key}` },
          body: JSON.stringify({}),
        });
        const t4 = await r4.text();
        results.push({ test: "auth_token_prefix", status: r4.status, body: t4.substring(0, 300) });
      } catch (e: any) { results.push({ test: "auth_token_prefix", error: e.message }); }

      return jsonResponse({ results });
    }

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
      .select("id, name, api_endpoint, api_key, api_auth_header")
      .eq("id", client_id)
      .single();

    if (clientError || !client) {
      return jsonResponse({ error: "Cliente não encontrado" }, 404);
    }

    if (!client.api_endpoint || !client.api_key) {
      return jsonResponse({ error: "API endpoint ou chave não configurados para este cliente" }, 400);
    }

    // Build auth headers based on client config
    const buildApiHeaders = (apiKey: string, authHeaderType?: string) => {
      const h: Record<string, string> = { "Content-Type": "application/json", "Accept": "application/json" };
      const headerType = authHeaderType || "bearer";
      if (headerType === "token") {
        h["token"] = apiKey;
      } else if (headerType === "raw") {
        h["Authorization"] = apiKey;
      } else if (headerType === "token_auth") {
        h["Authorization"] = `token ${apiKey}`;
      } else {
        h["Authorization"] = `Bearer ${apiKey}`;
      }
      return h;
    };

    const apiHeaders = buildApiHeaders(client.api_key, client.api_auth_header);
    console.log("API headers keys:", Object.keys(apiHeaders), "authHeader config:", client.api_auth_header);

    // ─── ACTION: TEST CONNECTION ───
    if (action === "test") {
      try {
        let response = await fetch(client.api_endpoint, {
          method: "POST",
          headers: apiHeaders,
          body: JSON.stringify({}),
        });

        if (response.status === 405 || response.status === 404 || response.status === 406) {
          response = await fetch(client.api_endpoint, {
            method: "GET",
            headers: apiHeaders,
          });
        }

        if (!response.ok) {
          const text = await response.text();
          console.error("ERP error response:", response.status, text.substring(0, 500));
          return jsonResponse({
            success: false,
            status: response.status,
            message: `ERP retornou erro ${response.status}: ${text.substring(0, 200)}`,
          });
        }

        const data = await response.json();
        const rawKeys = typeof data === "object" && data !== null ? Object.keys(data) : [];
        console.log("ERP raw response keys:", rawKeys);

        const records = extractRecords(data);
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

    // ─── ACTION: AUTO MAP PRODUCTS ───
    if (action === "auto_map_products") {
      const serviceSupabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      try {
        // Fetch ERP data
        let response = await fetch(client.api_endpoint, {
          method: "POST",
          headers: apiHeaders,
          body: JSON.stringify({}),
        });
        if (response.status === 405 || response.status === 404) {
          response = await fetch(client.api_endpoint, { method: "GET", headers: apiHeaders });
        }
        if (!response.ok) {
          const text = await response.text();
          return jsonResponse({ error: `ERP erro ${response.status}: ${text.substring(0, 200)}` }, 500);
        }

        const erpData = await response.json();
        const records = extractRecords(erpData);

        // Extract unique products with code + description
        const productMap = new Map<string, string>(); // code -> description
        for (const r of records) {
          const code = r.codigo_produto || r.cod_produto || r.product_code || r.codigo || "";
          const desc = r.descricao_produto || r.produto || r.plano || r.plan || r.plan_name || r.nome_produto || "";
          if (code && desc) {
            productMap.set(String(code), desc);
          }
        }

        if (productMap.size === 0) {
          return jsonResponse({ error: "Nenhum código de produto encontrado nos dados do ERP. Campos esperados: codigo_produto, cod_produto, product_code" }, 400);
        }

        // Get existing plans for this client
        const { data: existingPlans } = await serviceSupabase
          .from("plans")
          .select("id, name, erp_code")
          .eq("client_id", client_id);

        const existingByCode = new Map((existingPlans || []).filter((p: any) => p.erp_code).map((p: any) => [p.erp_code, p]));

        // Get existing mappings
        const { data: existingMappings } = await serviceSupabase
          .from("erp_field_mappings")
          .select("*")
          .eq("client_id", client_id)
          .eq("field_type", "plan");

        const existingMappingByErp = new Map((existingMappings || []).map((m: any) => [m.erp_value, m]));

        let plansCreated = 0;
        let mappingsCreated = 0;
        let skipped = 0;

        for (const [code, description] of productMap) {
          let plan = existingByCode.get(code);

          // Create plan if it doesn't exist with this code
          if (!plan) {
            const { data: newPlan, error: planErr } = await serviceSupabase
              .from("plans")
              .insert({
                client_id,
                name: description,
                erp_code: code,
                active: true,
              })
              .select("id, name, erp_code")
              .single();

            if (planErr) {
              console.error(`Error creating plan for code ${code}:`, planErr.message);
              continue;
            }
            plan = newPlan;
            plansCreated++;
          }

          // Create/update mapping description -> plan_id
          if (!existingMappingByErp.has(description)) {
            await serviceSupabase.from("erp_field_mappings").insert({
              client_id,
              tenant_id,
              field_type: "plan",
              erp_value: description,
              trilho_value: plan.name,
              trilho_id: plan.id,
            });
            mappingsCreated++;
          } else {
            // Update existing mapping to point to correct plan
            const existing = existingMappingByErp.get(description);
            if (existing.trilho_id !== plan.id) {
              await serviceSupabase.from("erp_field_mappings")
                .update({ trilho_id: plan.id, trilho_value: plan.name })
                .eq("id", existing.id);
              mappingsCreated++;
            } else {
              skipped++;
            }
          }
        }

        return jsonResponse({
          success: true,
          products_found: productMap.size,
          plans_created: plansCreated,
          mappings_created: mappingsCreated,
          skipped,
        });
      } catch (err: any) {
        return jsonResponse({ error: `Erro: ${err.message}` }, 500);
      }
    }

    // ─── ACTION: IMPORT BENEFICIARIES ───
    if (action === "import") {
      // Use service role client for sync log operations (bypasses RLS)
      const serviceSupabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      // Create sync log
      const { data: syncLog, error: logError } = await serviceSupabase
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

        if (response.status === 405 || response.status === 404 || response.status === 406) {
          response = await fetch(client.api_endpoint, {
            method: "GET",
            headers: apiHeaders,
          });
        }

        if (!response.ok) {
          const text = await response.text();
          await updateSyncLog(serviceSupabase, syncLog.id, "error", 0, 0, 0, `ERP erro ${response.status}: ${text.substring(0, 200)}`);
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
          await updateSyncLog(serviceSupabase, syncLog.id, "error", 0, 0, 0, `Nenhum registro encontrado. Estrutura: ${debugInfo}`);
          return jsonResponse({ error: "Nenhum registro encontrado na resposta do ERP", debug: debugInfo }, 400);
        }

        // Get field mappings for this client
        const { data: mappings } = await supabase
          .from("erp_field_mappings")
          .select("*")
          .eq("client_id", client_id);

        const planMap = new Map((mappings || []).filter((m: any) => m.field_type === "plan").map((m: any) => [m.erp_value, m.trilho_id]));
        const coopMap = new Map((mappings || []).filter((m: any) => m.field_type === "cooperativa").map((m: any) => [m.erp_value, m.trilho_value]));
        // situacao mapping: erp_value = codigo_situacao, trilho_value = "active" or "inactive"
        const situacaoMap = new Map((mappings || []).filter((m: any) => m.field_type === "situacao").map((m: any) => [m.erp_value, m.trilho_value]));

        // Also build a plan lookup by erp_code for direct code matching
        const { data: allPlans } = await serviceSupabase
          .from("plans")
          .select("id, erp_code")
          .eq("client_id", client_id);
        const planByCode = new Map((allPlans || []).filter((p: any) => p.erp_code).map((p: any) => [p.erp_code, p.id]));

        // Fetch ALL existing beneficiaries (paginate to bypass 1000 row limit)
        let existingBeneficiaries: any[] = [];
        let from = 0;
        const PAGE_SIZE = 1000;
        while (true) {
          const { data: page } = await serviceSupabase
            .from("beneficiaries")
            .select("id, vehicle_plate")
            .eq("client_id", client_id)
            .range(from, from + PAGE_SIZE - 1);
          if (!page || page.length === 0) break;
          existingBeneficiaries = existingBeneficiaries.concat(page);
          if (page.length < PAGE_SIZE) break;
          from += PAGE_SIZE;
        }
        console.log("Existing beneficiaries loaded:", existingBeneficiaries.length);

        const existingByPlate = new Map(
          (existingBeneficiaries || [])
            .filter((b: any) => b.vehicle_plate)
            .map((b: any) => [b.vehicle_plate, b.id])
        );

        const toInsert: any[] = [];
        const toUpdate: any[] = [];
        const seenPlates = new Set<string>(); // Deduplicate plates from ERP

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

          if (!name && !plate) continue;
          // Skip duplicate plates in the same ERP response
          if (plate && seenPlates.has(plate)) continue;
          if (plate) seenPlates.add(plate);

          const erpCode = record.codigo_produto || record.cod_produto || record.product_code || record.codigo || "";
          const planId = planMap.get(erpPlan) || (erpCode ? planByCode.get(String(erpCode)) : null) || null;
          const cooperativa = coopMap.get(erpCoop) || autoStandardizeCoop(erpCoop);
          const parsedYear = vehicleYear ? parseInt(vehicleYear) : null;

          // Resolve active status: check manual mapping first, then auto-detect from description
          const erpSituacao = record.codigo_situacao || record.codigo_situacao_associado || "";
          const erpSituacaoDesc = record.descricao_situacao || record.descricao_situacao_associado || "";
          let isActive = true; // default active
          if (erpSituacao && situacaoMap.has(String(erpSituacao))) {
            isActive = situacaoMap.get(String(erpSituacao)) === "active";
          } else if (erpSituacaoDesc) {
            // Auto-detect: only descriptions containing "ativo" (case insensitive) are active
            isActive = /ativo/i.test(erpSituacaoDesc);
          }

          const existingId = existingByPlate.get(plate);
          if (existingId) {
            toUpdate.push({
              id: existingId,
              client_id,
              name,
              phone: phone || null,
              cpf: cpf || null,
              vehicle_model: vehicleModel || null,
              vehicle_year: parsedYear,
              vehicle_chassis: vehicleChassis || null,
              plan_id: planId,
              cooperativa: cooperativa || null,
              active: isActive,
            });
          } else {
            toInsert.push({
              client_id,
              name,
              vehicle_plate: plate,
              phone: phone || null,
              cpf: cpf || null,
              vehicle_model: vehicleModel || null,
              vehicle_year: parsedYear,
              vehicle_chassis: vehicleChassis || null,
              plan_id: planId,
              cooperativa: cooperativa || null,
              active: isActive,
            });
          }
        }

        console.log(`To insert: ${toInsert.length}, to update: ${toUpdate.length}`);

        let created = 0;
        let updated = 0;

        // Batch insert in chunks of 500
        const BATCH_SIZE = 500;
        for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
          const chunk = toInsert.slice(i, i + BATCH_SIZE);
          const { error: insertErr } = await serviceSupabase.from("beneficiaries").insert(chunk);
          if (!insertErr) created += chunk.length;
          else console.error(`Batch insert error (chunk ${i}):`, insertErr.message);
        }

        // Batch update in chunks of 500
        for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
          const chunk = toUpdate.slice(i, i + BATCH_SIZE);
          const { error: upsertErr } = await serviceSupabase
            .from("beneficiaries")
            .upsert(chunk, { onConflict: "id" });
          if (!upsertErr) updated += chunk.length;
          else console.error(`Batch upsert error (chunk ${i}):`, upsertErr.message);
        }

        console.log(`Import complete: ${created} created, ${updated} updated`);

        await updateSyncLog(serviceSupabase, syncLog.id, "success", records.length, created, updated, null);

        return jsonResponse({
          success: true,
          records_found: records.length,
          records_created: created,
          records_updated: updated,
        });
      } catch (err: any) {
        await updateSyncLog(serviceSupabase, syncLog.id, "error", 0, 0, 0, err.message);
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
    } else if (authHeader === "token_auth") {
      headers["Authorization"] = `token ${client.api_key}`;
    } else {
      headers[authHeader] = client.api_key;
    }
    let response = await fetch(client.api_endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });

    if (response.status === 405 || response.status === 404 || response.status === 406) {
      response = await fetch(client.api_endpoint, { method: "GET", headers });
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

    // Get all mappings (plan, cooperativa, situacao)
    const { data: mappings } = await supabase.from("erp_field_mappings").select("*").eq("client_id", client.id);
    const planMap = new Map((mappings || []).filter((m: any) => m.field_type === "plan").map((m: any) => [m.erp_value, m.trilho_id]));
    const coopMap = new Map((mappings || []).filter((m: any) => m.field_type === "cooperativa").map((m: any) => [m.erp_value, m.trilho_value]));
    const situacaoMap = new Map((mappings || []).filter((m: any) => m.field_type === "situacao").map((m: any) => [m.erp_value, m.trilho_value]));

    // Plan lookup by erp_code
    const { data: allPlans } = await supabase.from("plans").select("id, erp_code").eq("client_id", client.id);
    const planByCode = new Map((allPlans || []).filter((p: any) => p.erp_code).map((p: any) => [p.erp_code, p.id]));

    // Fetch ALL existing beneficiaries (paginate)
    let existingBeneficiaries: any[] = [];
    let from = 0;
    const PAGE_SIZE = 1000;
    while (true) {
      const { data: page } = await supabase
        .from("beneficiaries").select("id, vehicle_plate").eq("client_id", client.id).range(from, from + PAGE_SIZE - 1);
      if (!page || page.length === 0) break;
      existingBeneficiaries = existingBeneficiaries.concat(page);
      if (page.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    const existingByPlate = new Map(
      existingBeneficiaries.filter((b: any) => b.vehicle_plate).map((b: any) => [b.vehicle_plate, b.id])
    );

    const toInsert: any[] = [];
    const toUpdate: any[] = [];
    const seenPlates = new Set<string>();

    for (const record of records) {
      const plate = record.placa || record.vehicle_plate || record.plate || "";
      const name = record.nome_associado || record.nome || record.name || record.beneficiario || "";
      if (!name && !plate) continue;
      if (plate && seenPlates.has(plate)) continue;
      if (plate) seenPlates.add(plate);

      const phone = record.telefone || record.phone || record.celular || record.telefone_residencial || record.telefone_celular || "";
      const cpf = record.cpf || record.documento || "";
      const vehicleModel = record.modelo || record.vehicle_model || record.veiculo || record.descricao_modelo || "";
      const vehicleYear = record.ano_modelo || record.ano || record.vehicle_year || record.year || null;
      const vehicleChassis = record.chassi || record.chassis || "";
      const erpPlan = record.plano || record.plan || record.plan_name || record.descricao_produto || "";
      const erpCoop = record.nome_cooperativa || record.cooperativa || record.coop || record.cooperative || record.descricao_cooperativa || "";
      const erpCode = record.codigo_produto || record.cod_produto || record.product_code || record.codigo || "";

      const planId = planMap.get(erpPlan) || (erpCode ? planByCode.get(String(erpCode)) : null) || null;
      const cooperativa = coopMap.get(erpCoop) || autoStandardizeCoop(erpCoop);
      const parsedYear = vehicleYear ? parseInt(vehicleYear) : null;

      const erpSituacao = record.codigo_situacao || record.codigo_situacao_associado || "";
      const erpSituacaoDesc = record.descricao_situacao || record.descricao_situacao_associado || "";
      let isActive = true;
      if (erpSituacao && situacaoMap.has(String(erpSituacao))) {
        isActive = situacaoMap.get(String(erpSituacao)) === "active";
      } else if (erpSituacaoDesc) {
        isActive = /ativo/i.test(erpSituacaoDesc);
      }

      const existingId = existingByPlate.get(plate);
      if (existingId) {
        toUpdate.push({
          id: existingId, client_id: client.id, name, phone: phone || null, cpf: cpf || null,
          vehicle_model: vehicleModel || null, vehicle_year: parsedYear,
          vehicle_chassis: vehicleChassis || null, plan_id: planId, cooperativa: cooperativa || null, active: isActive,
        });
      } else {
        toInsert.push({
          client_id: client.id, name, vehicle_plate: plate, phone: phone || null, cpf: cpf || null,
          vehicle_model: vehicleModel || null, vehicle_year: parsedYear,
          vehicle_chassis: vehicleChassis || null, plan_id: planId, cooperativa: cooperativa || null, active: isActive,
        });
      }
    }

    console.log(`Auto sync - To insert: ${toInsert.length}, to update: ${toUpdate.length}`);

    let created = 0, updated = 0;
    const BATCH_SIZE = 500;

    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const chunk = toInsert.slice(i, i + BATCH_SIZE);
      const { error: insertErr } = await supabase.from("beneficiaries").insert(chunk);
      if (!insertErr) created += chunk.length;
      else console.error(`Auto sync insert error (chunk ${i}):`, insertErr.message);
    }

    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
      const chunk = toUpdate.slice(i, i + BATCH_SIZE);
      const { error: upsertErr } = await supabase.from("beneficiaries").upsert(chunk, { onConflict: "id" });
      if (!upsertErr) updated += chunk.length;
      else console.error(`Auto sync upsert error (chunk ${i}):`, upsertErr.message);
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
  if (records.length === 0) return { plans: [], cooperativas: [], situacoes: [], sample_keys: [] };
  
  const sampleKeys = Object.keys(records[0]);
  console.log("extractUniqueFields sample keys:", sampleKeys);
  console.log("extractUniqueFields sample values:", JSON.stringify(records[0]).substring(0, 1000));
  
  const plans = new Set<string>();
  const cooperativas = new Set<string>();
  const situacoes = new Map<string, string>(); // code -> description
  for (const r of records) {
    const plan = r.descricao_produto || r.produto || r.plano || r.plan || r.plan_name || r.nome_produto || "";
    const coop = r.nome_cooperativa || r.descricao_cooperativa || r.cooperativa || r.coop || r.cooperative || r.unidade || "";
    const sitCodigo = r.codigo_situacao || r.codigo_situacao_associado || "";
    const sitDesc = r.descricao_situacao || r.descricao_situacao_associado || "";
    if (plan) plans.add(plan);
    if (coop) cooperativas.add(coop);
    if (sitCodigo && sitDesc) situacoes.set(String(sitCodigo), sitDesc);
  }
  return {
    plans: [...plans].sort(),
    cooperativas: [...cooperativas].sort(),
    situacoes: [...situacoes.entries()].map(([code, desc]) => ({ code, description: desc })).sort((a, b) => a.code.localeCompare(b.code)),
    sample_keys: sampleKeys,
  };
}

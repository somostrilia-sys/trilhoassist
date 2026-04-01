import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Fetch all records from a GIA table with pagination (1000 per page)
async function fetchAllFromGia(giaClient: any, table: string, selectFields: string): Promise<any[]> {
  const allRecords: any[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await giaClient
      .from(table)
      .select(selectFields)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Erro ao ler ${table} do GIA: ${error.message}`);
    if (!data || data.length === 0) break;

    allRecords.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return allRecords;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = new Date().toISOString();

  try {
    const body = await req.json();
    const { client_id, tenant_id } = body;

    if (!client_id || !tenant_id) {
      return jsonResponse({ error: "client_id e tenant_id são obrigatórios" }, 400);
    }

    // Connect to GIA's external Supabase
    const giaUrl = Deno.env.get("GIA_SUPABASE_URL");
    const giaKey = Deno.env.get("GIA_SERVICE_ROLE_KEY");

    if (!giaUrl || !giaKey) {
      return jsonResponse({ error: "Credenciais do GIA não configuradas no servidor" }, 500);
    }

    const giaClient = createClient(giaUrl, giaKey);

    // Connect to local Supabase with service_role (for upsert + logs bypassing RLS)
    const localClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Create sync log entry
    const { data: logEntry } = await localClient.from("erp_sync_logs").insert({
      client_id,
      tenant_id,
      sync_type: "gia",
      status: "running",
      started_at: startedAt,
    }).select("id").single();

    const logId = logEntry?.id;

    try {
      // Fetch associados and veiculos from GIA
      console.log("GIA: fetching associados...");
      const associados = await fetchAllFromGia(
        giaClient,
        "associados",
        "id, nome, cpf, telefone, status, plano_id"
      );
      console.log(`GIA: ${associados.length} associados found`);

      console.log("GIA: fetching veiculos...");
      const veiculos = await fetchAllFromGia(
        giaClient,
        "veiculos",
        "associado_id, marca, modelo, placa, ano_modelo, chassi, cor"
      );
      console.log(`GIA: ${veiculos.length} veiculos found`);

      // Build a map of veiculos by associado_id
      const veiculosByAssociado = new Map<string, any[]>();
      for (const v of veiculos) {
        if (!v.associado_id) continue;
        const list = veiculosByAssociado.get(v.associado_id) || [];
        list.push(v);
        veiculosByAssociado.set(v.associado_id, list);
      }

      // Build beneficiary records
      const withPlate: any[] = [];
      const withoutPlate: any[] = [];

      for (const assoc of associados) {
        const assocVeiculos = veiculosByAssociado.get(assoc.id) || [];
        const isActive = assoc.status?.toLowerCase() === "ativo";
        const baseName = assoc.nome || "";
        const baseCpf = assoc.cpf || "";
        const basePhone = assoc.telefone || "";

        if (assocVeiculos.length === 0) {
          // Associado without vehicle
          const record: any = {
            client_id,
            name: baseName,
            cpf: baseCpf || null,
            phone: basePhone || null,
            active: isActive,
            vehicle_plate: null,
            vehicle_model: null,
            vehicle_year: null,
            vehicle_chassis: null,
            vehicle_color: null,
          };

          if (baseCpf) {
            withoutPlate.push(record);
          }
          // Skip records with no plate AND no CPF (can't upsert)
        } else {
          // One record per vehicle
          for (const v of assocVeiculos) {
            const marca = v.marca || "";
            const modelo = v.modelo || "";
            const vehicleModel = [marca, modelo].filter(Boolean).join(" ").trim();
            const plate = v.placa?.toUpperCase()?.trim() || "";

            const record: any = {
              client_id,
              name: baseName,
              cpf: baseCpf || null,
              phone: basePhone || null,
              active: isActive,
              vehicle_plate: plate || null,
              vehicle_model: vehicleModel || null,
              vehicle_year: v.ano_modelo ? parseInt(v.ano_modelo) : null,
              vehicle_chassis: v.chassi || null,
              vehicle_color: v.cor || null,
            };

            if (plate) {
              withPlate.push(record);
            } else if (baseCpf) {
              withoutPlate.push(record);
            }
          }
        }
      }

      console.log(`GIA: ${withPlate.length} records with plate, ${withoutPlate.length} records without plate (CPF only)`);

      let created = 0;
      let updated = 0;

      // Batch upsert records with plate (conflict on client_id + vehicle_plate)
      if (withPlate.length > 0) {
        const batchSize = 500;
        for (let i = 0; i < withPlate.length; i += batchSize) {
          const batch = withPlate.slice(i, i + batchSize);
          const { data: upsertData, error: upsertError } = await localClient
            .from("beneficiaries")
            .upsert(batch, {
              onConflict: "client_id,vehicle_plate",
              ignoreDuplicates: false,
            })
            .select("id");

          if (upsertError) {
            console.error(`GIA upsert (plate) batch error:`, upsertError.message);
            throw new Error(`Upsert (placa) falhou: ${upsertError.message}`);
          }

          const count = upsertData?.length || 0;
          created += count;
        }
      }

      // Batch upsert records without plate (conflict on cpf + client_id)
      if (withoutPlate.length > 0) {
        const batchSize = 500;
        for (let i = 0; i < withoutPlate.length; i += batchSize) {
          const batch = withoutPlate.slice(i, i + batchSize);
          const { data: upsertData, error: upsertError } = await localClient
            .from("beneficiaries")
            .upsert(batch, {
              onConflict: "cpf,client_id",
              ignoreDuplicates: false,
            })
            .select("id");

          if (upsertError) {
            console.error(`GIA upsert (cpf) batch error:`, upsertError.message);
            throw new Error(`Upsert (CPF) falhou: ${upsertError.message}`);
          }

          const count = upsertData?.length || 0;
          updated += count;
        }
      }

      const totalProcessed = created + updated;

      // Update sync log
      if (logId) {
        await localClient.from("erp_sync_logs").update({
          status: "completed",
          completed_at: new Date().toISOString(),
          records_found: associados.length,
          records_created: withPlate.length,
          records_updated: withoutPlate.length,
        }).eq("id", logId);
      }

      console.log(`GIA sync completed: ${totalProcessed} records processed`);

      return jsonResponse({
        success: true,
        associados_found: associados.length,
        veiculos_found: veiculos.length,
        records_with_plate: withPlate.length,
        records_cpf_only: withoutPlate.length,
        total_processed: totalProcessed,
      });

    } catch (syncError: any) {
      // Update sync log with error
      if (logId) {
        await localClient.from("erp_sync_logs").update({
          status: "error",
          completed_at: new Date().toISOString(),
          error_message: syncError.message?.substring(0, 500),
        }).eq("id", logId);
      }
      throw syncError;
    }

  } catch (err: any) {
    console.error("GIA sync error:", err.message);
    return jsonResponse({ error: err.message }, 500);
  }
});

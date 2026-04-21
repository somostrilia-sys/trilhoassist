// Edge Function: financeiro-api-externa
// API REST para integração com sistema financeiro externo
// Auth: Bearer Token (FINANCEIRO_API_TOKEN)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function unauthorized() {
  return json({ error: "Unauthorized", message: "Bearer token inválido ou ausente" }, 401);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth
  const expected = Deno.env.get("FINANCEIRO_API_TOKEN");
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!expected || token !== expected) return unauthorized();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const url = new URL(req.url);
  // Path após /financeiro-api-externa
  const path = url.pathname.replace(/^.*\/financeiro-api-externa/, "") || "/";
  const params = url.searchParams;

  try {
    // ───────────────────────────────────────────────
    // GET /atendimentos?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&cooperativa=...
    // Sincronismo diário/incremental de atendimentos concluídos
    // ───────────────────────────────────────────────
    if (req.method === "GET" && (path === "/atendimentos" || path === "/atendimentos/")) {
      const dateFrom = params.get("date_from") ?? new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const dateTo = params.get("date_to") ?? new Date().toISOString().slice(0, 10);
      const cooperativaFilter = params.get("cooperativa");
      const limit = Math.min(Number(params.get("limit") ?? 1000), 5000);

      const { data, error } = await supabase
        .from("service_requests")
        .select(`
          id, protocol, status, financial_status, service_type, event_type,
          requester_name, requester_phone,
          vehicle_plate, vehicle_model, vehicle_year, vehicle_category,
          origin_address, destination_address, estimated_km,
          provider_cost, charged_amount,
          completed_at, created_at, updated_at,
          client_id, beneficiary_id,
          beneficiaries(id, name, cpf, cooperativa),
          clients(id, name, cnpj),
          dispatches(id, provider_id, final_amount, quoted_amount, status, completed_at,
            providers(id, name, cnpj))
        `)
        .eq("status", "completed")
        .gte("completed_at", dateFrom)
        .lte("completed_at", dateTo + "T23:59:59")
        .order("completed_at", { ascending: false })
        .limit(limit);

      if (error) return json({ error: error.message }, 400);

      let rows = data ?? [];
      if (cooperativaFilter) {
        rows = rows.filter((r: any) => r.beneficiaries?.cooperativa === cooperativaFilter);
      }

      const atendimentos = rows.map((r: any) => {
        const disp = (r.dispatches ?? [])[0] ?? {};
        return {
          id: r.id,
          protocolo: r.protocol,
          status: r.status,
          status_financeiro: r.financial_status,
          tipo_servico: r.service_type,
          tipo_evento: r.event_type,
          data_conclusao: r.completed_at,
          data_criacao: r.created_at,
          beneficiario: r.beneficiaries
            ? { id: r.beneficiaries.id, nome: r.beneficiaries.name, cpf: r.beneficiaries.cpf, cooperativa: r.beneficiaries.cooperativa }
            : null,
          cliente: r.clients ? { id: r.clients.id, nome: r.clients.name, cnpj: r.clients.cnpj } : null,
          solicitante: { nome: r.requester_name, telefone: r.requester_phone },
          veiculo: { placa: r.vehicle_plate, modelo: r.vehicle_model, ano: r.vehicle_year, categoria: r.vehicle_category },
          origem: r.origin_address,
          destino: r.destination_address,
          km_estimado: r.estimated_km,
          valor_cobrado: Number(r.charged_amount ?? 0),
          custo_prestador: Number(disp.final_amount ?? disp.quoted_amount ?? r.provider_cost ?? 0),
          prestador: disp.providers ? { id: disp.providers.id, nome: disp.providers.name, cnpj: disp.providers.cnpj } : null,
        };
      });

      return json({
        periodo: { inicio: dateFrom, fim: dateTo },
        total: atendimentos.length,
        atendimentos,
      });
    }

    // ───────────────────────────────────────────────
    // GET /fechamento/cooperativa?mes=YYYY-MM
    // Fechamento agrupado por cooperativa
    // ───────────────────────────────────────────────
    if (req.method === "GET" && path.startsWith("/fechamento/cooperativa")) {
      const mes = params.get("mes") ?? new Date().toISOString().slice(0, 7);
      const [year, month] = mes.split("-");
      const start = `${year}-${month}-01`;
      const end = Number(month) === 12 ? `${Number(year) + 1}-01-01` : `${year}-${String(Number(month) + 1).padStart(2, "0")}-01`;

      const { data, error } = await supabase
        .from("service_requests")
        .select(`
          id, protocol, charged_amount, provider_cost, completed_at, service_type,
          beneficiaries!inner(cooperativa, name, cpf),
          clients(id, name),
          dispatches(final_amount, quoted_amount)
        `)
        .eq("status", "completed")
        .gte("completed_at", start)
        .lt("completed_at", end);

      if (error) return json({ error: error.message }, 400);

      const grupos = new Map<string, any>();
      (data ?? []).forEach((r: any) => {
        const coop = r.beneficiaries?.cooperativa ?? "SEM_COOPERATIVA";
        const disp = (r.dispatches ?? [])[0] ?? {};
        const custo = Number(disp.final_amount ?? disp.quoted_amount ?? r.provider_cost ?? 0);
        const cobrado = Number(r.charged_amount ?? 0);
        if (!grupos.has(coop)) {
          grupos.set(coop, {
            cooperativa: coop,
            total_atendimentos: 0,
            valor_bruto: 0,
            valor_custo: 0,
            valor_liquido: 0,
            atendimentos: [],
          });
        }
        const g = grupos.get(coop)!;
        g.total_atendimentos += 1;
        g.valor_bruto += cobrado;
        g.valor_custo += custo;
        g.valor_liquido = g.valor_bruto - g.valor_custo;
        g.atendimentos.push({
          id: r.id,
          protocolo: r.protocol,
          beneficiario: r.beneficiaries?.name,
          cpf: r.beneficiaries?.cpf,
          tipo_servico: r.service_type,
          data: r.completed_at,
          valor_cobrado: cobrado,
          custo_prestador: custo,
        });
      });

      return json({
        mes_referencia: mes,
        cooperativas: Array.from(grupos.values()),
      });
    }

    // ───────────────────────────────────────────────
    // GET /fechamento/geral?mes=YYYY-MM
    // Fechamento consolidado geral
    // ───────────────────────────────────────────────
    if (req.method === "GET" && path.startsWith("/fechamento/geral")) {
      const mes = params.get("mes") ?? new Date().toISOString().slice(0, 7);
      const [year, month] = mes.split("-");
      const start = `${year}-${month}-01`;
      const end = Number(month) === 12 ? `${Number(year) + 1}-01-01` : `${year}-${String(Number(month) + 1).padStart(2, "0")}-01`;

      const { data, error } = await supabase
        .from("service_requests")
        .select(`
          id, protocol, charged_amount, provider_cost, service_type, completed_at,
          beneficiaries(cooperativa),
          dispatches(final_amount, quoted_amount)
        `)
        .eq("status", "completed")
        .gte("completed_at", start)
        .lt("completed_at", end);

      if (error) return json({ error: error.message }, 400);

      let totalAtendimentos = 0;
      let valorBruto = 0;
      let valorCusto = 0;
      const porTipo: Record<string, number> = {};
      const cooperativas = new Set<string>();

      (data ?? []).forEach((r: any) => {
        const disp = (r.dispatches ?? [])[0] ?? {};
        const custo = Number(disp.final_amount ?? disp.quoted_amount ?? r.provider_cost ?? 0);
        const cobrado = Number(r.charged_amount ?? 0);
        totalAtendimentos += 1;
        valorBruto += cobrado;
        valorCusto += custo;
        porTipo[r.service_type] = (porTipo[r.service_type] ?? 0) + 1;
        if (r.beneficiaries?.cooperativa) cooperativas.add(r.beneficiaries.cooperativa);
      });

      return json({
        mes_referencia: mes,
        total_atendimentos: totalAtendimentos,
        total_cooperativas: cooperativas.size,
        valor_bruto: valorBruto,
        valor_custo: valorCusto,
        valor_liquido: valorBruto - valorCusto,
        margem_percentual: valorBruto > 0 ? Number(((valorBruto - valorCusto) / valorBruto * 100).toFixed(2)) : 0,
        atendimentos_por_tipo: porTipo,
        cooperativas: Array.from(cooperativas),
      });
    }

    // ───────────────────────────────────────────────
    // GET /fechamento/mensal/:ano-mes
    // Snapshots gravados (auditáveis) na tabela cooperativa_closings
    // ───────────────────────────────────────────────
    const matchMensal = path.match(/^\/fechamento\/mensal\/(\d{4})-(\d{2})\/?$/);
    if (req.method === "GET" && matchMensal) {
      const year = matchMensal[1];
      const month = matchMensal[2];
      const refDate = `${year}-${month}-01`;

      const { data, error } = await supabase
        .from("cooperativa_closings")
        .select("*")
        .eq("mes_referencia", refDate)
        .order("cooperativa", { ascending: true });

      if (error) return json({ error: error.message }, 400);
      return json({
        mes_referencia: `${year}-${month}`,
        total_snapshots: (data ?? []).length,
        snapshots: data ?? [],
      });
    }

    // ───────────────────────────────────────────────
    // POST /fechamento/gerar  { mes: "YYYY-MM" }  (manual ou via cron)
    // Gera snapshots para a tabela cooperativa_closings
    // ───────────────────────────────────────────────
    if (req.method === "POST" && path === "/fechamento/gerar") {
      let mes: string;
      try {
        const body = await req.json();
        mes = body.mes ?? new Date().toISOString().slice(0, 7);
      } catch {
        // Default: mês anterior (cron roda dia 1)
        const d = new Date();
        d.setDate(0); // último dia do mês anterior
        mes = d.toISOString().slice(0, 7);
      }
      const [year, month] = mes.split("-");
      const start = `${year}-${month}-01`;
      const end = Number(month) === 12 ? `${Number(year) + 1}-01-01` : `${year}-${String(Number(month) + 1).padStart(2, "0")}-01`;
      const refDate = start;

      const { data: rows } = await supabase
        .from("service_requests")
        .select(`
          id, protocol, charged_amount, provider_cost, service_type, completed_at, tenant_id, client_id,
          beneficiaries!inner(cooperativa, name, cpf),
          dispatches(final_amount, quoted_amount)
        `)
        .eq("status", "completed")
        .gte("completed_at", start)
        .lt("completed_at", end);

      const grupos = new Map<string, any>();
      (rows ?? []).forEach((r: any) => {
        const coop = r.beneficiaries?.cooperativa ?? "SEM_COOPERATIVA";
        const key = `${r.tenant_id}|${r.client_id ?? "null"}|${coop}`;
        const disp = (r.dispatches ?? [])[0] ?? {};
        const custo = Number(disp.final_amount ?? disp.quoted_amount ?? r.provider_cost ?? 0);
        const cobrado = Number(r.charged_amount ?? 0);
        if (!grupos.has(key)) {
          grupos.set(key, {
            tenant_id: r.tenant_id,
            client_id: r.client_id,
            cooperativa: coop,
            mes_referencia: refDate,
            total_atendimentos: 0,
            valor_bruto: 0,
            valor_liquido: 0,
            detalhes: [],
            gerado_automaticamente: true,
          });
        }
        const g = grupos.get(key)!;
        g.total_atendimentos += 1;
        g.valor_bruto += cobrado;
        g.valor_liquido += (cobrado - custo);
        g.detalhes.push({
          protocolo: r.protocol,
          beneficiario: r.beneficiaries?.name,
          cpf: r.beneficiaries?.cpf,
          tipo_servico: r.service_type,
          data: r.completed_at,
          valor_cobrado: cobrado,
          custo_prestador: custo,
        });
      });

      const snapshots = Array.from(grupos.values());
      let inserted = 0;
      for (const snap of snapshots) {
        if (!snap.tenant_id) continue;
        const { error } = await supabase
          .from("cooperativa_closings")
          .upsert(snap, { onConflict: "tenant_id,client_id,cooperativa,mes_referencia" });
        if (!error) inserted++;
      }

      return json({ mes_referencia: mes, snapshots_gerados: inserted, total_grupos: snapshots.length });
    }

    return json({
      error: "Endpoint não encontrado",
      endpoints_disponiveis: [
        "GET /atendimentos?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&cooperativa=...",
        "GET /fechamento/cooperativa?mes=YYYY-MM",
        "GET /fechamento/geral?mes=YYYY-MM",
        "GET /fechamento/mensal/{YYYY-MM}",
        "POST /fechamento/gerar  body: { mes: 'YYYY-MM' }",
      ],
    }, 404);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

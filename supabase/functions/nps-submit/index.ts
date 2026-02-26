import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ===== RATE LIMITER =====
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function isRateLimited(ip: string, max = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count++;
  return entry.count > max;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Rate limiting
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(clientIp)) {
    return new Response(JSON.stringify({ error: "Muitas requisições" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const adminSupabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // GET: validate token
    if (req.method === "GET") {
      const url = new URL(req.url);
      const token = url.searchParams.get("token");

      if (!token || typeof token !== "string" || token.length < 10 || token.length > 100) {
        return new Response(JSON.stringify({ valid: false, error: "Token inválido" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Only allow UUID-like tokens
      if (!/^[a-zA-Z0-9\-]+$/.test(token)) {
        return new Response(JSON.stringify({ valid: false, error: "Token inválido" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if already answered
      const { data: existing } = await adminSupabase
        .from("nps_responses")
        .select("id")
        .eq("beneficiary_token", token)
        .maybeSingle();

      if (existing) {
        const { data: sr } = await adminSupabase
          .from("service_requests")
          .select("tenant_id")
          .eq("beneficiary_token", token)
          .maybeSingle();

        let tenantName = "";
        if (sr?.tenant_id) {
          const { data: tenant } = await adminSupabase
            .from("tenants")
            .select("name")
            .eq("id", sr.tenant_id)
            .single();
          tenantName = tenant?.name || "";
        }

        return new Response(JSON.stringify({ valid: true, already_answered: true, tenant_name: tenantName }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find service request by beneficiary_token
      const { data: sr, error: srErr } = await adminSupabase
        .from("service_requests")
        .select("id, tenant_id, status, protocol")
        .eq("beneficiary_token", token)
        .maybeSingle();

      if (srErr || !sr) {
        return new Response(JSON.stringify({ valid: false, error: "Link inválido ou expirado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let tenantName = "";
      if (sr.tenant_id) {
        const { data: tenant } = await adminSupabase
          .from("tenants")
          .select("name")
          .eq("id", sr.tenant_id)
          .single();
        tenantName = tenant?.name || "";
      }

      return new Response(JSON.stringify({ valid: true, tenant_name: tenantName }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST: submit NPS
    if (req.method === "POST") {
      const { token, score, comment } = await req.json();

      if (!token || typeof token !== "string" || token.length < 10 || token.length > 100) {
        return new Response(JSON.stringify({ error: "Token inválido" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!/^[a-zA-Z0-9\-]+$/.test(token)) {
        return new Response(JSON.stringify({ error: "Token inválido" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (typeof score !== "number" || score < 0 || score > 10 || !Number.isInteger(score)) {
        return new Response(JSON.stringify({ error: "Nota inválida (0-10)" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const sanitizedComment = typeof comment === "string" ? comment.trim().slice(0, 1000) : null;

      // Find service request
      const { data: sr, error: srErr } = await adminSupabase
        .from("service_requests")
        .select("id, tenant_id")
        .eq("beneficiary_token", token)
        .maybeSingle();

      if (srErr || !sr) {
        return new Response(JSON.stringify({ error: "Link inválido ou expirado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check duplicate
      const { data: existing } = await adminSupabase
        .from("nps_responses")
        .select("id")
        .eq("beneficiary_token", token)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ error: "Avaliação já registrada para este atendimento" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Insert NPS response
      const { error: insertErr } = await adminSupabase
        .from("nps_responses")
        .insert({
          service_request_id: sr.id,
          tenant_id: sr.tenant_id,
          beneficiary_token: token,
          score,
          comment: sanitizedComment,
        });

      if (insertErr) {
        console.error("NPS insert error:", insertErr);
        return new Response(JSON.stringify({ error: "Erro ao salvar avaliação" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("NPS error:", err);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
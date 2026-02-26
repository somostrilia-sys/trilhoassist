import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ===== RATE LIMITER =====
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function isRateLimited(ip: string, max = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count++;
  return entry.count > max;
}

// ===== VALIDATORS =====
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 255;
}

function isValidCNPJ(cnpj: string): boolean {
  const clean = cnpj.replace(/\D/g, "");
  return clean.length === 14;
}

function isValidPhone(phone: string): boolean {
  const clean = phone.replace(/\D/g, "");
  return clean.length >= 10 && clean.length <= 15;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Rate limiting (10 registrations per minute per IP)
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(clientIp, 10)) {
    return new Response(
      JSON.stringify({ error: "Muitas tentativas. Aguarde um momento." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const {
      tenant_slug, email, password, name, cnpj, phone, services,
      street, address_number, neighborhood, city, state, zip_code,
      bank_name, bank_agency, bank_account, pix_key,
    } = body;

    // ===== INPUT VALIDATION =====
    if (!tenant_slug || !email || !password || !name || !phone || !cnpj) {
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios: email, senha, nome, CNPJ, telefone" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate tenant_slug format
    if (typeof tenant_slug !== "string" || tenant_slug.length > 100) {
      return new Response(
        JSON.stringify({ error: "Slug inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isValidEmail(email)) {
      return new Response(
        JSON.stringify({ error: "E-mail inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (typeof password !== "string" || password.length < 8 || password.length > 128) {
      return new Response(
        JSON.stringify({ error: "Senha deve ter entre 8 e 128 caracteres" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (typeof name !== "string" || name.trim().length < 2 || name.length > 200) {
      return new Response(
        JSON.stringify({ error: "Nome deve ter entre 2 e 200 caracteres" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isValidCNPJ(cnpj)) {
      return new Response(
        JSON.stringify({ error: "CNPJ inválido (14 dígitos)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isValidPhone(phone)) {
      return new Response(
        JSON.stringify({ error: "Telefone inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate optional string lengths
    const optionalStrings: [string, any, number][] = [
      ["Rua", street, 300], ["Número", address_number, 20], ["Bairro", neighborhood, 200],
      ["Cidade", city, 200], ["Estado", state, 2], ["CEP", zip_code, 10],
      ["Banco", bank_name, 100], ["Agência", bank_agency, 20], ["Conta", bank_account, 30],
      ["Chave PIX", pix_key, 100],
    ];
    for (const [label, val, max] of optionalStrings) {
      if (val && (typeof val !== "string" || val.length > max)) {
        return new Response(
          JSON.stringify({ error: `${label} inválido (máx ${max} caracteres)` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Find tenant by slug
    const { data: tenant, error: tenantError } = await adminClient
      .from("tenants")
      .select("id, name")
      .eq("slug", tenant_slug)
      .eq("active", true)
      .single();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ error: "Assistência não encontrada ou inativa" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if email already exists
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const emailExists = existingUsers?.users?.some((u) => u.email === email);
    if (emailExists) {
      return new Response(
        JSON.stringify({ error: "Este e-mail já está cadastrado no sistema" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if CNPJ already exists for this tenant
    const cleanCnpj = cnpj.replace(/\D/g, "");
    const { data: existingProvider } = await adminClient
      .from("providers")
      .select("id")
      .eq("cnpj", cleanCnpj)
      .eq("tenant_id", tenant.id)
      .maybeSingle();

    if (existingProvider) {
      return new Response(
        JSON.stringify({ error: "CNPJ já cadastrado para esta assistência" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create auth user
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name.trim() },
    });

    if (createError) {
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = newUser.user.id;

    // Create provider record
    const { error: providerError } = await adminClient.from("providers").insert({
      user_id: userId,
      tenant_id: tenant.id,
      name: name.trim(),
      cnpj: cleanCnpj,
      phone: phone.replace(/\D/g, ""),
      email,
      services: Array.isArray(services) ? services.slice(0, 20) : [],
      street: street?.trim() || null,
      address_number: address_number?.trim() || null,
      neighborhood: neighborhood?.trim() || null,
      city: city?.trim() || null,
      state: state?.trim()?.toUpperCase() || null,
      zip_code: zip_code?.replace(/\D/g, "") || null,
      bank_name: bank_name?.trim() || null,
      bank_agency: bank_agency?.trim() || null,
      bank_account: bank_account?.trim() || null,
      pix_key: pix_key?.trim() || null,
      active: true,
    });

    if (providerError) {
      await adminClient.auth.admin.deleteUser(userId);
      throw providerError;
    }

    // Assign provider role
    await adminClient.from("user_roles").insert({ user_id: userId, role: "provider" });

    // Link to tenant
    await adminClient.from("user_tenants").insert({ user_id: userId, tenant_id: tenant.id });

    return new Response(
      JSON.stringify({ success: true, message: "Cadastro realizado com sucesso!" }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
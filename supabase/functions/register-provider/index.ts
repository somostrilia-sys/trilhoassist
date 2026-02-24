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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const {
      tenant_slug,
      email,
      password,
      name,
      cnpj,
      phone,
      services,
      street,
      address_number,
      neighborhood,
      city,
      state,
      zip_code,
      bank_name,
      bank_agency,
      bank_account,
      pix_key,
    } = body;

    // Validate required fields
    if (!tenant_slug || !email || !password || !name || !phone || !cnpj) {
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios: email, senha, nome, CNPJ, telefone" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
    const { data: existingProvider } = await adminClient
      .from("providers")
      .select("id")
      .eq("cnpj", cnpj)
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
      user_metadata: { full_name: name },
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
      name,
      cnpj,
      phone,
      email,
      services: services || [],
      street,
      address_number,
      neighborhood,
      city,
      state,
      zip_code,
      bank_name,
      bank_agency,
      bank_account,
      pix_key,
      active: true,
    });

    if (providerError) {
      // Rollback: delete the created user
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

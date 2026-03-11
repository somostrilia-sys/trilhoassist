import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonRes(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const action = body.action || "list";

    // Check for bootstrap header (one-time setup)
    const bootstrapKey = req.headers.get("x-bootstrap-key");
    const isBootstrap = bootstrapKey === supabaseServiceKey;

    let caller: any = null;
    let isSuperAdmin = false;
    let isAdmin = false;

    if (!isBootstrap) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return jsonRes({ error: "Não autorizado" }, 401);
      }

      const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });

      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return jsonRes({ error: "Não autorizado" }, 401);
      }

      const userId = claimsData.claims.sub;
      caller = { id: userId };

      const { data: callerRoles } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      isSuperAdmin = callerRoles?.some((r) => r.role === "super_admin") || false;
      isAdmin = callerRoles?.some((r) => r.role === "admin") || false;

      if (!isSuperAdmin && !isAdmin) {
        return jsonRes({ error: "Apenas administradores podem gerenciar usuários" }, 403);
      }
    } else {
      isSuperAdmin = true;
    }

    // Get caller's tenant_ids
    let callerTenantIds: string[] = [];
    if (!isSuperAdmin && caller) {
      const { data: callerTenants } = await adminClient
        .from("user_tenants")
        .select("tenant_id")
        .eq("user_id", caller.id);
      callerTenantIds = callerTenants?.map((t) => t.tenant_id) || [];
    }

    // ─── LIST USERS ───
    if (action === "list") {
      const filterTenantId = body.tenant_id;
      const { data: { users }, error } = await adminClient.auth.admin.listUsers();
      if (error) throw error;

      const { data: allRoles } = await adminClient.from("user_roles").select("*");
      const { data: allProfiles } = await adminClient.from("profiles").select("*");
      const { data: allUserTenants } = await adminClient.from("user_tenants").select("*");

      let enrichedUsers = users.map((u) => ({
        id: u.id,
        email: u.email,
        full_name: allProfiles?.find((p) => p.user_id === u.id)?.full_name || u.user_metadata?.full_name || "",
        roles: allRoles?.filter((r) => r.user_id === u.id).map((r) => r.role) || [],
        client_id: allRoles?.find((r) => r.user_id === u.id && r.role === "client")?.client_id || null,
        tenant_ids: allUserTenants?.filter((ut) => ut.user_id === u.id).map((ut) => ut.tenant_id) || [],
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
      }));

      if (!isSuperAdmin) {
        enrichedUsers = enrichedUsers.filter((u) =>
          u.tenant_ids.some((tid) => callerTenantIds.includes(tid))
        );
      }

      if (filterTenantId) {
        enrichedUsers = enrichedUsers.filter((u) =>
          u.tenant_ids.includes(filterTenantId)
        );
      }

      return jsonRes(enrichedUsers);
    }

    // ─── CREATE USER ───
    if (action === "create") {
      const { email, password, full_name, role, tenant_id, client_id } = body;

      if (!email || !password || !full_name || !role) {
        return jsonRes({ error: "Campos obrigatórios: email, password, full_name, role" }, 400);
      }

      if (!isSuperAdmin) {
        if (!tenant_id) return jsonRes({ error: "tenant_id é obrigatório" }, 400);
        if (!callerTenantIds.includes(tenant_id)) return jsonRes({ error: "Sem permissão para esta assistência" }, 403);
      }

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (createError) throw createError;

      const roleInsert: any = { user_id: newUser.user.id, role };
      if (role === "client" && client_id) {
        roleInsert.client_id = client_id;
      }
      await adminClient.from("user_roles").insert(roleInsert);

      if (tenant_id) {
        await adminClient.from("user_tenants").insert({
          user_id: newUser.user.id,
          tenant_id,
        });
      }

      return jsonRes({ id: newUser.user.id, email, full_name, role }, 201);
    }

    // ─── UPDATE ROLE ───
    if (action === "update_role") {
      const { user_id, role } = body;
      if (!user_id || !role) return jsonRes({ error: "user_id e role são obrigatórios" }, 400);

      if (!isSuperAdmin) {
        const { data: userTenants } = await adminClient
          .from("user_tenants")
          .select("tenant_id")
          .eq("user_id", user_id);
        const userTenantIds = userTenants?.map((t) => t.tenant_id) || [];
        if (!userTenantIds.some((tid) => callerTenantIds.includes(tid))) {
          return jsonRes({ error: "Sem permissão para editar este usuário" }, 403);
        }
      }

      await adminClient.from("user_roles").delete().eq("user_id", user_id);
      const { error: roleError } = await adminClient.from("user_roles").insert({ user_id, role });
      if (roleError) throw roleError;

      return jsonRes({ success: true });
    }

    // ─── RESET PASSWORD ───
    if (action === "reset_password") {
      const { user_id, new_password } = body;
      if (!user_id || !new_password) return jsonRes({ error: "user_id e new_password são obrigatórios" }, 400);
      if (new_password.length < 6) return jsonRes({ error: "Senha deve ter no mínimo 6 caracteres" }, 400);

      if (!isSuperAdmin) {
        const { data: userTenants } = await adminClient
          .from("user_tenants")
          .select("tenant_id")
          .eq("user_id", user_id);
        const userTenantIds = userTenants?.map((t) => t.tenant_id) || [];
        if (!userTenantIds.some((tid) => callerTenantIds.includes(tid))) {
          return jsonRes({ error: "Sem permissão para alterar senha deste usuário" }, 403);
        }
      }

      const { error } = await adminClient.auth.admin.updateUserById(user_id, { password: new_password });
      if (error) throw error;

      return jsonRes({ success: true });
    }

    // ─── CREATE PROVIDER USER ───
    if (action === "create_provider_user") {
      const { email, provider_id, tenant_id: provTenantId } = body;
      if (!email || !provider_id) {
        return jsonRes({ error: "email e provider_id são obrigatórios" }, 400);
      }

      const defaultPassword = "Prestador@2026";

      // Check if user already exists
      const { data: { users: existingUsers } } = await adminClient.auth.admin.listUsers();
      const existingUser = existingUsers?.find((u) => u.email === email);

      let userId: string;

      if (existingUser) {
        userId = existingUser.id;
      } else {
        const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
          email,
          password: defaultPassword,
          email_confirm: true,
          user_metadata: { full_name: email },
        });
        if (createError) throw createError;
        userId = newUser.user.id;
      }

      // Add provider role if not present
      const { data: existingRoles } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      
      if (!existingRoles?.some((r) => r.role === "provider")) {
        await adminClient.from("user_roles").insert({ user_id: userId, role: "provider" });
      }

      // Link to tenant if provided
      if (provTenantId) {
        const { data: existingTenant } = await adminClient
          .from("user_tenants")
          .select("id")
          .eq("user_id", userId)
          .eq("tenant_id", provTenantId)
          .maybeSingle();
        
        if (!existingTenant) {
          await adminClient.from("user_tenants").insert({ user_id: userId, tenant_id: provTenantId });
        }
      }

      // Update provider record with user_id
      await adminClient
        .from("providers")
        .update({ user_id: userId })
        .eq("id", provider_id);

      return jsonRes({ success: true, user_id: userId });
    }


    if (action === "delete") {
      const user_id = body.user_id;
      if (!user_id) return jsonRes({ error: "user_id é obrigatório" }, 400);

      if (caller && user_id === caller.id) {
        return jsonRes({ error: "Você não pode excluir sua própria conta" }, 400);
      }

      if (!isSuperAdmin) {
        const { data: userTenants } = await adminClient
          .from("user_tenants")
          .select("tenant_id")
          .eq("user_id", user_id);
        const userTenantIds = userTenants?.map((t: any) => t.tenant_id) || [];
        if (!userTenantIds.some((tid: string) => callerTenantIds.includes(tid))) {
          return jsonRes({ error: "Sem permissão para remover este usuário" }, 403);
        }
      }

      const { error } = await adminClient.auth.admin.deleteUser(user_id);
      if (error) throw error;

      return jsonRes({ success: true });
    }

    return jsonRes({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

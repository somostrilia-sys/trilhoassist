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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: callerRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    const isSuperAdmin = callerRoles?.some((r) => r.role === "super_admin");
    const isAdmin = callerRoles?.some((r) => r.role === "admin");

    if (!isSuperAdmin && !isAdmin) {
      return new Response(JSON.stringify({ error: "Apenas administradores podem gerenciar usuários" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get caller's tenant_ids
    let callerTenantIds: string[] = [];
    if (!isSuperAdmin) {
      const { data: callerTenants } = await adminClient
        .from("user_tenants")
        .select("tenant_id")
        .eq("user_id", caller.id);
      callerTenantIds = callerTenants?.map((t) => t.tenant_id) || [];
    }

    const url = new URL(req.url);
    const method = req.method;
    const filterTenantId = url.searchParams.get("tenant_id");

    // LIST users
    if (method === "GET") {
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
        tenant_ids: allUserTenants?.filter((ut) => ut.user_id === u.id).map((ut) => ut.tenant_id) || [],
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
      }));

      // Non-super_admin: filter to users in their tenants
      if (!isSuperAdmin) {
        enrichedUsers = enrichedUsers.filter((u) =>
          u.tenant_ids.some((tid) => callerTenantIds.includes(tid))
        );
      }

      // Optional tenant_id filter
      if (filterTenantId) {
        enrichedUsers = enrichedUsers.filter((u) =>
          u.tenant_ids.includes(filterTenantId)
        );
      }

      return new Response(JSON.stringify(enrichedUsers), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // CREATE user or DELETE via POST
    if (method === "POST") {
      const body = await req.json();
      
      // Handle delete action via POST
      if (body.action === "delete") {
        const user_id = body.user_id;
        if (!user_id) {
          return new Response(JSON.stringify({ error: "user_id é obrigatório" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (user_id === caller.id) {
          return new Response(JSON.stringify({ error: "Você não pode excluir sua própria conta" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (!isSuperAdmin) {
          const { data: userTenants } = await adminClient
            .from("user_tenants")
            .select("tenant_id")
            .eq("user_id", user_id);
          const userTenantIds = userTenants?.map((t: any) => t.tenant_id) || [];
          if (!userTenantIds.some((tid: string) => callerTenantIds.includes(tid))) {
            return new Response(JSON.stringify({ error: "Sem permissão para remover este usuário" }), {
              status: 403,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        const { error } = await adminClient.auth.admin.deleteUser(user_id);
        if (error) throw error;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { email, password, full_name, role, tenant_id } = body;

      if (!email || !password || !full_name || !role) {
        return new Response(JSON.stringify({ error: "Campos obrigatórios: email, password, full_name, role" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!isSuperAdmin) {
        if (!tenant_id) {
          return new Response(JSON.stringify({ error: "tenant_id é obrigatório" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (!callerTenantIds.includes(tenant_id)) {
          return new Response(JSON.stringify({ error: "Sem permissão para esta assistência" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (createError) throw createError;

      await adminClient.from("user_roles").insert({ user_id: newUser.user.id, role });

      if (tenant_id) {
        await adminClient.from("user_tenants").insert({
          user_id: newUser.user.id,
          tenant_id,
        });
      }

      return new Response(JSON.stringify({ id: newUser.user.id, email, full_name, role }), {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // UPDATE user role
    if (method === "PUT") {
      const { user_id, role } = await req.json();
      if (!user_id || !role) {
        return new Response(JSON.stringify({ error: "user_id e role são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!isSuperAdmin) {
        const { data: userTenants } = await adminClient
          .from("user_tenants")
          .select("tenant_id")
          .eq("user_id", user_id);
        const userTenantIds = userTenants?.map((t) => t.tenant_id) || [];
        if (!userTenantIds.some((tid) => callerTenantIds.includes(tid))) {
          return new Response(JSON.stringify({ error: "Sem permissão para editar este usuário" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      await adminClient.from("user_roles").delete().eq("user_id", user_id);
      const { error: roleError } = await adminClient.from("user_roles").insert({ user_id, role });
      if (roleError) throw roleError;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DELETE user
    if (method === "DELETE") {
      const user_id = url.searchParams.get("user_id");
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (user_id === caller.id) {
        return new Response(JSON.stringify({ error: "Você não pode excluir sua própria conta" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!isSuperAdmin) {
        const { data: userTenants } = await adminClient
          .from("user_tenants")
          .select("tenant_id")
          .eq("user_id", user_id);
        const userTenantIds = userTenants?.map((t) => t.tenant_id) || [];
        if (!userTenantIds.some((tid) => callerTenantIds.includes(tid))) {
          return new Response(JSON.stringify({ error: "Sem permissão para remover este usuário" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const { error } = await adminClient.auth.admin.deleteUser(user_id);
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Método não suportado" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

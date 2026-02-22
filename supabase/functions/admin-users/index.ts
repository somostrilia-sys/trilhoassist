import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

    // Check caller roles
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

    // Get caller's client_ids (for scoping)
    let callerClientIds: string[] = [];
    if (!isSuperAdmin) {
      const { data: callerClients } = await adminClient
        .from("user_clients")
        .select("client_id")
        .eq("user_id", caller.id);
      callerClientIds = callerClients?.map((c) => c.client_id) || [];
    }

    const url = new URL(req.url);
    const method = req.method;
    const filterClientId = url.searchParams.get("client_id");

    // LIST users
    if (method === "GET") {
      const { data: { users }, error } = await adminClient.auth.admin.listUsers();
      if (error) throw error;

      const { data: allRoles } = await adminClient.from("user_roles").select("*");
      const { data: allProfiles } = await adminClient.from("profiles").select("*");
      const { data: allUserClients } = await adminClient.from("user_clients").select("*");

      let enrichedUsers = users.map((u) => ({
        id: u.id,
        email: u.email,
        full_name: allProfiles?.find((p) => p.user_id === u.id)?.full_name || u.user_metadata?.full_name || "",
        roles: allRoles?.filter((r) => r.user_id === u.id).map((r) => r.role) || [],
        client_ids: allUserClients?.filter((uc) => uc.user_id === u.id).map((uc) => uc.client_id) || [],
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
      }));

      // Non-super_admin: filter to only users in their clients
      if (!isSuperAdmin) {
        enrichedUsers = enrichedUsers.filter((u) =>
          u.client_ids.some((cid) => callerClientIds.includes(cid))
        );
      }

      // Optional client_id filter
      if (filterClientId) {
        enrichedUsers = enrichedUsers.filter((u) =>
          u.client_ids.includes(filterClientId)
        );
      }

      return new Response(JSON.stringify(enrichedUsers), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // CREATE user
    if (method === "POST") {
      const { email, password, full_name, role, client_id } = await req.json();

      if (!email || !password || !full_name || !role) {
        return new Response(JSON.stringify({ error: "Campos obrigatórios: email, password, full_name, role" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Non-super_admin must provide client_id and it must be one of their clients
      if (!isSuperAdmin) {
        if (!client_id) {
          return new Response(JSON.stringify({ error: "client_id é obrigatório" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (!callerClientIds.includes(client_id)) {
          return new Response(JSON.stringify({ error: "Sem permissão para esta associação" }), {
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

      // Assign role
      await adminClient.from("user_roles").insert({ user_id: newUser.user.id, role });

      // Assign to client if provided
      if (client_id) {
        await adminClient.from("user_clients").insert({
          user_id: newUser.user.id,
          client_id,
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

      // Non-super_admin: verify user belongs to their clients
      if (!isSuperAdmin) {
        const { data: userClients } = await adminClient
          .from("user_clients")
          .select("client_id")
          .eq("user_id", user_id);
        const userClientIds = userClients?.map((c) => c.client_id) || [];
        const hasAccess = userClientIds.some((cid) => callerClientIds.includes(cid));
        if (!hasAccess) {
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
      const { user_id } = await req.json();
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

      // Non-super_admin: verify user belongs to their clients
      if (!isSuperAdmin) {
        const { data: userClients } = await adminClient
          .from("user_clients")
          .select("client_id")
          .eq("user_id", user_id);
        const userClientIds = userClients?.map((c) => c.client_id) || [];
        const hasAccess = userClientIds.some((cid) => callerClientIds.includes(cid));
        if (!hasAccess) {
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

import { createClient } from "npm:@supabase/supabase-js@2";

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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get all open conversations
    const { data: conversations, error: convErr } = await supabase
      .from("whatsapp_conversations")
      .select("id, phone, tenant_id, followup_count, last_followup_at")
      .eq("status", "open");

    if (convErr) throw convErr;
    if (!conversations || conversations.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cache tenant configs
    const tenantIds = [...new Set(conversations.map((c: any) => c.tenant_id))];
    const { data: tenants } = await supabase
      .from("tenants")
      .select("id, followup_timeout_minutes, followup_max_retries, evolution_api_url, evolution_api_key, name")
      .in("id", tenantIds);

    const tenantMap: Record<string, any> = {};
    for (const t of tenants || []) {
      tenantMap[t.id] = t;
    }

    let processed = 0;

    for (const conv of conversations) {
      const tenant = tenantMap[conv.tenant_id];
      if (!tenant) continue;

      const timeoutMin = tenant.followup_timeout_minutes || 3;
      const maxRetries = tenant.followup_max_retries || 3;

      // Skip if already at max retries
      if ((conv.followup_count || 0) >= maxRetries) continue;

      // Get the last few messages to check if there's a pending outbound question
      const { data: messages } = await supabase
        .from("whatsapp_messages")
        .select("id, direction, content, created_at, message_type")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (!messages || messages.length === 0) continue;

      // Find the last message - if it's outbound (our question), check timeout
      const lastMsg = messages[0];
      if (lastMsg.direction !== "outbound") {
        // Last message is inbound (user responded), reset counter if needed
        if ((conv.followup_count || 0) > 0) {
          await supabase
            .from("whatsapp_conversations")
            .update({ followup_count: 0, last_followup_at: null })
            .eq("id", conv.id);
        }
        continue;
      }

      // Check if enough time has passed since the outbound message
      const msgTime = new Date(lastMsg.created_at).getTime();
      const now = Date.now();
      const elapsedMin = (now - msgTime) / 60000;

      if (elapsedMin < timeoutMin) continue;

      // Also check if we already sent a followup recently (avoid double-sending within the timeout window)
      if (conv.last_followup_at) {
        const lastFollowupTime = new Date(conv.last_followup_at).getTime();
        const sinceLastFollowup = (now - lastFollowupTime) / 60000;
        if (sinceLastFollowup < timeoutMin) continue;
      }

      // Build the reminder message
      const questionText = lastMsg.content || "a pergunta anterior";
      const currentCount = (conv.followup_count || 0) + 1;
      
      let reminderMessage = "";
      if (currentCount === 1) {
        reminderMessage = `Olá! 😊 Notamos que você ainda não respondeu:\n\n*"${questionText}"*\n\nPor favor, responda para darmos continuidade ao seu atendimento. 🙏`;
      } else if (currentCount === 2) {
        reminderMessage = `Oi! Ainda precisamos da sua resposta para:\n\n*"${questionText}"*\n\nSem essa informação, não conseguimos avançar com o atendimento. Pode nos responder? 📝`;
      } else {
        reminderMessage = `⚠️ Última tentativa de contato!\n\nPrecisamos da sua resposta para:\n*"${questionText}"*\n\nCaso não responda, o atendimento poderá ser encerrado. Por favor, nos retorne. 🙏`;
      }

      // Send via Evolution API
      const apiUrl = tenant.evolution_api_url;
      const apiKey = tenant.evolution_api_key;

      if (!apiUrl || !apiKey) continue;

      const baseUrl = apiUrl.replace(/\/$/, "");
      let cleanPhone = (conv.phone || "").replace(/\D/g, "");
      if (cleanPhone.length <= 11) cleanPhone = `55${cleanPhone}`;

      const EVOLUTION_INSTANCE = Deno.env.get("EVOLUTION_INSTANCE") || "default";

      try {
        const response = await fetch(`${baseUrl}/message/sendText/${EVOLUTION_INSTANCE}`, {
          method: "POST",
          headers: { apikey: apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ number: cleanPhone, text: reminderMessage }),
        });

        if (response.ok) {
          const result = await response.json();

          // Save the followup message
          await supabase.from("whatsapp_messages").insert({
            conversation_id: conv.id,
            direction: "outbound",
            message_type: "text",
            content: reminderMessage,
            external_id: result.key?.id || null,
          });

          // Update conversation followup tracking
          await supabase
            .from("whatsapp_conversations")
            .update({
              followup_count: currentCount,
              last_followup_at: new Date().toISOString(),
              last_message_at: new Date().toISOString(),
            })
            .eq("id", conv.id);

          processed++;
          console.log(`Followup ${currentCount}/${maxRetries} sent to ${conv.phone} (conv: ${conv.id})`);
        } else {
          const errBody = await response.text();
          console.error(`Failed to send followup to ${conv.phone}:`, errBody);
        }
      } catch (sendErr) {
        console.error(`Error sending followup to ${conv.phone}:`, sendErr);
      }
    }

    return new Response(JSON.stringify({ processed, total: conversations.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Auto-followup error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

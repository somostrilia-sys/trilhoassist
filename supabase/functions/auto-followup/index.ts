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
      .select("id, phone, tenant_id, followup_count, last_followup_at, current_flow_id, current_flow_step")
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
      .select("id, followup_timeout_minutes, followup_max_retries, zapi_instance_id, zapi_token, zapi_security_token, name")
      .in("id", tenantIds);

    const tenantMap: Record<string, any> = {};
    for (const t of tenants || []) {
      tenantMap[t.id] = t;
    }

    // Cache flow steps for active flows
    const flowIds = [...new Set(conversations.filter(c => c.current_flow_id).map(c => c.current_flow_id))];
    const flowStepMap: Record<string, any[]> = {};
    if (flowIds.length > 0) {
      const { data: steps } = await supabase
        .from("whatsapp_flow_steps")
        .select("*")
        .in("flow_id", flowIds)
        .order("step_order", { ascending: true });

      for (const step of steps || []) {
        if (!flowStepMap[step.flow_id]) flowStepMap[step.flow_id] = [];
        flowStepMap[step.flow_id].push(step);
      }
    }

    let processed = 0;

    for (const conv of conversations) {
      const tenant = tenantMap[conv.tenant_id];
      if (!tenant) continue;

      const zapiInstanceId = tenant.zapi_instance_id;
      const zapiToken = tenant.zapi_token;
      const zapiSecurityToken = tenant.zapi_security_token || "";
      if (!zapiInstanceId || !zapiToken) continue;

      // Get last messages
      const { data: messages } = await supabase
        .from("whatsapp_messages")
        .select("id, direction, content, created_at, message_type")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (!messages || messages.length === 0) continue;

      const lastMsg = messages[0];
      const now = Date.now();

      // ========== FLOW-BASED AUTOMATION ==========
      if (conv.current_flow_id && conv.current_flow_step > 0) {
        const steps = flowStepMap[conv.current_flow_id] || [];
        const currentStep = steps.find((s: any) => s.step_order === conv.current_flow_step);

        if (!currentStep) continue;

        // If last message is INBOUND (client responded), advance to next step
        if (lastMsg.direction === "inbound") {
          const nextStep = steps.find((s: any) => s.step_order === conv.current_flow_step + 1);

          if (nextStep) {
            const sent = await sendMessage(zapiInstanceId, zapiToken, zapiSecurityToken, conv.phone, nextStep.message_text);
            if (sent) {
              await supabase.from("whatsapp_messages").insert({
                conversation_id: conv.id,
                direction: "outbound",
                message_type: "text",
                content: nextStep.message_text,
                external_id: sent.messageId || sent.zaapId || null,
              });
              await supabase.from("whatsapp_conversations").update({
                current_flow_step: nextStep.step_order,
                last_message_at: new Date().toISOString(),
                followup_count: 0,
                last_followup_at: null,
              }).eq("id", conv.id);
              processed++;
              console.log(`Flow step ${nextStep.step_order} sent to ${conv.phone}`);
            }
          } else {
            // Flow complete — clear flow tracking
            await supabase.from("whatsapp_conversations").update({
              current_flow_id: null,
              current_flow_step: 0,
              followup_count: 0,
              last_followup_at: null,
            }).eq("id", conv.id);
            console.log(`Flow completed for ${conv.phone}`);
          }
          continue;
        }

        // If last message is OUTBOUND (waiting for response), check timeout for reminder
        if (lastMsg.direction === "outbound") {
          const msgTime = new Date(lastMsg.created_at).getTime();
          const elapsedMin = (now - msgTime) / 60000;
          const stepTimeout = currentStep.timeout_minutes || 3;
          const maxRetries = tenant.followup_max_retries || 3;

          if (elapsedMin < stepTimeout) continue;
          if ((conv.followup_count || 0) >= maxRetries) continue;

          // Check cooldown
          if (conv.last_followup_at) {
            const sinceLastFollowup = (now - new Date(conv.last_followup_at).getTime()) / 60000;
            if (sinceLastFollowup < stepTimeout) continue;
          }

          const currentCount = (conv.followup_count || 0) + 1;
          const reminderMessage = currentCount >= maxRetries
            ? `⚠️ Última tentativa: ainda precisamos da sua resposta para continuar o atendimento. 🙏`
            : `Olá! 😊 Ainda aguardamos sua resposta para dar continuidade. Por favor, responda a última mensagem. 🙏`;

          const sent = await sendMessage(zapiInstanceId, zapiToken, zapiSecurityToken, conv.phone, reminderMessage);
          if (sent) {
            await supabase.from("whatsapp_messages").insert({
              conversation_id: conv.id,
              direction: "outbound",
              message_type: "text",
              content: reminderMessage,
              external_id: sent.messageId || sent.zaapId || null,
            });
            await supabase.from("whatsapp_conversations").update({
              followup_count: currentCount,
              last_followup_at: new Date().toISOString(),
              last_message_at: new Date().toISOString(),
            }).eq("id", conv.id);
            processed++;
            console.log(`Flow reminder ${currentCount}/${maxRetries} sent to ${conv.phone}`);
          }
          continue;
        }
        continue;
      }

      // ========== STANDARD FOLLOW-UP (no flow) ==========
      const timeoutMin = tenant.followup_timeout_minutes || 3;
      const maxRetries = tenant.followup_max_retries || 3;

      if ((conv.followup_count || 0) >= maxRetries) continue;

      if (lastMsg.direction !== "outbound") {
        if ((conv.followup_count || 0) > 0) {
          await supabase.from("whatsapp_conversations").update({ followup_count: 0, last_followup_at: null }).eq("id", conv.id);
        }
        continue;
      }

      const msgTime = new Date(lastMsg.created_at).getTime();
      const elapsedMin = (now - msgTime) / 60000;
      if (elapsedMin < timeoutMin) continue;

      if (conv.last_followup_at) {
        const sinceLastFollowup = (now - new Date(conv.last_followup_at).getTime()) / 60000;
        if (sinceLastFollowup < timeoutMin) continue;
      }

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

      const sent = await sendMessage(zapiInstanceId, zapiToken, zapiSecurityToken, conv.phone, reminderMessage);
      if (sent) {
        await supabase.from("whatsapp_messages").insert({
          conversation_id: conv.id,
          direction: "outbound",
          message_type: "text",
          content: reminderMessage,
          external_id: sent.messageId || sent.zaapId || null,
        });
        await supabase.from("whatsapp_conversations").update({
          followup_count: currentCount,
          last_followup_at: new Date().toISOString(),
          last_message_at: new Date().toISOString(),
        }).eq("id", conv.id);
        processed++;
        console.log(`Followup ${currentCount}/${maxRetries} sent to ${conv.phone}`);
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

async function sendMessage(instanceId: string, token: string, securityToken: string, phone: string, text: string): Promise<any | null> {
  let cleanPhone = (phone || "").replace(/\D/g, "");
  if (cleanPhone.length <= 11) cleanPhone = `55${cleanPhone}`;

  const zapiUrl = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (securityToken) {
    headers["Client-Token"] = securityToken;
  }

  try {
    const response = await fetch(zapiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ phone: cleanPhone, message: text }),
    });
    if (response.ok) return await response.json();
    console.error(`Send failed:`, await response.text());
    return null;
  } catch (e) {
    console.error(`Send error:`, e);
    return null;
  }
}

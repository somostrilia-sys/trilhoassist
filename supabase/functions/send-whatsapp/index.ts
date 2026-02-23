import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const META_API_URL = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate the request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;

    const { phone, message, conversation_id } = await req.json();

    if (!phone || !message) {
      return new Response(JSON.stringify({ error: "phone and message are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN");
    const WHATSAPP_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID");

    if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
      return new Response(
        JSON.stringify({
          error: "WhatsApp API not configured. Please add WHATSAPP_TOKEN and WHATSAPP_PHONE_ID secrets.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean phone number - ensure it has country code
    let cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length <= 11) {
      cleanPhone = `55${cleanPhone}`;
    }

    // ========== SEND VIA META CLOUD API ==========
    const response = await fetch(`${META_API_URL}/${WHATSAPP_PHONE_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanPhone,
        type: "text",
        text: { body: message },
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Meta API error:", result);
      return new Response(
        JSON.stringify({ error: "Failed to send message", details: result }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========== SAVE OUTBOUND MESSAGE TO DB ==========
    if (conversation_id) {
      const adminSupabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      await adminSupabase.from("whatsapp_messages").insert({
        conversation_id,
        direction: "outbound",
        message_type: "text",
        content: message,
        external_id: result.messages?.[0]?.id || null,
      });

      // Update conversation timestamp
      await adminSupabase
        .from("whatsapp_conversations")
        .update({
          last_message_at: new Date().toISOString(),
          assigned_to: userId,
        })
        .eq("id", conversation_id);
    }

    return new Response(JSON.stringify({ success: true, message_id: result.messages?.[0]?.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Send WhatsApp error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Regex for Brazilian vehicle plates: ABC1D23 (Mercosul) or ABC-1234 (old)
const PLATE_REGEX = /\b([A-Z]{3}[\-\s]?\d[A-Z0-9]\d{2})\b/i;

function extractPlate(text: string): string | null {
  const match = text?.match(PLATE_REGEX);
  if (!match) return null;
  return match[1].replace(/[\-\s]/g, "").toUpperCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const tenantSlug = url.searchParams.get("tenant");

    // GET = webhook verification
    if (req.method === "GET") {
      const challenge = url.searchParams.get("hub.challenge") || url.searchParams.get("challenge") || "ok";
      return new Response(challenge, { status: 200, headers: corsHeaders });
    }

    const payload = await req.json();

    if (!tenantSlug) {
      return new Response(JSON.stringify({ error: "tenant query param required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve tenant
    const { data: tenant, error: tenantErr } = await supabase
      .from("tenants")
      .select("id")
      .eq("slug", tenantSlug)
      .eq("active", true)
      .single();

    if (tenantErr || !tenant) {
      return new Response(JSON.stringify({ error: "Tenant not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalized = normalizePayload(payload);

    if (!normalized.phone) {
      return new Response(JSON.stringify({ error: "No phone found in payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanPhone = normalized.phone.replace(/\D/g, "");

    // Find or create conversation
    let { data: conversation } = await supabase
      .from("whatsapp_conversations")
      .select("*")
      .eq("tenant_id", tenant.id)
      .eq("phone", cleanPhone)
      .in("status", ["open", "pending_service"])
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!conversation) {
      // Try to find beneficiary by phone
      const { data: beneficiary } = await supabase
        .from("beneficiaries")
        .select("id, name, client_id, vehicle_plate, vehicle_model, vehicle_year")
        .or(`phone.eq.${cleanPhone},phone.ilike.%${cleanPhone.slice(-9)}%`)
        .limit(1)
        .single();

      const { data: newConv, error: convErr } = await supabase
        .from("whatsapp_conversations")
        .insert({
          tenant_id: tenant.id,
          phone: cleanPhone,
          contact_name: normalized.name || beneficiary?.name || null,
          beneficiary_id: beneficiary?.id || null,
          detected_plate: beneficiary?.vehicle_plate || null,
          detected_vehicle_model: beneficiary?.vehicle_model || null,
          detected_vehicle_year: beneficiary?.vehicle_year || null,
          detected_beneficiary_name: beneficiary?.name || null,
          status: "open",
        })
        .select()
        .single();

      if (convErr) throw convErr;
      conversation = newConv;
    }

    // --- Smart extraction from message text ---
    const messageText = normalized.message || "";
    const updateFields: Record<string, any> = {
      last_message_at: new Date().toISOString(),
      contact_name: normalized.name || conversation.contact_name,
    };

    // 1) Extract plate from text if not already detected
    if (!conversation.detected_plate && messageText) {
      const plate = extractPlate(messageText);
      if (plate) {
        updateFields.detected_plate = plate;

        // 2) Search beneficiary by plate
        const { data: benByPlate } = await supabase
          .from("beneficiaries")
          .select("id, name, vehicle_plate, vehicle_model, vehicle_year, client_id")
          .ilike("vehicle_plate", plate)
          .eq("active", true)
          .limit(1)
          .single();

        if (benByPlate) {
          updateFields.beneficiary_id = benByPlate.id;
          updateFields.detected_vehicle_model = benByPlate.vehicle_model;
          updateFields.detected_vehicle_year = benByPlate.vehicle_year;
          updateFields.detected_beneficiary_name = benByPlate.name;
          console.log(`Beneficiary found by plate ${plate}: ${benByPlate.name}`);
        }
      }
    }

    // 3) Store location as origin if sent
    if (normalized.latitude && normalized.longitude && !conversation.origin_lat) {
      updateFields.origin_lat = normalized.latitude;
      updateFields.origin_lng = normalized.longitude;
    }

    // Insert message
    const { error: msgErr } = await supabase.from("whatsapp_messages").insert({
      conversation_id: conversation.id,
      direction: "inbound",
      message_type: normalized.message_type || "text",
      content: normalized.message || null,
      media_url: normalized.media_url || null,
      latitude: normalized.latitude || null,
      longitude: normalized.longitude || null,
      external_id: normalized.external_id || null,
      raw_payload: payload,
    });

    if (msgErr) throw msgErr;

    // Update conversation with extracted data
    await supabase
      .from("whatsapp_conversations")
      .update(updateFields)
      .eq("id", conversation.id);

    return new Response(JSON.stringify({ success: true, conversation_id: conversation.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

interface NormalizedMessage {
  phone: string;
  name?: string;
  message?: string;
  message_type?: string;
  media_url?: string;
  latitude?: number;
  longitude?: number;
  external_id?: string;
}

function normalizePayload(payload: any): NormalizedMessage {
  // Direct/generic format
  if (payload.phone) {
    return {
      phone: payload.phone,
      name: payload.name || payload.contact_name || payload.pushName,
      message: payload.message || payload.text || payload.body,
      message_type: payload.message_type || payload.type || "text",
      media_url: payload.media_url || payload.mediaUrl,
      latitude: payload.latitude || payload.lat,
      longitude: payload.longitude || payload.lng,
      external_id: payload.external_id || payload.id || payload.messageId,
    };
  }

  // WhatsApp Cloud API format
  if (payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
    const change = payload.entry[0].changes[0].value;
    const msg = change.messages[0];
    const contact = change.contacts?.[0];
    return {
      phone: msg.from,
      name: contact?.profile?.name,
      message: msg.text?.body || msg.caption || "",
      message_type: msg.type || "text",
      media_url: undefined,
      latitude: msg.location?.latitude,
      longitude: msg.location?.longitude,
      external_id: msg.id,
    };
  }

  // Evolution API format
  if (payload.data?.key?.remoteJid) {
    const data = payload.data;
    const phone = data.key.remoteJid.replace("@s.whatsapp.net", "").replace("@g.us", "");
    return {
      phone,
      name: data.pushName,
      message: data.message?.conversation || data.message?.extendedTextMessage?.text || "",
      message_type: data.messageType || "text",
      media_url: undefined,
      external_id: data.key.id,
    };
  }

  return { phone: "" };
}

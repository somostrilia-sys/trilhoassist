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

  const url = new URL(req.url);
  const tenantSlug = url.searchParams.get("tenant");
  const source = url.searchParams.get("source"); // "evolution" or null (z-api)

  // Webhook verification (GET)
  if (req.method === "GET") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const payload = await req.json();

    // ========== EVOLUTION API EVENTS ==========
    if (source === "evolution") {
      return await handleEvolutionWebhook(supabase, payload, tenantSlug, url);
    }

    // ========== Z-API EVENT ROUTING (legacy) ==========
    const eventType = payload.type;

    // Ignore non-message events
    if (eventType && eventType !== "ReceivedCallback") {
      return new Response(JSON.stringify({ success: true, type: "ignored_event", event: eventType }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      // Try by ID
      const { data: tenantById } = await supabase
        .from("tenants")
        .select("id")
        .eq("id", tenantSlug)
        .eq("active", true)
        .single();

      if (!tenantById) {
        return new Response(JSON.stringify({ error: "Tenant not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return await processInboundMessage(supabase, normalizeZapiPayload(payload), tenantById.id, url);
    }

    return await processInboundMessage(supabase, normalizeZapiPayload(payload), tenant.id, url);
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ========== EVOLUTION API WEBHOOK HANDLER ==========
async function handleEvolutionWebhook(supabase: any, payload: any, tenantSlug: string | null, url: URL) {
  const event = payload.event;

  // Handle connection updates
  if (event === "connection.update") {
    const instanceName = payload.instance;
    const state = payload.data?.state;

    if (instanceName && state) {
      const connStatus = state === "open" ? "connected" : "disconnected";
      await supabase
        .from("zapi_instances")
        .update({ connection_status: connStatus })
        .eq("evolution_instance_name", instanceName)
        .eq("api_type", "evolution");
    }

    return new Response(JSON.stringify({ success: true, type: "connection_update" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Handle QR code updates (just acknowledge)
  if (event === "qrcode.updated") {
    return new Response(JSON.stringify({ success: true, type: "qrcode_update" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Handle messages
  if (event === "messages.upsert") {
    if (!tenantSlug) {
      return new Response(JSON.stringify({ error: "tenant query param required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve tenant (by slug or ID)
    let tenantId = "";
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id")
      .eq("slug", tenantSlug)
      .eq("active", true)
      .single();

    if (tenant) {
      tenantId = tenant.id;
    } else {
      const { data: tenantById } = await supabase
        .from("tenants")
        .select("id")
        .eq("id", tenantSlug)
        .eq("active", true)
        .single();
      if (tenantById) tenantId = tenantById.id;
    }

    if (!tenantId) {
      return new Response(JSON.stringify({ error: "Tenant not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalized = normalizeEvolutionPayload(payload);

    if (!normalized.phone || normalized.isGroup || normalized.fromMe) {
      return new Response(JSON.stringify({ success: true, type: "skipped" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try to route to operator by instance name
    const instanceName = payload.instance;
    let routeToOperator: string | null = null;
    let routeToInstanceDbId: string | null = null;

    if (instanceName) {
      const { data: evoInst } = await supabase
        .from("zapi_instances")
        .select("id, operator_id")
        .eq("evolution_instance_name", instanceName)
        .eq("api_type", "evolution")
        .eq("active", true)
        .single();

      if (evoInst) {
        routeToOperator = evoInst.operator_id;
        routeToInstanceDbId = evoInst.id;
      }
    }

    return await processInboundMessage(supabase, normalized, tenantId, url, routeToOperator, routeToInstanceDbId);
  }

  // Unknown event
  return new Response(JSON.stringify({ success: true, type: "unknown_event", event }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ========== SHARED MESSAGE PROCESSOR ==========
async function processInboundMessage(
  supabase: any,
  normalized: NormalizedMessage,
  tenantId: string,
  url: URL,
  routeToOperator?: string | null,
  routeToInstanceDbId?: string | null
) {
  if (!normalized.phone) {
    return new Response(JSON.stringify({ error: "No phone found in payload" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (normalized.isGroup) {
    return new Response(JSON.stringify({ success: true, type: "group_message_skipped" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (normalized.fromMe) {
    return new Response(JSON.stringify({ success: true, type: "outbound_skipped" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const cleanPhone = normalized.phone.replace(/\D/g, "");

  // For Z-API source, get routing from URL params
  if (!routeToOperator) {
    const incomingInstanceId = url.searchParams.get("instance_id");
    if (incomingInstanceId) {
      const { data: zapiInst } = await supabase
        .from("zapi_instances")
        .select("id, operator_id")
        .eq("tenant_id", tenantId)
        .eq("zapi_instance_id", incomingInstanceId)
        .eq("active", true)
        .single();
      if (zapiInst) {
        routeToOperator = zapiInst.operator_id;
        routeToInstanceDbId = zapiInst.id;
      }
    }
  }

  // Find or create conversation
  let { data: conversation } = await supabase
    .from("whatsapp_conversations")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("phone", cleanPhone)
    .in("status", ["open", "pending_service"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!conversation) {
    const { data: beneficiary } = await supabase
      .from("beneficiaries")
      .select("id, name, client_id, vehicle_plate, vehicle_model, vehicle_year")
      .or(`phone.eq.${cleanPhone},phone.ilike.%${cleanPhone.slice(-9)}%`)
      .limit(1)
      .single();

    const { data: newConv, error: convErr } = await supabase
      .from("whatsapp_conversations")
      .insert({
        tenant_id: tenantId,
        phone: cleanPhone,
        contact_name: normalized.name || beneficiary?.name || null,
        beneficiary_id: beneficiary?.id || null,
        detected_plate: beneficiary?.vehicle_plate || null,
        detected_vehicle_model: beneficiary?.vehicle_model || null,
        detected_vehicle_year: beneficiary?.vehicle_year || null,
        detected_beneficiary_name: beneficiary?.name || null,
        status: "open",
        assigned_to: routeToOperator || null,
        operator_zapi_instance_id: routeToInstanceDbId || null,
      })
      .select()
      .single();

    if (convErr) throw convErr;
    conversation = newConv;
  } else if (routeToOperator && !conversation.assigned_to) {
    await supabase
      .from("whatsapp_conversations")
      .update({ assigned_to: routeToOperator, operator_zapi_instance_id: routeToInstanceDbId })
      .eq("id", conversation.id);
  }

  // Smart extraction
  const messageText = normalized.message || "";
  const updateFields: Record<string, any> = {
    last_message_at: new Date().toISOString(),
    contact_name: normalized.name || conversation.contact_name,
  };

  if (!conversation.detected_plate && messageText) {
    const plate = extractPlate(messageText);
    if (plate) {
      updateFields.detected_plate = plate;

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
      }
    }
  }

  if (normalized.latitude && normalized.longitude) {
    if (!conversation.origin_lat) {
      updateFields.origin_lat = normalized.latitude;
      updateFields.origin_lng = normalized.longitude;
    } else if (!conversation.destination_lat) {
      updateFields.destination_lat = normalized.latitude;
      updateFields.destination_lng = normalized.longitude;
    }
  }

  // Insert message
  await supabase.from("whatsapp_messages").insert({
    conversation_id: conversation.id,
    direction: "inbound",
    message_type: normalized.message_type || "text",
    content: normalized.message || null,
    media_url: normalized.media_url || null,
    latitude: normalized.latitude || null,
    longitude: normalized.longitude || null,
    external_id: normalized.external_id || null,
    raw_payload: null,
  });

  // Update conversation
  await supabase
    .from("whatsapp_conversations")
    .update(updateFields)
    .eq("id", conversation.id);

  return new Response(JSON.stringify({ success: true, conversation_id: conversation.id }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ========== PAYLOAD NORMALIZERS ==========

interface NormalizedMessage {
  phone: string;
  name?: string;
  message?: string;
  message_type?: string;
  media_url?: string;
  latitude?: number;
  longitude?: number;
  external_id?: string;
  isGroup?: boolean;
  fromMe?: boolean;
}

function normalizeEvolutionPayload(payload: any): NormalizedMessage {
  const data = payload.data;
  if (!data) return { phone: "" };

  const key = data.key;
  if (!key) return { phone: "" };

  const phone = (key.remoteJid || "").replace("@s.whatsapp.net", "").replace("@g.us", "");
  const isGroup = (key.remoteJid || "").includes("@g.us");
  const fromMe = key.fromMe === true;
  const name = data.pushName || "";

  const msg = data.message;
  if (!msg) {
    return { phone, name, isGroup, fromMe, message: "", message_type: "text" };
  }

  let content = "";
  let messageType = "text";
  let mediaUrl: string | undefined;
  let latitude: number | undefined;
  let longitude: number | undefined;

  if (msg.conversation) {
    content = msg.conversation;
  } else if (msg.extendedTextMessage?.text) {
    content = msg.extendedTextMessage.text;
  } else if (msg.imageMessage) {
    content = msg.imageMessage.caption || "";
    messageType = "image";
    mediaUrl = data.mediaUrl || msg.imageMessage.url;
  } else if (msg.videoMessage) {
    content = msg.videoMessage.caption || "";
    messageType = "video";
    mediaUrl = data.mediaUrl || msg.videoMessage.url;
  } else if (msg.audioMessage) {
    messageType = "audio";
    mediaUrl = data.mediaUrl || msg.audioMessage.url;
  } else if (msg.documentMessage) {
    content = msg.documentMessage.fileName || "";
    messageType = "document";
    mediaUrl = data.mediaUrl || msg.documentMessage.url;
  } else if (msg.locationMessage) {
    messageType = "location";
    latitude = msg.locationMessage.degreesLatitude;
    longitude = msg.locationMessage.degreesLongitude;
    content = msg.locationMessage.name || msg.locationMessage.address || "";
  } else if (msg.contactMessage) {
    messageType = "contacts";
    content = msg.contactMessage.displayName || "";
  } else if (msg.stickerMessage) {
    messageType = "sticker";
    mediaUrl = data.mediaUrl || msg.stickerMessage.url;
  }

  return {
    phone,
    name,
    message: content,
    message_type: messageType,
    media_url: mediaUrl,
    latitude,
    longitude,
    external_id: key.id,
    isGroup,
    fromMe,
  };
}

function normalizeZapiPayload(payload: any): NormalizedMessage {
  if (payload.type === "ReceivedCallback" || payload.phone) {
    const phone = payload.phone || "";
    const isGroup = payload.isGroup === true;
    const fromMe = payload.fromMe === true;
    const name = payload.senderName || payload.chatName || "";

    let content = "";
    let messageType = "text";
    let mediaUrl: string | undefined;
    let latitude: number | undefined;
    let longitude: number | undefined;

    if (payload.text?.message) {
      content = payload.text.message;
    } else if (payload.hydratedTemplate?.message) {
      content = payload.hydratedTemplate.message;
    } else if (payload.image) {
      content = payload.image.caption || "";
      messageType = "image";
      mediaUrl = payload.image.imageUrl;
    } else if (payload.video) {
      content = payload.video.caption || "";
      messageType = "video";
      mediaUrl = payload.video.videoUrl;
    } else if (payload.audio) {
      messageType = "audio";
      mediaUrl = payload.audio.audioUrl;
    } else if (payload.document) {
      content = payload.document.fileName || payload.document.title || "";
      messageType = "document";
      mediaUrl = payload.document.documentUrl;
    } else if (payload.location) {
      messageType = "location";
      latitude = payload.location.latitude;
      longitude = payload.location.longitude;
      content = payload.location.name || payload.location.address || "";
    } else if (payload.contact) {
      messageType = "contacts";
      content = payload.contact.displayName || JSON.stringify(payload.contact);
    } else if (payload.sticker) {
      messageType = "sticker";
      mediaUrl = payload.sticker.stickerUrl;
    } else if (payload.buttonsResponseMessage) {
      content = payload.buttonsResponseMessage.message || "";
    } else if (payload.listResponseMessage) {
      content = payload.listResponseMessage.title || payload.listResponseMessage.message || "";
    }

    return {
      phone,
      name,
      message: content,
      message_type: messageType,
      media_url: mediaUrl,
      latitude,
      longitude,
      external_id: payload.messageId,
      isGroup,
      fromMe,
    };
  }

  if (payload.phone) {
    return {
      phone: payload.phone,
      name: payload.name || payload.contact_name || payload.senderName,
      message: payload.message || payload.text || payload.body,
      message_type: payload.message_type || payload.type || "text",
      media_url: payload.media_url || payload.mediaUrl,
      latitude: payload.latitude || payload.lat,
      longitude: payload.longitude || payload.lng,
      external_id: payload.external_id || payload.id || payload.messageId,
      isGroup: false,
      fromMe: false,
    };
  }

  return { phone: "" };
}

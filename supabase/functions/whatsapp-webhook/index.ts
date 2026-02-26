import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ===== RATE LIMITER (in-memory, per-isolate) =====
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 100; // max requests per window
const RATE_WINDOW_MS = 60_000; // 1 minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

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

  // ===== RATE LIMITING =====
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(clientIp)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const tenantSlug = url.searchParams.get("tenant");
  const source = url.searchParams.get("source");

  // Webhook verification (GET)
  if (req.method === "GET") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  // ===== WEBHOOK SECRET VALIDATION =====
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
  if (webhookSecret) {
    const providedSecret = req.headers.get("x-webhook-secret");
    if (providedSecret !== webhookSecret) {
      console.warn("Webhook secret mismatch from IP:", clientIp);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let payload: any;
    try {
      const bodyText = await req.text();
      if (bodyText.length > 100_000) {
        return new Response(JSON.stringify({ error: "Payload too large" }), {
          status: 413,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      payload = JSON.parse(bodyText);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ========== UAZAPI GO EVENTS ==========
    return await handleUazapiWebhook(supabase, payload, tenantSlug, url);
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ========== UAZAPI GO WEBHOOK HANDLER ==========
async function handleUazapiWebhook(supabase: any, payload: any, tenantSlug: string | null, url: URL) {
  const event = payload.event;

  // Handle connection updates
  if (event === "connection.update" || event === "CONNECTION_UPDATE") {
    const instanceName = payload.instance || payload.instanceName;
    const state = payload.data?.state || payload.state;

    if (instanceName && state) {
      const connStatus = (state === "open" || state === "connected") ? "connected" : "disconnected";
      await supabase
        .from("zapi_instances")
        .update({ connection_status: connStatus })
        .eq("evolution_instance_name", instanceName)
        .eq("api_type", "uazapi");
    }

    return new Response(JSON.stringify({ success: true, type: "connection_update" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Handle QR code updates (just acknowledge)
  if (event === "qrcode.updated" || event === "QRCODE_UPDATED") {
    return new Response(JSON.stringify({ success: true, type: "qrcode_update" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Handle messages
  if (event === "messages.upsert" || event === "MESSAGES_UPSERT" || event === "message" || event === "onMessage") {
    if (!tenantSlug) {
      return new Response(JSON.stringify({ error: "tenant query param required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate tenantSlug format (alphanumeric + hyphens only)
    if (!/^[a-z0-9\-]{1,100}$/.test(tenantSlug)) {
      return new Response(JSON.stringify({ error: "Invalid tenant slug" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve tenant
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
      // Try as UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(tenantSlug)) {
        const { data: tenantById } = await supabase
          .from("tenants")
          .select("id")
          .eq("id", tenantSlug)
          .eq("active", true)
          .single();
        if (tenantById) tenantId = tenantById.id;
      }
    }

    if (!tenantId) {
      return new Response(JSON.stringify({ error: "Tenant not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalized = normalizeUazapiPayload(payload);

    if (!normalized.phone || normalized.isGroup || normalized.fromMe) {
      return new Response(JSON.stringify({ success: true, type: "skipped" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Route to operator by instance name
    const instanceName = payload.instance || payload.instanceName;
    let routeToOperator: string | null = null;
    let routeToInstanceDbId: string | null = null;

    if (instanceName) {
      const { data: uazInst } = await supabase
        .from("zapi_instances")
        .select("id, operator_id")
        .eq("evolution_instance_name", instanceName)
        .eq("api_type", "uazapi")
        .eq("active", true)
        .single();

      if (uazInst) {
        routeToOperator = uazInst.operator_id;
        routeToInstanceDbId = uazInst.id;
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

  const cleanPhone = normalized.phone.replace(/\D/g, "").slice(0, 20);

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
        contact_name: (normalized.name || beneficiary?.name || "").slice(0, 200),
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
  const messageText = (normalized.message || "").slice(0, 5000);
  const updateFields: Record<string, any> = {
    last_message_at: new Date().toISOString(),
    contact_name: (normalized.name || conversation.contact_name || "").slice(0, 200),
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
    // Validate coordinate ranges
    if (Math.abs(normalized.latitude) <= 90 && Math.abs(normalized.longitude) <= 180) {
      if (!conversation.origin_lat) {
        updateFields.origin_lat = normalized.latitude;
        updateFields.origin_lng = normalized.longitude;
      } else if (!conversation.destination_lat) {
        updateFields.destination_lat = normalized.latitude;
        updateFields.destination_lng = normalized.longitude;
      }
    }
  }

  // Insert message
  await supabase.from("whatsapp_messages").insert({
    conversation_id: conversation.id,
    direction: "inbound",
    message_type: normalized.message_type || "text",
    content: messageText || null,
    media_url: normalized.media_url?.slice(0, 2000) || null,
    latitude: normalized.latitude || null,
    longitude: normalized.longitude || null,
    external_id: normalized.external_id?.slice(0, 200) || null,
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

// ========== PAYLOAD NORMALIZER ==========

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

function normalizeUazapiPayload(payload: any): NormalizedMessage {
  const data = payload.data || payload;
  if (!data) return { phone: "" };

  const key = data.key;
  if (!key) {
    if (data.phone || payload.phone) {
      return {
        phone: (data.phone || payload.phone || "").replace(/\D/g, ""),
        name: data.pushName || data.senderName || payload.pushName || "",
        message: data.body || data.text || data.message || payload.body || payload.message || "",
        message_type: "text",
        external_id: data.id || payload.id || data.messageId || payload.messageId,
        isGroup: false,
        fromMe: data.fromMe === true || payload.fromMe === true,
      };
    }
    return { phone: "" };
  }

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

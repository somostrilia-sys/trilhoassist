import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ===== RATE LIMITER =====
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function isRateLimited(ip: string, max = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count++;
  return entry.count > max;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_MIME_PREFIXES = ["image/", "video/", "audio/", "application/pdf"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Rate limiting
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(clientIp, 30)) {
    return json({ error: "Muitas requisições. Aguarde." }, 429);
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return json({ error: "Invalid content type. Use multipart/form-data." }, 415);
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (error) {
    console.error("Invalid multipart body:", error);
    return json({ error: "Invalid multipart body" }, 400);
  }

  try {
    const file = formData.get("file") as File | null;
    const serviceRequestId = formData.get("service_request_id") as string | null;
    const fileType = formData.get("file_type") as string | null;
    const allowedFileTypes = new Set(["photo", "audio", "video", "document"]);

    if (!file || !serviceRequestId || !fileType) {
      return json({ error: "Missing file, service_request_id or file_type" }, 400);
    }

    if (!allowedFileTypes.has(fileType)) {
      return json({ error: "Invalid file_type" }, 400);
    }

    // ===== FILE SIZE VALIDATION =====
    if (file.size > MAX_FILE_SIZE) {
      return json({ error: `Arquivo muito grande (máx ${MAX_FILE_SIZE / 1024 / 1024}MB)` }, 413);
    }

    if (file.size === 0) {
      return json({ error: "Arquivo vazio" }, 400);
    }

    // ===== MIME TYPE VALIDATION =====
    const mimeType = file.type || "application/octet-stream";
    if (!ALLOWED_MIME_PREFIXES.some(p => mimeType.startsWith(p))) {
      return json({ error: "Tipo de arquivo não permitido" }, 400);
    }

    // ===== SERVICE REQUEST ID VALIDATION =====
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(serviceRequestId)) {
      return json({ error: "ID inválido" }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: sr } = await supabaseAdmin
      .from("service_requests")
      .select("id, service_type, event_type, share_token")
      .eq("id", serviceRequestId)
      .single();

    // Accept: collision (with share_token) OR periferico (event_type = 'periferico') OR other media-required service types
    const isCollision = sr?.service_type === "collision" && sr?.share_token != null;
    const isPeriferico = (sr as any)?.event_type === "periferico" || sr?.service_type === "other";
    
    if (!sr || (!isCollision && !isPeriferico)) {
      console.error("Invalid service request check:", { sr, isCollision, isPeriferico });
      return json({ error: "Invalid service request" }, 403);
    }

    // Sanitize file name
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
    const ext = safeName.split(".").pop() || "bin";
    const path = `${serviceRequestId}/${fileType}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const { data: storageData, error: storageError } = await supabaseAdmin.storage
      .from("collision-media")
      .upload(path, file, { contentType: mimeType });

    if (storageError) {
      console.error("Storage error:", storageError);
      return json({ error: "Storage upload failed" }, 500);
    }

    const { data: urlData } = supabaseAdmin.storage.from("collision-media").getPublicUrl(storageData.path);

    const { data: mediaRow, error: insertError } = await supabaseAdmin
      .from("collision_media")
      .insert({
        service_request_id: serviceRequestId,
        file_url: urlData.publicUrl,
        file_name: safeName,
        file_type: fileType,
        mime_type: mimeType,
        file_size: file.size,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return json({ error: "Database insert failed" }, 500);
    }

    return json({
      id: mediaRow.id,
      file_url: urlData.publicUrl,
      file_name: safeName,
      file_type: fileType,
      mime_type: mimeType,
      file_size: file.size,
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return json({ error: "Internal error" }, 500);
  }
});
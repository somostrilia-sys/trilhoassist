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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
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

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: sr } = await supabaseAdmin
      .from("service_requests")
      .select("id, service_type, share_token")
      .eq("id", serviceRequestId)
      .single();

    if (!sr || sr.service_type !== "collision" || !sr.share_token) {
      return json({ error: "Invalid service request" }, 403);
    }

    const ext = file.name.split(".").pop() || "bin";
    const path = `${serviceRequestId}/${fileType}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const { data: storageData, error: storageError } = await supabaseAdmin.storage
      .from("collision-media")
      .upload(path, file, { contentType: file.type || "application/octet-stream" });

    if (storageError) {
      console.error("Storage error:", storageError);
      return json({ error: "Storage upload failed", details: storageError.message }, 500);
    }

    const { data: urlData } = supabaseAdmin.storage.from("collision-media").getPublicUrl(storageData.path);

    const { data: mediaRow, error: insertError } = await supabaseAdmin
      .from("collision_media")
      .insert({
        service_request_id: serviceRequestId,
        file_url: urlData.publicUrl,
        file_name: file.name,
        file_type: fileType,
        mime_type: file.type,
        file_size: file.size,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return json({ error: "Database insert failed", details: insertError.message }, 500);
    }

    return json({
      id: mediaRow.id,
      file_url: urlData.publicUrl,
      file_name: file.name,
      file_type: fileType,
      mime_type: file.type,
      file_size: file.size,
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return json({ error: "Internal error", details: String(err) }, 500);
  }
});

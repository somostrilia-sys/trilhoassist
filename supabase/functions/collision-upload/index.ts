import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const serviceRequestId = formData.get("service_request_id") as string | null;
    const fileType = formData.get("file_type") as string | null;

    if (!file || !serviceRequestId || !fileType) {
      return new Response(JSON.stringify({ error: "Missing file, service_request_id or file_type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Validate: must be a collision with share_token
    const { data: sr } = await supabaseAdmin
      .from("service_requests")
      .select("id, service_type, share_token")
      .eq("id", serviceRequestId)
      .single();

    if (!sr || sr.service_type !== "collision" || !sr.share_token) {
      return new Response(JSON.stringify({ error: "Invalid service request" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upload to storage
    const ext = file.name.split(".").pop() || "bin";
    const path = `${serviceRequestId}/${fileType}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const { data: storageData, error: storageError } = await supabaseAdmin.storage
      .from("collision-media")
      .upload(path, file, { contentType: file.type });

    if (storageError) {
      console.error("Storage error:", storageError);
      return new Response(JSON.stringify({ error: "Storage upload failed", details: storageError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: urlData } = supabaseAdmin.storage.from("collision-media").getPublicUrl(storageData.path);

    // Insert into collision_media table
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
      return new Response(JSON.stringify({ error: "Database insert failed", details: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      id: mediaRow.id,
      file_url: urlData.publicUrl,
      file_name: file.name,
      file_type: fileType,
      mime_type: file.type,
      file_size: file.size,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal error", details: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

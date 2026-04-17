import { supabase } from "@/integrations/supabase/client";

interface SendCrmEventoParams {
  serviceRequestId: string;
  attendanceType: "collision" | "periferico";
  mediaFiles?: Array<{ url?: string; file_url?: string; type?: string; file_type?: string; name?: string; file_name?: string }>;
}

const vehicleCategoryMap: Record<string, string> = {
  car: "leve",
  motorcycle: "moto",
  truck: "pesado",
  van: "leve",
};

/**
 * Sends a service request to the CRM Eventos integration.
 * Only fires for clients matching "Objetivo Auto" (filter is also enforced server-side).
 * Non-blocking: errors are logged but don't throw.
 */
export async function sendCrmEvento({ serviceRequestId, attendanceType, mediaFiles = [] }: SendCrmEventoParams) {
  try {
    // Fetch service request data
    const { data: sr, error } = await supabase
      .from("service_requests")
      .select("protocol, requester_name, requester_phone, vehicle_plate, vehicle_model, vehicle_year, vehicle_category, origin_address, notes, clients(name)")
      .eq("id", serviceRequestId)
      .maybeSingle();

    if (error || !sr) {
      console.warn("sendCrmEvento: service request not found", error);
      return;
    }

    const clientName = (sr as any).clients?.name || "";
    if (!/objetivo/i.test(clientName)) {
      // Skip silently — not an Objetivo Auto client
      return;
    }

    const eventType = attendanceType === "periferico" ? "vidros" : "colisao";
    const description = [
      sr.notes || "",
      sr.vehicle_model ? `Modelo: ${sr.vehicle_model}` : "",
      sr.vehicle_year ? `Ano: ${sr.vehicle_year}` : "",
    ].filter(Boolean).join(" | ");

    const files = (mediaFiles || []).map((f) => ({
      url: f.url || f.file_url,
      type: f.type || f.file_type,
      name: f.name || f.file_name,
    })).filter((f) => f.url);

    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const res = await fetch(`https://${projectId}.supabase.co/functions/v1/crm-eventos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({
        event_type: eventType,
        plate: sr.vehicle_plate,
        associate_name: sr.requester_name,
        associate_phone: (sr.requester_phone || "").replace(/\D/g, ""),
        vehicle_category: vehicleCategoryMap[sr.vehicle_category || "car"] || "leve",
        location: sr.origin_address || "",
        description,
        external_reference: sr.protocol,
        files,
      }),
    });

    const result = await res.json();
    if (result.success) {
      console.log("sendCrmEvento: sent successfully", sr.protocol);
    } else if (result.skipped) {
      // Non-eligible client (server-side filter) — silent
    } else {
      console.warn("sendCrmEvento: response not ok", result);
    }
    return result;
  } catch (err) {
    console.error("sendCrmEvento error (non-blocking):", err);
  }
}

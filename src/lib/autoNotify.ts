import { supabase } from "@/integrations/supabase/client";

/**
 * Sends automated WhatsApp notifications to beneficiaries and providers
 * at different stages of the service lifecycle via Evolution API.
 * Fire-and-forget: errors are logged but don't block the flow.
 */
export async function sendAutoNotify(
  serviceRequestId: string,
  trigger:
    | "beneficiary_creation"
    | "beneficiary_dispatch"
    | "beneficiary_completion"
    | "provider_dispatch",
  options?: {
    provider_name?: string;
    provider_phone?: string;
    estimated_arrival_min?: number;
    provider_tracking_url?: string;
    beneficiary_tracking_url?: string;
    nps_link?: string;
  }
) {
  try {
    const { error } = await supabase.functions.invoke("auto-notify", {
      body: {
        service_request_id: serviceRequestId,
        trigger,
        ...(options || {}),
      },
    });
    if (error) {
      console.error("Auto-notify error:", error);
    }
  } catch (err) {
    console.error("Auto-notify invoke error:", err);
  }
}

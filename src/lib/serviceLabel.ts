import { supabase } from "@/integrations/supabase/client";

/**
 * Sends an automatic WhatsApp label to the client's group.
 * Fire-and-forget: errors are logged but don't block the flow.
 */
export async function sendServiceLabel(
  serviceRequestId: string,
  trigger: "creation" | "dispatch_preview" | "completion" | "cancellation",
  options?: {
    cancel_reason?: string;
    provider_id?: string;
    quoted_amount?: number;
  }
) {
  try {
    const { error } = await supabase.functions.invoke("service-label", {
      body: {
        service_request_id: serviceRequestId,
        trigger,
        ...(options || {}),
      },
    });
    if (error) {
      console.error("Service label error:", error);
    }
  } catch (err) {
    console.error("Service label invoke error:", err);
  }
}

/**
 * Extracts verification answers from WhatsApp conversation messages.
 * Supports two formats:
 * 1. Numbered form responses: "1-Sim 2-Não 3-Sim..." (preferred - complete checklist)
 * 2. Legacy question-answer pairs: outbound question → inbound answer
 */

import {
  type VehicleCategory,
  getQuestionsForCategory,
  parseNumberedResponse,
} from "./verificationFormMessages";

interface ExtractedData {
  vehicle_category?: VehicleCategory;
  service_type?: string;
  event_type?: string;
  vehicle_lowered?: boolean;
  difficult_access?: boolean;
  destination_address?: string;
  carVerification: Record<string, string>;
  motoVerification: Record<string, string>;
  truckVerification: Record<string, string>;
}

// Service type detection keywords
const SERVICE_TYPE_MAP: Record<string, string> = {
  "guincho|reboque|remoção|remover": "tow_light",
  "moto.*guincho|guincho.*moto|reboque.*moto": "tow_motorcycle",
  "pesado|caminhão.*guincho": "tow_heavy",
  "chaveiro|chave.*trancada|trancado": "locksmith",
  "pneu|estepe": "tire_change",
  "bateria|descarreg": "battery",
  "combustível|gasolina|diesel|sem.*combustível": "fuel",
  "hospedagem|hotel": "lodging",
  "colisão|abalro": "collision",
};

// Event type detection keywords
const EVENT_TYPE_MAP: Record<string, string> = {
  "pane.*mecânica|problema.*mecânic|motor": "mechanical_failure",
  "acidente|bateu|colidiu|colisão": "accident",
  "roubo|furto|roubado|furtado": "theft",
  "pneu.*furado|furo.*pneu": "flat_tire",
  "chave.*trancada|trancou|trancado": "locked_out",
  "bateria.*descarregada|sem.*bateria": "battery_dead",
  "sem.*combustível|acabou.*gasolina|acabou.*diesel": "fuel_empty",
};

// The verification form header marker (sent by our system)
const FORM_HEADER_PATTERN = /VERIFICAÇÃO\s+D[OA]\s+(VEÍCULO|MOTOCICLETA|CAMINHÃO)/i;

function normalizeText(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function matchesPattern(text: string, pattern: string): boolean {
  const normalized = normalizeText(text);
  const parts = pattern.split("|");
  return parts.some(part => {
    try {
      return new RegExp(normalizeText(part)).test(normalized);
    } catch {
      return normalized.includes(normalizeText(part));
    }
  });
}

function detectVehicleCategory(messages: any[]): VehicleCategory | undefined {
  const allText = messages.map(m => m.content || "").join(" ");
  const normalized = normalizeText(allText);
  if (/\bmoto\b|\bmotocicleta\b/.test(normalized)) return "motorcycle";
  if (/\bcaminhao\b|\bcaminhão\b|\bcarreta\b|\btruck\b|\bbitrem\b/.test(normalized)) return "truck";
  return undefined;
}

function detectFormCategory(text: string): VehicleCategory | null {
  const match = text.match(FORM_HEADER_PATTERN);
  if (!match) return null;
  const type = match[1].toUpperCase();
  if (type === "MOTOCICLETA") return "motorcycle";
  if (type === "CAMINHÃO") return "truck";
  return "car";
}

export function extractVerificationFromChat(messages: any[]): ExtractedData {
  const result: ExtractedData = {
    carVerification: {},
    motoVerification: {},
    truckVerification: {},
  };

  // Detect vehicle category
  result.vehicle_category = detectVehicleCategory(messages);

  // Detect service type and event type from all inbound messages
  const inboundTexts = messages
    .filter(m => m.direction === "inbound" && m.content)
    .map(m => m.content);

  const allInboundText = inboundTexts.join(" ");

  for (const [pattern, serviceType] of Object.entries(SERVICE_TYPE_MAP)) {
    if (matchesPattern(allInboundText, pattern)) {
      result.service_type = serviceType;
      break;
    }
  }

  for (const [pattern, eventType] of Object.entries(EVENT_TYPE_MAP)) {
    if (matchesPattern(allInboundText, pattern)) {
      result.event_type = eventType;
      break;
    }
  }

  // ===== PRIMARY: Scan for numbered form responses =====
  // Look for outbound message with form header, then the next inbound = numbered answers
  for (let i = 0; i < messages.length - 1; i++) {
    const msg = messages[i];
    if (msg.direction !== "outbound" || !msg.content) continue;

    const formCategory = detectFormCategory(msg.content);
    if (!formCategory) continue;

    // Find the next inbound message as the response
    for (let j = i + 1; j < messages.length; j++) {
      if (messages[j].direction === "inbound" && messages[j].content) {
        const parsed = parseNumberedResponse(messages[j].content, formCategory);
        if (parsed && Object.keys(parsed).length > 0) {
          // Map to the correct verification bucket
          if (formCategory === "car") {
            result.carVerification = { ...result.carVerification, ...parsed };
            if (parsed.vehicle_lowered) result.vehicle_lowered = parsed.vehicle_lowered === "yes";
            if (parsed.easy_access) result.difficult_access = parsed.easy_access !== "yes";
          } else if (formCategory === "motorcycle") {
            result.motoVerification = { ...result.motoVerification, ...parsed };
            if (parsed.easy_access) result.difficult_access = parsed.easy_access !== "yes";
          } else if (formCategory === "truck") {
            result.truckVerification = { ...result.truckVerification, ...parsed };
          }
          result.vehicle_category = formCategory;
        }
        break;
      }
    }
  }

  // ===== FALLBACK: Detect truck type from free text =====
  for (const msg of messages) {
    if (msg.direction !== "inbound" || !msg.content) continue;
    const truckTypeMatch = normalizeText(msg.content).match(/\b(toco|truck|carreta|bitrem|vanderleia|romeu.*julieta)\b/);
    if (truckTypeMatch && !result.truckVerification.truck_type) {
      result.truckVerification.truck_type = truckTypeMatch[0];
    }
  }

  return result;
}

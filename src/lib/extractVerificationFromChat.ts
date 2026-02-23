/**
 * Extracts verification answers and other structured data from WhatsApp conversation messages.
 * Scans outbound questions (quick replies) and the following inbound answers to map yes/no responses.
 */

interface ExtractedData {
  vehicle_category?: "car" | "motorcycle" | "truck";
  service_type?: string;
  event_type?: string;
  vehicle_lowered?: boolean;
  difficult_access?: boolean;
  destination_address?: string;
  carVerification: Record<string, string>;
  motoVerification: Record<string, string>;
  truckVerification: Record<string, string>;
}

// Maps question keywords to verification field names
const CAR_QUESTION_MAP: Record<string, string> = {
  "roda.*travada": "wheel_locked",
  "direção.*travada": "steering_locked",
  "blindado": "armored",
  "rebaixado": "vehicle_lowered",
  "carga|excesso de peso": "carrying_cargo",
  "fácil acesso": "easy_access",
  "restrição de altura": "height_restriction",
  "chave.*disponível|chave.*local": "key_available",
  "documentos.*local|documentos.*disponív": "documents_available",
  "passageiros": "has_passengers",
  "colisão|bateu|colidiu": "had_collision",
  "área de risco|emergencial": "risk_area",
  "liga.*inoperante|veículo liga": "vehicle_starts",
};

const MOTO_QUESTION_MAP: Record<string, string> = {
  "roda.*travada": "wheel_locked",
  "fácil acesso": "easy_access",
  "documentos.*chave|chave.*documento": "docs_key_available",
};

const TRUCK_QUESTION_MAP: Record<string, string> = {
  "carregado|carga": "loaded",
  "movimenta": "moves",
};

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

function isYesAnswer(text: string): boolean | null {
  const t = normalizeText(text.trim());
  if (/^(sim|s|yes|y|positivo|isso|exato|correto|verdade|1|👍|✅)$/i.test(t)) return true;
  if (/^(nao|n|no|não|negativo|nada|0|👎|❌|nenhum)$/i.test(t)) return false;
  // Check for "sim" or "não" within short responses
  if (t.length < 20) {
    if (/\bsim\b|\byes\b/.test(t)) return true;
    if (/\bnao\b|\bnão\b|\bno\b/.test(t)) return false;
  }
  return null;
}

function detectVehicleCategory(messages: any[]): "car" | "motorcycle" | "truck" | undefined {
  const allText = messages.map(m => m.content || "").join(" ");
  const normalized = normalizeText(allText);
  if (/\bmoto\b|\bmotocicleta\b/.test(normalized)) return "motorcycle";
  if (/\bcaminhao\b|\bcaminhão\b|\bcarreta\b|\btruck\b|\bbitrem\b/.test(normalized)) return "truck";
  // Default to car if vehicle mentioned but not moto/truck
  return undefined;
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

  // Scan for question-answer pairs (outbound question, next inbound = answer)
  for (let i = 0; i < messages.length - 1; i++) {
    const msg = messages[i];
    if (msg.direction !== "outbound" || !msg.content) continue;

    // Find the next inbound message as the answer
    let answer: any = null;
    for (let j = i + 1; j < messages.length; j++) {
      if (messages[j].direction === "inbound" && messages[j].content) {
        answer = messages[j];
        break;
      }
    }
    if (!answer) continue;

    const questionText = msg.content;
    const answerValue = isYesAnswer(answer.content);
    const yesNo = answerValue === true ? "yes" : answerValue === false ? "no" : null;

    if (yesNo === null) continue;

    // Match against car verification questions
    for (const [pattern, field] of Object.entries(CAR_QUESTION_MAP)) {
      if (matchesPattern(questionText, pattern)) {
        result.carVerification[field] = yesNo;
        // Special fields that map to form-level booleans
        if (field === "vehicle_lowered" && answerValue !== null) {
          result.vehicle_lowered = answerValue;
        }
        if (field === "easy_access" && answerValue !== null) {
          result.difficult_access = !answerValue;
        }
        break;
      }
    }

    // Match against motorcycle verification questions
    for (const [pattern, field] of Object.entries(MOTO_QUESTION_MAP)) {
      if (matchesPattern(questionText, pattern)) {
        result.motoVerification[field] = yesNo;
        if (field === "easy_access" && answerValue !== null) {
          result.difficult_access = !answerValue;
        }
        break;
      }
    }

    // Match against truck verification questions
    for (const [pattern, field] of Object.entries(TRUCK_QUESTION_MAP)) {
      if (matchesPattern(questionText, pattern)) {
        result.truckVerification[field] = yesNo;
        break;
      }
    }
  }

  // Also scan inbound messages for free-text answers about cargo type, truck type, etc.
  for (const msg of messages) {
    if (msg.direction !== "inbound" || !msg.content) continue;
    const text = msg.content;
    
    // Detect truck type from free text
    const truckTypeMatch = normalizeText(text).match(/\b(toco|truck|carreta|bitrem|vanderleia|romeu.*julieta)\b/);
    if (truckTypeMatch) {
      result.truckVerification.truck_type = truckTypeMatch[0];
    }
  }

  return result;
}

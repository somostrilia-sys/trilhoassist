/**
 * Builds complete numbered verification checklists to send as a single WhatsApp message.
 * The beneficiary responds with numbered answers: "1-Sim 2-Não 3-Sim..."
 */

export interface VerificationQuestion {
  field: string;
  label: string;
  type: "yes_no" | "text";
}

export const CAR_QUESTIONS: VerificationQuestion[] = [
  { field: "wheel_locked", label: "Alguma roda está travada ou o veículo não se movimenta?", type: "yes_no" },
  { field: "steering_locked", label: "O veículo está com a direção travada?", type: "yes_no" },
  { field: "armored", label: "O veículo é blindado?", type: "yes_no" },
  { field: "vehicle_lowered", label: "O veículo é rebaixado?", type: "yes_no" },
  { field: "carrying_cargo", label: "O veículo está transportando carga ou excesso de peso?", type: "yes_no" },
  { field: "easy_access", label: "O veículo está em local de fácil acesso (nível de rua)?", type: "yes_no" },
  { field: "height_restriction", label: "Há restrição de altura no local (ex: garagem)?", type: "yes_no" },
  { field: "key_available", label: "A chave do veículo está disponível?", type: "yes_no" },
  { field: "documents_available", label: "Os documentos do veículo estão no local?", type: "yes_no" },
  { field: "has_passengers", label: "Há passageiros no veículo?", type: "yes_no" },
  { field: "had_collision", label: "O veículo sofreu colisão?", type: "yes_no" },
  { field: "risk_area", label: "O veículo está em área de risco ou situação emergencial?", type: "yes_no" },
  { field: "vehicle_starts", label: "O veículo liga?", type: "yes_no" },
];

export const MOTORCYCLE_QUESTIONS: VerificationQuestion[] = [
  { field: "wheel_locked", label: "A motocicleta está com roda travada?", type: "yes_no" },
  { field: "easy_access", label: "A motocicleta está em local de fácil acesso para remoção?", type: "yes_no" },
  { field: "docs_key_available", label: "Os documentos e a chave estão no local?", type: "yes_no" },
];

export const TRUCK_QUESTIONS: VerificationQuestion[] = [
  { field: "truck_type", label: "Qual o tipo de caminhão? (Toco, Truck, Carreta, Bitrem...)", type: "text" },
  { field: "loaded", label: "O caminhão está carregado?", type: "yes_no" },
  { field: "moves", label: "O caminhão se movimenta?", type: "yes_no" },
];

export type VehicleCategory = "car" | "motorcycle" | "truck";

export function getQuestionsForCategory(category: VehicleCategory): VerificationQuestion[] {
  switch (category) {
    case "car": return CAR_QUESTIONS;
    case "motorcycle": return MOTORCYCLE_QUESTIONS;
    case "truck": return TRUCK_QUESTIONS;
  }
}

const CATEGORY_LABELS: Record<VehicleCategory, string> = {
  car: "VEÍCULO",
  motorcycle: "MOTOCICLETA",
  truck: "CAMINHÃO",
};

/**
 * Builds the formatted WhatsApp message with all numbered questions.
 */
export function buildVerificationFormMessage(category: VehicleCategory): string {
  const questions = getQuestionsForCategory(category);
  const label = CATEGORY_LABELS[category];

  const header = `📋 *VERIFICAÇÃO DO ${label}*\n\nPor favor, responda cada item com *Sim* ou *Não* (ou o texto solicitado).\nResponda no formato: *1-Sim 2-Não 3-Sim ...*\n`;

  const body = questions
    .map((q, i) => {
      const hint = q.type === "text" ? " _(digite a resposta)_" : " _(Sim/Não)_";
      return `*${i + 1}.* ${q.label}${hint}`;
    })
    .join("\n");

  const footer = `\n\n_Exemplo de resposta: 1-Sim 2-Não 3-Sim${questions.length > 3 ? " ..." : ""}_`;

  return `${header}\n${body}${footer}`;
}

/**
 * Parses a numbered response like "1-Sim 2-Não 3-Sim 4-Toco" into field→value map.
 */
export function parseNumberedResponse(
  text: string,
  category: VehicleCategory
): Record<string, string> | null {
  const questions = getQuestionsForCategory(category);
  const result: Record<string, string> = {};

  // Normalize
  const normalized = text.trim().toLowerCase();

  // Try to match patterns like "1-sim", "1 sim", "1. sim", "1) sim"
  const itemPattern = /(\d+)\s*[\-\.\)\:\s]\s*([^\d]+?)(?=\s+\d+[\-\.\)\:\s]|$)/gi;
  const matches = [...normalized.matchAll(itemPattern)];

  if (matches.length === 0) {
    // Try simpler format: just space-separated "sim não sim não"
    const words = normalized.split(/[\s,;]+/).filter(Boolean);
    if (words.length >= questions.length) {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const w = words[i];
        if (q.type === "yes_no") {
          result[q.field] = isYes(w) ? "yes" : isNo(w) ? "no" : w;
        } else {
          result[q.field] = w;
        }
      }
      return Object.keys(result).length > 0 ? result : null;
    }
    return null;
  }

  for (const match of matches) {
    const num = parseInt(match[1], 10);
    const answer = match[2].trim();
    const idx = num - 1;
    if (idx < 0 || idx >= questions.length) continue;

    const q = questions[idx];
    if (q.type === "yes_no") {
      result[q.field] = isYes(answer) ? "yes" : isNo(answer) ? "no" : answer;
    } else {
      result[q.field] = answer;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

function isYes(text: string): boolean {
  return /^(sim|s|yes|y|positivo|isso|exato|correto|verdade|1|👍|✅)$/i.test(text.trim());
}

function isNo(text: string): boolean {
  return /^(nao|n|no|não|negativo|nada|0|👎|❌|nenhum)$/i.test(text.trim());
}

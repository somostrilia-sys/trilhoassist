/**
 * Vehicle category classification for plans.
 * Maps internal vehicle_category (car/motorcycle/truck) + vehicle model
 * to plan vehicle categories used by the Objetivo system.
 */

export const PLAN_VEHICLE_CATEGORIES = [
  { value: "all", label: "Todos os Tipos" },
  { value: "automobile", label: "Automóvel" },
  { value: "utility", label: "Utilitários" },
  { value: "motorcycle", label: "Motocicleta" },
  { value: "heavy", label: "Pesados" },
  { value: "van_heavy_pp", label: "Vans e Pesados P.P" },
] as const;

export type PlanVehicleCategory = (typeof PLAN_VEHICLE_CATEGORIES)[number]["value"];

export const PLAN_VEHICLE_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  PLAN_VEHICLE_CATEGORIES.map((c) => [c.value, c.label])
);

/**
 * Known utility/SUV/pickup models (Brazilian market).
 */
const UTILITY_PATTERNS = [
  /hilux/i, /s10/i, /s-10/i, /ranger/i, /amarok/i, /frontier/i, /l200/i,
  /triton/i, /saveiro/i, /strada/i, /toro/i, /montana/i, /oroch/i,
  /compass/i, /renegade/i, /commander/i, /tracker/i, /creta/i, /tucson/i,
  /sportage/i, /rav4/i, /cr-v/i, /crv/i, /hr-v/i, /hrv/i, /kicks/i,
  /duster/i, /captur/i, /ecosport/i, /t-cross/i, /tcross/i, /taos/i,
  /tiggo/i, /territory/i, /bronco/i, /maverick/i, /pajero/i,
  /sw4/i, /land cruiser/i, /wrangler/i, /cherokee/i, /discovery/i,
  /defender/i, /sorento/i, /outlander/i, /xtrail/i, /x-trail/i,
  /jimny/i, /vitara/i, /tiguan/i, /q3/i, /q5/i, /q7/i,
  /x1/i, /x3/i, /x5/i, /glc/i, /gle/i, /gla/i, /ex30/i, /ex90/i,
  /rampage/i, /titano/i, /actyon/i, /rexton/i, /korando/i,
];

/**
 * Known van / small truck models.
 */
const VAN_HEAVY_PP_PATTERNS = [
  /sprinter/i, /master/i, /ducato/i, /boxer/i, /daily/i,
  /transit/i, /hr\b/i, /bongo/i, /kia\s*k\s*2500/i, /k2500/i,
  /iveco/i, /fiorino/i, /kangoo/i, /partner/i, /berlingo/i,
  /van/i, /kombi/i, /trafic/i, /expert/i, /jumpy/i, /jumper/i,
  /3\/4/i, /\bvuc\b/i,
];

/**
 * Known heavy truck models / brands.
 */
const HEAVY_PATTERNS = [
  /scania/i, /volvo\s*(fh|fm|fmx|fe|fl|vm|nl)/i, /mercedes.*benz.*(atego|axor|actros|arocs)/i,
  /man\s*(tgx|tgs|tgm|tgl)/i, /daf\s*(xf|cf|lf)/i,
  /ford\s*cargo/i, /volkswagen.*(constellation|delivery|worker|volksbus)/i,
  /vw.*(constellation|delivery|worker|volksbus)/i,
  /constellation/i, /delivery/i, /worker/i,
  /iveco.*(tector|cursor|stralis|hi-way|hiway|daily\s*\d{2})/i,
  /carreta/i, /bitrem/i, /rodotrem/i, /treminhao/i, /treminhão/i,
  /cavalo\s*mec/i, /caminhão/i, /caminhao/i,
];

/**
 * Known motorcycle brands/models.
 */
const MOTORCYCLE_PATTERNS = [
  /honda.*(cg|cb|cbr|xre|pop|biz|bros|pcx|elite|sh|adv|nc|ctx|africa)/i,
  /yamaha.*(factor|fazer|ybr|lander|crosser|mt|r1|r3|r6|xtz|nmax|neo|fluo|tracer|tenere)/i,
  /suzuki.*(yes|intruder|gsx|v-strom|vstrom|hayabusa|burgman|dl)/i,
  /kawasaki.*(ninja|z\d|versys|vulcan|er-6|er6|zx)/i,
  /bmw.*(gs|rt|rs|rr|f\d|g\d|r\d|s\d|c\d)/i,
  /ducati/i, /triumph/i, /harley/i, /royal\s*enfield/i,
  /moto/i, /motocicleta/i, /scooter/i, /ciclomotor/i, /triciclo/i,
  /\b(cg|cb|cbr|xre|biz|bros|pcx)\s*\d/i,
  /\b(factor|fazer|lander|crosser|mt)\s*\d/i,
];

/**
 * Classifies a vehicle into a plan vehicle category based on its model string
 * and the internal vehicle_category (car/motorcycle/truck).
 */
export function classifyVehicle(
  model: string | null | undefined,
  internalCategory?: "car" | "motorcycle" | "truck" | string | null
): PlanVehicleCategory {
  // If internal category is motorcycle or truck, use that as strong signal
  if (internalCategory === "motorcycle") return "motorcycle";
  if (internalCategory === "truck") return "heavy";

  if (!model) return "automobile"; // default for cars

  // Check motorcycle first
  if (MOTORCYCLE_PATTERNS.some((p) => p.test(model))) return "motorcycle";

  // Check heavy trucks
  if (HEAVY_PATTERNS.some((p) => p.test(model))) return "heavy";

  // Check vans / small heavy
  if (VAN_HEAVY_PP_PATTERNS.some((p) => p.test(model))) return "van_heavy_pp";

  // Check utilities (SUVs, pickups)
  if (UTILITY_PATTERNS.some((p) => p.test(model))) return "utility";

  // Default: automobile
  return "automobile";
}

/**
 * Returns the plan vehicle categories that are compatible with a given classification.
 * "all" plans are always compatible.
 */
export function getCompatiblePlanCategories(vehicleCategory: PlanVehicleCategory): string[] {
  return ["all", vehicleCategory];
}

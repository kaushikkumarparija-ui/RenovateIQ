// The RenovateIQ planning system prompt + the JSON schema we enforce via
// structured outputs. The AI supplies durations, costs and the dependency
// graph; JS computes every total, date and the critical path (see plan-compute).

import type { ProjectRow, PlanRisk, HomeAge } from "./types";

export const PLAN_SYSTEM_PROMPT = `You are RenovateIQ's renovation planning AI for the Indian market.
You function as the homeowner's architect, project manager, and
cost advisor — replacing the need for a paid architect consultation.
Your plans must be accurate enough that a homeowner would make a
real financial decision based on them.

INDIAN MARKET COST BENCHMARKS:
Kitchen renovation: ₹1,500–₹3,500 per sqft depending on finish level
Bathroom renovation: ₹80,000–₹2,50,000 depending on size and finish
Living room renovation: ₹1,000–₹2,500 per sqft
Bedroom renovation: ₹80,000–₹2,00,000
Full home renovation: ₹1,200–₹3,000 per sqft
Labour rate metro cities: ₹800–₹1,200 per day per worker
Labour rate tier 2 cities: ₹600–₹900 per day per worker
Labour rate tier 3 cities: ₹400–₹700 per day per worker
Modular kitchen (budget): ₹1,20,000–₹1,80,000
Modular kitchen (mid): ₹1,80,000–₹2,80,000
Modular kitchen (premium): ₹2,80,000–₹4,50,000
Italian marble flooring: ₹180–₹350 per sqft supply only
Vitrified tiles (standard): ₹45–₹90 per sqft
Vitrified tiles (premium): ₹90–₹180 per sqft
Electrical work kitchen/bath: ₹15,000–₹60,000
Full home electrical upgrade: ₹40,000–₹1,50,000
Plumbing kitchen/bath: ₹20,000–₹80,000
Waterproofing per sqft: ₹80–₹150
False ceiling per sqft: ₹180–₹350
Painting per sqft: ₹18–₹35 (walls and ceiling)
Granite countertop per sqft: ₹150–₹400
Quartz countertop per sqft: ₹250–₹550
Structural wall removal: ₹15,000–₹40,000 including debris
Interior door replacement: ₹8,000–₹25,000 per door
Window replacement: ₹6,000–₹20,000 per window

TASK SEQUENCES BY PROJECT TYPE:

Kitchen:
1. Site measurement and design finalisation
2. Demolition and debris removal
3. Civil and masonry work (if layout changes)
4. Electrical rough-in — before walls close
5. Plumbing rough-in — before walls close
6. Waterproofing (if wet area involved)
7. Wall tiling
8. Floor tiling
9. Modular kitchen installation
10. Electrical fit-out (switches, chimney, hob, oven points)
11. Plumbing fit-out (sink, fixtures)
12. Painting and touch-up
13. Deep clean and handover

Bathroom:
1. Site measurement
2. Demolition
3. Civil and masonry
4. Plumbing rough-in
5. Electrical rough-in
6. Waterproofing — critical, minimum 3 coats, 48hr cure each
7. Wall tiling
8. Floor tiling
9. Electrical fit-out (exhaust, geyser point, lighting)
10. Plumbing fit-out (WC, basin, shower, accessories)
11. Painting
12. Deep clean and handover

Living Room:
1. Site measurement
2. Demolition (if false ceiling or feature wall)
3. Electrical rough-in (for new points)
4. False ceiling framework and boarding
5. Electrical fit-out (lights, fan, AC points)
6. Wall treatment (paint or wallpaper or panelling)
7. Flooring (if replacing)
8. Carpentry (TV unit, shelving, storage)
9. Final painting and touch-up
10. Deep clean and handover

Bedroom:
1. Site measurement
2. Demolition (if false ceiling or built-ins being removed)
3. Electrical rough-in (for new points, bedside, AC)
4. False ceiling framework and boarding (if any)
5. Electrical fit-out (lights, fan, AC, switches)
6. Wall treatment (paint, wallpaper or panelling)
7. Flooring (if replacing)
8. Carpentry (wardrobe, storage, headboard, study unit)
9. Final painting and touch-up
10. Deep clean and handover

Full Home: combine the above sequences, coordinating
trades across rooms to avoid conflicts and overlap.

HIDDEN CONDITION RULES — apply automatically:
- Home age 15–30 years: flag probable electrical rewiring
  need, add ₹30,000–₹80,000 and 5–7 days
- Home age 30+ years: flag probable full plumbing replacement
  add ₹50,000–₹1,20,000; flag asbestos inspection
  recommendation for ceilings and floor adhesives
- Any bathroom project: waterproofing failure is the single
  most expensive callback — flag as critical path, never
  allow it to be value-engineered out
- Moving sink or toilet: requires breaking floor,
  add ₹15,000–₹25,000 and 3–5 days minimum
- Moving kitchen to different room: flag structural
  assessment requirement before pricing
- Ground floor or basement: flag rising damp inspection
- Top floor: flag roof waterproofing check before
  internal work begins
- Mentions Italian marble: flag 4–6 week procurement
  lead time, order before any other work begins
- Mentions imported fixtures (Kohler, Grohe, Hansgrohe,
  Duravit): flag 3–5 week lead time and import
  availability risk
- Budget appears low for stated scope: flag explicitly
  with honest reasoning in honest_assessment and set
  budget.budget_realistic to false — do not pretend a
  plan can be executed in the stated budget when it cannot

PERMIT RULES FOR INDIA:
Standard interior renovation: no permit required in most
Indian municipalities.
Flag permit requirement for: structural wall removal,
change in building footprint, facade changes, addition
of floor or mezzanine, commercial property conversion.
Recommend homeowner consult local municipal office or
licensed structural engineer for flagged items.

CONTRACTOR MARKET KNOWLEDGE:
Indian contractors quote in three ways: lump sum (most
common, highest risk for homeowners), rate per sqft
(medium transparency), itemised (rare, highest
transparency). Structure the budget so homeowners can
compare any quote received against your breakdown.
Payment in India typically flows: 30% advance, 30% at
midpoint, 30% near completion, 10% on handover.
Flag if any contractor requests more than 40% advance
as a high risk item.
Most contractor delays in India are caused by: homeowner
selection delays (tiles, fittings not chosen on time),
material non-availability, labour reallocation to other
sites, monsoon season overlap.

MONSOON RISK:
If the project start date falls between June and September,
flag monsoon risk automatically: material delays, labour
reallocation, waterproofing cure time affected by humidity,
outdoor debris removal delayed by rain. Recommend starting
no later than March or pushing start to October. Always
include a prominent monsoon risk entry in that case.

CITY-SPECIFIC KNOWLEDGE:
Metro cities (Bengaluru, Mumbai, Delhi, Hyderabad, Chennai,
Kolkata, Pune, Ahmedabad, Surat, Jaipur, Lucknow, Kanpur,
Nagpur, Indore, Thane): apply metro labour rates, highest
material costs.
Tier 2 cities (Bhopal, Visakhapatnam, Patna, Vadodara,
Ghaziabad, Ludhiana, Agra, Nashik, Faridabad, Meerut,
Rajkot, Kalyan, Vasai-Virar, Coimbatore, Madurai): apply
tier 2 labour rates, 10–15% lower material costs than metro.
Tier 3 cities (Mysuru, Bhubaneswar, Ranchi, Dehradun,
Jodhpur, Raipur, Kota, Guwahati, Chandigarh, Amritsar,
Jammu, Udaipur, Aurangabad, Jabalpur, Trichy): apply tier
3 labour rates, 15–25% lower material costs than metro,
flag potential material availability risk for premium or
imported items.

OUTPUT CONTRACT:
Return a single JSON object matching the provided schema.
- Give per-task cost ranges (cost_min/cost_max) and a
  duration in days. Do NOT try to make per-task costs sum
  exactly to your budget block — the client computes totals.
- predecessors must reference ids that exist in tasks and
  must not form a cycle. Use short ids like "t1","t2".
- is_critical is a hint only; the client recomputes the
  real critical path from the dependency graph.
- order_by_day in procurement is an offset in days from the
  project start (it may be negative for long-lead items that
  must be ordered before work begins).
- deadline_day in decision_queue is an offset in days from start.
- budget.budget_realistic must be a literal boolean: false if
  the stated budget is insufficient or likely insufficient for
  this scope/city even with compromises, true only if a homeowner
  could realistically get this scope done within budget. Decide
  this independently of the numeric ranges — the client cross-checks
  your numbers separately.
- budget.honest_assessment must be direct about whether the
  stated budget is realistic for this scope in this city.
- contractor_brief is one paragraph addressed to the
  contractor, summarising scope, ceiling, timeline and key
  requirements.
Every estimate is an AI projection for planning, not a
substitute for an on-site survey.`;

// JSON schema enforced by output_config.format (strict structured outputs).
export const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "project_summary",
    "hidden_conditions",
    "tasks",
    "procurement",
    "budget",
    "risks",
    "decision_queue",
    "contractor_brief",
  ],
  properties: {
    project_summary: { type: "string" },
    hidden_conditions: { type: "array", items: { type: "string" } },
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "name",
          "duration_days",
          "predecessors",
          "trade",
          "cost_min",
          "cost_max",
          "is_critical",
          "reasoning",
        ],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          duration_days: { type: "number" },
          predecessors: { type: "array", items: { type: "string" } },
          trade: { type: "string" },
          cost_min: { type: "number" },
          cost_max: { type: "number" },
          is_critical: { type: "boolean" },
          reasoning: { type: "string" },
        },
      },
    },
    procurement: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["item", "order_by_day", "lead_days", "cost_min", "cost_max", "reason"],
        properties: {
          item: { type: "string" },
          order_by_day: { type: "number" },
          lead_days: { type: "number" },
          cost_min: { type: "number" },
          cost_max: { type: "number" },
          reason: { type: "string" },
        },
      },
    },
    budget: {
      type: "object",
      additionalProperties: false,
      required: [
        "labour_min",
        "labour_max",
        "materials_min",
        "materials_max",
        "total_min",
        "total_max",
        "contingency_pct",
        "buffer_recommended",
        "buffer_reasoning",
        "ceiling",
        "budget_realistic",
        "honest_assessment",
      ],
      properties: {
        labour_min: { type: "number" },
        labour_max: { type: "number" },
        materials_min: { type: "number" },
        materials_max: { type: "number" },
        total_min: { type: "number" },
        total_max: { type: "number" },
        contingency_pct: { type: "number" },
        buffer_recommended: { type: "number" },
        buffer_reasoning: { type: "string" },
        ceiling: { type: "number" },
        budget_realistic: { type: "boolean" },
        honest_assessment: { type: "string" },
      },
    },
    risks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["risk", "likelihood", "impact", "mitigation"],
        properties: {
          risk: { type: "string" },
          likelihood: { type: "string", enum: ["High", "Medium", "Low"] },
          impact: { type: "string", enum: ["High", "Medium", "Low"] },
          mitigation: { type: "string" },
        },
      },
    },
    decision_queue: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["decision", "deadline_day", "consequence"],
        properties: {
          decision: { type: "string" },
          deadline_day: { type: "number" },
          consequence: { type: "string" },
        },
      },
    },
    contractor_brief: { type: "string" },
  },
} as const;

// Literal JSON skeleton appended to the user message. The model returns JSON
// (responseMimeType), and this pins the exact keys/types so every field the
// client needs is present. JS still computes all totals, dates and the
// critical path — the model only supplies durations, costs and the graph.
export const PLAN_JSON_SHAPE = `Return ONLY a single JSON object with EXACTLY this shape (no markdown, no commentary):
{
  "project_summary": "string — 2-3 sentence overview",
  "hidden_conditions": ["string — flagged probable hidden issues for this home age/scope"],
  "tasks": [
    {
      "id": "t1",
      "name": "string",
      "duration_days": 0,
      "predecessors": ["t-ids that exist above this task; no cycles"],
      "trade": "string e.g. Civil, Electrical, Plumbing, Tiling, Carpentry, Painting",
      "cost_min": 0,
      "cost_max": 0,
      "is_critical": false,
      "reasoning": "string — one line why this task/estimate"
    }
  ],
  "procurement": [
    { "item": "string", "order_by_day": 0, "lead_days": 0, "cost_min": 0, "cost_max": 0, "reason": "string" }
  ],
  "budget": {
    "labour_min": 0, "labour_max": 0,
    "materials_min": 0, "materials_max": 0,
    "total_min": 0, "total_max": 0,
    "contingency_pct": 10,
    "buffer_recommended": 0,
    "buffer_reasoning": "string",
    "ceiling": 0,
    "budget_realistic": true,
    "honest_assessment": "string — direct on whether the stated budget is realistic for this scope in this city"
  },
  "risks": [
    { "risk": "string", "likelihood": "High|Medium|Low", "impact": "High|Medium|Low", "mitigation": "string" }
  ],
  "decision_queue": [
    { "decision": "string", "deadline_day": 0, "consequence": "string" }
  ],
  "contractor_brief": "string — one paragraph to the contractor: scope, ceiling, timeline, key requirements"
}
All numeric fields must be plain numbers (no commas, no currency symbol). Use short ids like "t1","t2" and make every predecessor reference an id that exists. budget_realistic must be a literal true/false (not a string), set independently of the numeric ranges above.`;

export function buildPlanUserMessage(p: ProjectRow): string {
  return [
    `Project type: ${p.type}`,
    `City: ${p.city}`,
    `Home age: ${p.home_age}`,
    `Area: ${p.area_sqft} sqft`,
    `Budget: ₹${p.budget_input.toLocaleString("en-IN")}`,
    `Target start date: ${p.start_date}`,
    `Specific asks: ${p.specific_asks || "none stated"}`,
    "",
    "Produce the full RenovateIQ plan for this project as JSON.",
  ].join("\n");
}

/**
 * Budget is "tight" if the stated budget is below the (client-recomputed) low
 * estimate, OR the AI directly judged it unrealistic via budget_realistic.
 * The AI's boolean is a direct judgment call, not inferred from its prose —
 * the numeric check is JS's independent cross-check on that judgment.
 */
export function assessBudgetTight(
  budgetRealistic: boolean,
  budgetInput: number,
  totalMin: number,
): boolean {
  if (budgetInput > 0 && totalMin > 0 && budgetInput < totalMin) return true;
  return !budgetRealistic;
}

/**
 * Hidden conditions are free-text from the model, and it sometimes applies an
 * age-scoped rule outside its stated bracket — e.g. flagging electrical
 * rewiring for a 5-15yr home, when the prompt scopes that rule to 15-30yr
 * and 30+yr only. This strips conditions that name a rule the home's actual
 * age doesn't trigger, rather than showing the homeowner a flag that
 * contradicts the system's own stated rule. It can't retroactively correct
 * any cost the model folded into its budget for a condition it shouldn't
 * have flagged — only the displayed text.
 */
export function filterHiddenConditions(homeAge: HomeAge, conditions: string[]): string[] {
  const rewiringApplies = homeAge === "15–30yr" || homeAge === "30+yr";
  const plumbingOrAsbestosApplies = homeAge === "30+yr";

  return conditions.filter((c) => {
    const lower = c.toLowerCase();
    if (!rewiringApplies && lower.includes("rewiring")) return false;
    if (!plumbingOrAsbestosApplies && (lower.includes("plumbing replacement") || lower.includes("asbestos"))) {
      return false;
    }
    return true;
  });
}

/**
 * The prompt instructs the model to "always include a prominent monsoon risk
 * entry" when start_date falls in June-September, but that's a model
 * instruction, not a guarantee — same gap assessBudgetTight closes for
 * budget_realistic. This is the deterministic backstop: if the AI didn't
 * flag it, inject it server-side so the safety promise never depends on the
 * model remembering.
 */
export function ensureMonsoonRisk(startDate: string, risks: PlanRisk[]): PlanRisk[] {
  const month = new Date(startDate).getUTCMonth() + 1; // 1-12
  if (month < 6 || month > 9) return risks;

  const alreadyFlagged = risks.some(
    (r) =>
      r.risk.toLowerCase().includes("monsoon") ||
      r.mitigation.toLowerCase().includes("monsoon"),
  );
  if (alreadyFlagged) return risks;

  return [
    {
      risk: "Monsoon season overlap",
      likelihood: "High",
      impact: "Medium",
      mitigation:
        "The start date falls in the June-September monsoon window. Expect material delivery delays, labour reallocation to other sites, and slower waterproofing cure times. Consider shifting the start before March or after October if the schedule allows.",
    },
    ...risks,
  ];
}

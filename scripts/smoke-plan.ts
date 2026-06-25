// Standalone smoke test: replicates the exact plan-generation call from
// src/app/api/plan/route.ts (Google Gemini, free tier), then runs the full
// sanitize -> schedule -> budget pipeline on the result.
// Run:  node scripts/smoke-plan.ts
import {
  PLAN_SYSTEM_PROMPT,
  PLAN_JSON_SHAPE,
  buildPlanUserMessage,
  assessBudgetTight,
} from "../src/lib/plan-prompt.ts";
import { sanitizeTasks, schedule, computeBudget } from "../src/lib/plan-compute.ts";
import { geminiGenerate, parseGeminiJson, geminiModel } from "../src/lib/gemini.ts";

try {
  process.loadEnvFile(".env.local");
} catch {}

// Canonical Definition-of-Done project: Bengaluru kitchen, tight budget,
// monsoon-window start, sink move (should trigger hidden-condition + monsoon flags).
const project = {
  id: "smoke",
  type: "Kitchen",
  city: "Bengaluru",
  home_age: "10-20 years",
  area_sqft: 120,
  budget_input: 250000,
  start_date: "2026-07-15",
  specific_asks: "Modular kitchen with granite countertop, move the sink to the window wall.",
};

console.log(`Model: ${geminiModel()}`);
console.log("Calling Gemini (responseMimeType=application/json)...");
const t0 = Date.now();

const raw = await geminiGenerate({
  system: PLAN_SYSTEM_PROMPT,
  user: `${buildPlanUserMessage(project)}\n\n${PLAN_JSON_SHAPE}`,
  json: true,
  maxOutputTokens: 8192,
  temperature: 0.4,
});

const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`Returned in ${secs}s.`);

const plan = parseGeminiJson(raw);
plan.tasks = sanitizeTasks(plan.tasks || []);

const sched = schedule(plan.tasks);
const budget = computeBudget(plan, new Set(plan.tasks.map((t) => t.id)));
plan.budget_tight = assessBudgetTight(
  plan.budget?.budget_realistic ?? true,
  project.budget_input,
  budget.totalMin,
);

console.log("\n=== PARSED + COMPUTED ===");
console.log(`tasks: ${plan.tasks.length}`);
console.log(`hidden_conditions: ${(plan.hidden_conditions || []).length}`);
console.log(`risks: ${(plan.risks || []).length}`);
console.log(`procurement: ${(plan.procurement || []).length}`);
console.log(`decision_queue: ${(plan.decision_queue || []).length}`);
console.log(`project duration (CPM): ${sched.totalDuration} days`);
console.log(
  `critical-path tasks: ${sched.tasks.filter((t) => t.critical).map((t) => t.id).join(", ")}`,
);
console.log(
  `budget total: Rs ${budget.totalMin.toLocaleString("en-IN")} - Rs ${budget.totalMax.toLocaleString("en-IN")}`,
);
console.log(`ceiling: Rs ${budget.ceiling.toLocaleString("en-IN")}`);
console.log(`budget_tight: ${plan.budget_tight}`);
console.log(`budget_realistic (AI's direct judgment): ${plan.budget?.budget_realistic}`);
console.log(`\nhonest_assessment: ${plan.budget?.honest_assessment}`);
const monsoon = (plan.risks || []).find((r) =>
  (r.risk || "").toLowerCase().includes("monsoon"),
);
console.log(`monsoon risk flagged: ${monsoon ? "YES — " + monsoon.risk : "NO"}`);
console.log("\nSMOKE TEST PASSED");

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PLAN_SYSTEM_PROMPT,
  PLAN_JSON_SHAPE,
  buildPlanUserMessage,
  assessBudgetTight,
  ensureMonsoonRisk,
  filterHiddenConditions,
} from "@/lib/plan-prompt";
import { sanitizeTasks, computeBudget } from "@/lib/plan-compute";
import { geminiGenerate, parseGeminiJson } from "@/lib/gemini";
import type { ProjectRow, RenovationPlan, PlanBudget } from "@/lib/types";

// Plan generation can take a while; keep headroom for the model round-trip.
export const maxDuration = 120;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Gemini's JSON mode should return real booleans, but coerce defensively —
// a stray string "false" must not silently invert this safety check.
function bool(v: unknown): boolean {
  if (typeof v === "string") return v.trim().toLowerCase() === "true";
  return Boolean(v);
}

// Ensure every PlanBudget field exists and is the right type, so the Budget tab
// never renders undefined even if the model omits a field.
function normalizeBudget(b: Partial<PlanBudget> | undefined): PlanBudget {
  return {
    labour_min: num(b?.labour_min),
    labour_max: num(b?.labour_max),
    materials_min: num(b?.materials_min),
    materials_max: num(b?.materials_max),
    total_min: num(b?.total_min),
    total_max: num(b?.total_max),
    contingency_pct: b?.contingency_pct != null ? num(b.contingency_pct) : 10,
    buffer_recommended: num(b?.buffer_recommended),
    buffer_reasoning: b?.buffer_reasoning || "",
    ceiling: num(b?.ceiling),
    budget_realistic: b?.budget_realistic != null ? bool(b.budget_realistic) : true,
    honest_assessment: b?.honest_assessment || "",
  };
}

export async function POST(req: Request) {
  let projectId: string | undefined;
  try {
    ({ projectId } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured on the server." },
      { status: 500 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // RLS guarantees the homeowner can only read their own project.
  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();
  if (error || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const p = project as ProjectRow;

  let plan: RenovationPlan;
  try {
    const raw = await geminiGenerate({
      system: PLAN_SYSTEM_PROMPT,
      user: `${buildPlanUserMessage(p)}\n\n${PLAN_JSON_SHAPE}`,
      json: true,
      maxOutputTokens: 16384,
      temperature: 0.4,
    });

    const parsed = parseGeminiJson<RenovationPlan>(raw);

    parsed.project_summary = parsed.project_summary || "";
    parsed.tasks = sanitizeTasks(parsed.tasks || []);
    parsed.hidden_conditions = filterHiddenConditions(p.home_age, parsed.hidden_conditions || []);
    parsed.procurement = parsed.procurement || [];
    parsed.risks = ensureMonsoonRisk(p.start_date, parsed.risks || []);
    parsed.decision_queue = parsed.decision_queue || [];
    parsed.contractor_brief = parsed.contractor_brief || "";
    parsed.budget = normalizeBudget(parsed.budget);
    const recomputedTotalMin = computeBudget(
      parsed,
      new Set(parsed.tasks.map((t) => t.id)),
    ).totalMin;
    parsed.budget_tight = assessBudgetTight(
      parsed.budget.budget_realistic,
      p.budget_input,
      recomputedTotalMin,
    );

    if (!parsed.tasks.length) {
      throw new Error("Plan came back with no tasks.");
    }
    plan = parsed;
  } catch (e) {
    console.error("Plan generation failed:", e);
    return NextResponse.json(
      { error: `Plan generation failed: ${(e as Error).message}` },
      { status: 502 },
    );
  }

  const { error: updateErr } = await supabase
    .from("projects")
    .update({ ai_plan: plan, status: "planned" })
    .eq("id", p.id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ plan });
}

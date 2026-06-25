import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProjectRow, RenovationPlan } from "@/lib/types";
import { formatINR } from "@/lib/format";
import { geminiGenerate } from "@/lib/gemini";

export const maxDuration = 60;

const SYSTEM = `You are RenovateIQ's planning AI answering a homeowner's
"what-if" question about an already-generated renovation plan.
Answer ONLY with the likely cost impact and timeline impact of their
question — do not regenerate the plan or restate the whole budget.
Be direct and specific, use ₹ ranges (Indian formatting), and keep it
to 2–4 short sentences. If the change is risky or commonly underestimated,
say so in one line. Every figure is an AI projection, not a quote.`;

export async function POST(req: Request) {
  let body: { projectId?: string; question?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { projectId, question } = body;
  if (!projectId || !question?.trim()) {
    return NextResponse.json({ error: "Missing projectId or question" }, { status: 400 });
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
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();
  if (error || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const p = project as ProjectRow;
  const plan = p.ai_plan as RenovationPlan | null;
  if (!plan) {
    return NextResponse.json({ error: "No plan to reason about yet." }, { status: 400 });
  }

  const taskLines = plan.tasks
    .map(
      (t) =>
        `- ${t.name} (${t.trade}): ${formatINR(t.cost_min)}–${formatINR(
          t.cost_max,
        )}, ${t.duration_days}d`,
    )
    .join("\n");

  const context = `Project: ${p.type} in ${p.city}, ${p.area_sqft} sqft, ${p.home_age} home, start ${p.start_date}.
Stated budget: ${formatINR(p.budget_input)}.
Current scope total: ${formatINR(plan.budget.total_min)}–${formatINR(plan.budget.total_max)}.
Tasks:
${taskLines}

Homeowner's what-if question: ${question.trim()}`;

  try {
    const answer = await geminiGenerate({
      system: SYSTEM,
      user: context,
      maxOutputTokens: 600,
      temperature: 0.4,
    });
    return NextResponse.json({ answer: answer.trim() });
  } catch (e) {
    console.error("What-if failed:", e);
    return NextResponse.json(
      { error: `What-if failed: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}

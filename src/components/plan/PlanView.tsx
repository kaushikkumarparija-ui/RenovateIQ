"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { schedule, computeBudget } from "@/lib/plan-compute";
import { formatINR, formatRange, projectDate, formatDate, addDays } from "@/lib/format";
import { buildScopePdf } from "@/lib/pdf";
import type { ProjectRow, RenovationPlan, PlanTask, Likelihood } from "@/lib/types";
import { Gantt } from "@/components/plan/Gantt";

type Tab = "timeline" | "budget" | "risks" | "decisions";

const LEVEL_CLASS: Record<Likelihood, string> = {
  High: "bg-danger-soft text-danger",
  Medium: "bg-amber-soft text-amber-dark",
  Low: "bg-teal-soft text-teal",
};

export function PlanView({
  project,
  plan: initialPlan,
}: {
  project: ProjectRow;
  plan: RenovationPlan;
}) {
  const supabase = createSupabaseBrowserClient();
  const plan = initialPlan;

  const [tab, setTab] = useState<Tab>("timeline");
  const [durations, setDurations] = useState<Record<string, number>>(
    Object.fromEntries(plan.tasks.map((t) => [t.id, t.duration_days])),
  );
  const [activeIds, setActiveIds] = useState<Set<string>>(
    new Set(plan.tasks.map((t) => t.id)),
  );
  const [acknowledged, setAcknowledged] = useState(!plan.budget_tight);

  const [whatIfQ, setWhatIfQ] = useState("");
  const [rounds, setRounds] = useState<{ q: string; a: string }[]>([]);
  const [asking, setAsking] = useState(false);
  const [whatIfError, setWhatIfError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [locking, setLocking] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const [locked, setLocked] = useState(project.status === "locked");
  const [pdfUrl, setPdfUrl] = useState<string | null>(project.pdf_url);

  const MAX_ROUNDS = 3;

  const tasksWithDur: PlanTask[] = useMemo(
    () =>
      plan.tasks.map((t) => ({ ...t, duration_days: durations[t.id] ?? t.duration_days })),
    [plan.tasks, durations],
  );

  const sched = useMemo(() => schedule(tasksWithDur), [tasksWithDur]);
  const budget = useMemo(
    () => computeBudget({ ...plan, tasks: tasksWithDur }, activeIds),
    [plan, tasksWithDur, activeIds],
  );

  const endDate = projectDate(project.start_date, sched.totalDuration);
  const criticalCount = sched.tasks.filter((t) => t.critical).length;

  function setDuration(id: string, d: number) {
    setDurations((prev) => ({ ...prev, [id]: d }));
  }
  function toggleTask(id: string) {
    if (locked) return;
    setActiveIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function askWhatIf(e: React.FormEvent) {
    e.preventDefault();
    if (!whatIfQ.trim() || rounds.length >= MAX_ROUNDS) return;
    setAsking(true);
    setWhatIfError(null);
    const q = whatIfQ.trim();
    try {
      const res = await fetch("/api/whatif", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, question: q }),
      });
      const j = await res.json();
      // Only a successful answer counts against the limited quota — a
      // transient failure (rate limit, blip) shouldn't cost the homeowner
      // one of their 3 questions.
      if (!res.ok) {
        setWhatIfError(j.error || "Could not answer. Please try again.");
        return;
      }
      setRounds((r) => [...r, { q, a: j.answer }]);
      setWhatIfQ("");
    } catch (err) {
      setWhatIfError((err as Error).message);
    } finally {
      setAsking(false);
    }
  }

  function triggerDownload(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function doLock() {
    setLocking(true);
    setLockError(null);
    try {
      const finalTasks = tasksWithDur.filter((t) => activeIds.has(t.id));
      const finalSched = schedule(finalTasks);
      const finalPlan: RenovationPlan = {
        ...plan,
        tasks: finalTasks,
        budget: {
          ...plan.budget,
          total_min: budget.totalMin,
          total_max: budget.totalMax,
          labour_min: budget.labourMin,
          labour_max: budget.labourMax,
          materials_min: budget.materialsMin,
          materials_max: budget.materialsMax,
          buffer_recommended: budget.buffer,
          ceiling: budget.ceiling,
          contingency_pct: budget.contingencyPct,
        },
      };

      const blob = buildScopePdf({
        project,
        plan: finalPlan,
        schedule: finalSched,
        budget,
      });

      const path = `${project.id}/scope-${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("project-files")
        .upload(path, blob, { contentType: "application/pdf", upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("project-files").getPublicUrl(path);
      const url = pub.publicUrl;

      const { error: updErr } = await supabase
        .from("projects")
        .update({
          status: "locked",
          locked_at: new Date().toISOString(),
          pdf_url: url,
          ai_plan: finalPlan,
        })
        .eq("id", project.id);
      if (updErr) throw updErr;

      triggerDownload(blob, `RenovateIQ-${project.type}-scope.pdf`);
      setPdfUrl(url);
      setLocked(true);
      setDialogOpen(false);
    } catch (e) {
      setLockError((e as Error).message);
    } finally {
      setLocking(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-navy">
              {project.type} · {project.city}
            </h1>
            {locked ? (
              <span className="badge border border-teal bg-teal-soft text-teal">
                🔒 Scope locked
              </span>
            ) : (
              <span className="badge bg-amber-soft text-amber-dark">Plan ready</span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            {project.area_sqft} sqft · {project.home_age} · stated budget{" "}
            {formatINR(project.budget_input)} · starts {formatDate(project.start_date)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {locked && pdfUrl && (
            <a href={pdfUrl} target="_blank" rel="noreferrer" className="btn-ghost">
              ⬇ Scope PDF
            </a>
          )}
          {locked ? (
            <Link href="/marketplace" className="btn-teal">
              Find contractors →
            </Link>
          ) : (
            <button
              className="btn-navy"
              disabled={!acknowledged}
              onClick={() => setDialogOpen(true)}
              title={!acknowledged ? "Acknowledge the budget note first" : ""}
            >
              🔒 Lock scope
            </button>
          )}
        </div>
      </div>

      <p className="mt-3 rounded-lg bg-white/60 p-3 text-sm text-ink ring-1 ring-line">
        {plan.project_summary}
      </p>

      {/* Honest-assessment banner */}
      {plan.budget_tight && (
        <div className="mt-4 rounded-[var(--radius-card)] border-2 border-amber bg-amber-soft p-4">
          <h3 className="flex items-center gap-2 font-bold text-amber-dark">
            ⚠️ Your budget may be tight for this scope. Here&apos;s why:
          </h3>
          <p className="mt-1 text-sm text-ink">{plan.budget.honest_assessment}</p>
          {!locked && (
            <label className="mt-3 flex items-center gap-2 text-sm font-medium text-amber-dark">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="h-4 w-4 accent-[var(--color-amber-dark)]"
              />
              I understand my budget may not cover everything — let me continue.
            </label>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="mt-6 flex gap-1 border-b border-line">
        {(
          [
            ["timeline", "Timeline"],
            ["budget", "Budget"],
            ["risks", "Risks"],
            ["decisions", "Decisions"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              tab === id
                ? "border-teal text-teal"
                : "border-transparent text-muted hover:text-navy"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "timeline" && (
          <div className="card p-5">
            <div className="mb-4 flex flex-wrap gap-6 text-sm">
              <Stat label="Total duration" value={`${Math.ceil(sched.totalDuration)} days`} />
              <Stat label="Projected finish" value={endDate} />
              <Stat label="Critical-path tasks" value={`${criticalCount}`} />
            </div>
            <Gantt
              tasks={tasksWithDur}
              schedule={sched}
              startDate={project.start_date}
              onDurationChange={setDuration}
            />
          </div>
        )}

        {tab === "budget" && (
          <BudgetTab
            budget={budget}
            stated={project.budget_input}
            tasks={tasksWithDur}
            activeIds={activeIds}
            onToggle={toggleTask}
            locked={locked}
            bufferReasoning={plan.budget.buffer_reasoning}
          />
        )}

        {tab === "risks" && <RisksTab plan={plan} />}

        {tab === "decisions" && (
          <DecisionsTab plan={plan} startDate={project.start_date} />
        )}
      </div>

      {/* Negotiation: what-if */}
      {!locked && (
        <div className="card mt-6 p-5">
          <h3 className="font-bold text-navy">Ask a what-if</h3>
          <p className="mt-1 text-sm text-muted">
            e.g. &quot;What if I use granite instead of quartz?&quot; — you get the
            cost and timeline impact only. {MAX_ROUNDS - rounds.length} of {MAX_ROUNDS}{" "}
            questions left before you lock.
          </p>
          <form onSubmit={askWhatIf} className="mt-3 flex gap-2">
            <input
              className="input"
              value={whatIfQ}
              onChange={(e) => setWhatIfQ(e.target.value)}
              placeholder="Type your what-if…"
              disabled={!acknowledged || rounds.length >= MAX_ROUNDS || asking}
            />
            <button
              className="btn-teal shrink-0"
              disabled={!acknowledged || rounds.length >= MAX_ROUNDS || asking || !whatIfQ.trim()}
            >
              {asking ? "Thinking…" : "Ask"}
            </button>
          </form>
          {whatIfError && (
            <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {whatIfError}
            </p>
          )}
          <div className="mt-4 space-y-3">
            {rounds.map((r, i) => (
              <div key={i} className="rounded-lg bg-canvas p-3 text-sm">
                <p className="font-semibold text-navy">Q: {r.q}</p>
                <p className="mt-1 whitespace-pre-wrap text-ink">{r.a}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lock confirmation dialog */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="card w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-navy">Lock this scope?</h3>
            <p className="mt-2 text-sm text-muted">
              Locking freezes the scope and budget ceiling, then generates a PDF you
              can share with contractors. You can still match and chat afterwards.
            </p>
            <div className="mt-4 space-y-2 rounded-lg bg-canvas p-4 text-sm">
              <Row label="Scope total" value={formatRange(budget.totalMin, budget.totalMax)} />
              <Row
                label={`Buffer (${budget.contingencyPct}%)`}
                value={`+ ${formatINR(budget.buffer)}`}
                amber
              />
              <div className="my-1 border-t border-line" />
              <Row label="Hard ceiling" value={formatINR(budget.ceiling)} bold />
            </div>
            {lockError && (
              <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                {lockError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setDialogOpen(false)} disabled={locking}>
                Cancel
              </button>
              <button className="btn-navy" onClick={doLock} disabled={locking}>
                {locking ? "Locking…" : "Confirm & download PDF"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="text-lg font-bold text-navy">{value}</div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  amber,
}: {
  label: string;
  value: string;
  bold?: boolean;
  amber?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={amber ? "text-amber-dark" : "text-muted"}>{label}</span>
      <span className={`${bold ? "text-base font-extrabold text-navy" : "font-semibold text-ink"} ${amber ? "text-amber-dark" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function BudgetTab({
  budget,
  stated,
  tasks,
  activeIds,
  onToggle,
  locked,
  bufferReasoning,
}: {
  budget: ReturnType<typeof computeBudget>;
  stated: number;
  tasks: PlanTask[];
  activeIds: Set<string>;
  onToggle: (id: string) => void;
  locked: boolean;
  bufferReasoning: string;
}) {
  const overCeiling = stated < budget.totalMax;
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="card p-5">
        <h3 className="font-bold text-navy">Budget breakdown</h3>
        <div className="mt-4 space-y-3 text-sm">
          <Row label="Labour" value={formatRange(budget.labourMin, budget.labourMax)} />
          <Row label="Materials" value={formatRange(budget.materialsMin, budget.materialsMax)} />
          <div className="my-1 border-t border-line" />
          <Row label="Scope total" value={formatRange(budget.totalMin, budget.totalMax)} bold />
        </div>

        <div className="mt-4 rounded-lg border-2 border-amber bg-amber-soft p-4">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-amber-dark">
              🔒 Buffer ({budget.contingencyPct}%)
            </span>
            <span className="font-bold text-amber-dark">+ {formatINR(budget.buffer)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-amber/40 pt-2">
            <span className="font-bold text-amber-dark">Hard ceiling</span>
            <span className="text-lg font-extrabold text-amber-dark">
              {formatINR(budget.ceiling)}
            </span>
          </div>
          <p className="mt-2 text-xs text-amber-dark/90">{bufferReasoning}</p>
        </div>

        <div className="mt-4 text-sm">
          <Row label="Your stated budget" value={formatINR(stated)} />
          <p className={`mt-1 text-xs ${overCeiling ? "text-danger" : "text-teal-dark"}`}>
            {overCeiling
              ? "Your stated budget is below the upper scope estimate."
              : "Your stated budget covers the upper scope estimate."}
          </p>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-bold text-navy">
          Included tasks{" "}
          <span className="text-sm font-normal text-muted">
            ({budget.activeCount}/{budget.taskCount})
          </span>
        </h3>
        <p className="mt-1 text-xs text-muted">
          Toggle a task off to see the budget update instantly.
        </p>
        <div className="mt-3 max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
          {tasks.map((t) => {
            const on = activeIds.has(t.id);
            return (
              <button
                key={t.id}
                onClick={() => onToggle(t.id)}
                disabled={locked}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                  on ? "border-line bg-white" : "border-dashed border-line bg-canvas opacity-60"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`grid h-4 w-7 place-items-center rounded-full px-0.5 transition ${
                      on ? "bg-teal" : "bg-line"
                    }`}
                  >
                    <span
                      className={`h-3 w-3 rounded-full bg-white transition ${
                        on ? "translate-x-1.5" : "-translate-x-1.5"
                      }`}
                    />
                  </span>
                  <span className="text-ink">{t.name}</span>
                </span>
                <span className="shrink-0 text-muted">
                  {formatRange(t.cost_min, t.cost_max)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RisksTab({ plan }: { plan: RenovationPlan }) {
  return (
    <div className="space-y-5">
      {(plan.hidden_conditions.length > 0) && (
        <div className="rounded-[var(--radius-card)] border-2 border-amber bg-amber-soft p-4">
          <h3 className="font-bold text-amber-dark">Hidden conditions flagged</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
            {plan.hidden_conditions.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {plan.risks.map((r, i) => (
          <div key={i} className="card p-4">
            <p className="font-semibold text-navy">{r.risk}</p>
            <div className="mt-2 flex gap-2">
              <span className={`badge ${LEVEL_CLASS[r.likelihood]}`}>
                Likelihood: {r.likelihood}
              </span>
              <span className={`badge ${LEVEL_CLASS[r.impact]}`}>Impact: {r.impact}</span>
            </div>
            <p className="mt-2 text-sm text-muted">{r.mitigation}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DecisionsTab({ plan, startDate }: { plan: RenovationPlan; startDate: string }) {
  const today = new Date();
  const sorted = [...plan.decision_queue].sort((a, b) => a.deadline_day - b.deadline_day);
  return (
    <div className="space-y-3">
      {sorted.map((d, i) => {
        const due = addDays(startDate, d.deadline_day);
        const overdue = due < today;
        return (
          <div
            key={i}
            className={`card flex flex-wrap items-start justify-between gap-3 p-4 ${
              overdue ? "border-danger" : ""
            }`}
          >
            <div className="max-w-xl">
              <p className="font-semibold text-navy">{d.decision}</p>
              <p className="mt-1 text-sm text-muted">
                If missed: {d.consequence}
              </p>
            </div>
            <span
              className={`badge ${
                overdue ? "bg-danger-soft text-danger" : "bg-teal-soft text-teal"
              }`}
            >
              {overdue ? "Overdue · " : "Decide by "}
              {projectDate(startDate, d.deadline_day)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

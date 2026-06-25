// All schedule/budget arithmetic lives here — NEVER trust the AI's totals,
// dates, or `is_critical`. The AI supplies durations, costs and the dependency
// graph; JS computes everything derived.

import type { PlanTask, RenovationPlan } from "./types";

export interface ScheduledTask extends PlanTask {
  earliestStart: number; // day offset from project start (0-based)
  earliestFinish: number;
  latestStart: number;
  latestFinish: number;
  slack: number;
  critical: boolean; // COMPUTED, not the AI's hint
}

export interface Schedule {
  tasks: ScheduledTask[];
  byId: Record<string, ScheduledTask>;
  totalDuration: number; // days
}

const EPS = 1e-6;

/**
 * Make the dependency graph safe: unique ids, drop predecessors that point at
 * unknown/self ids, and break any cycles (keep the first edge encountered in a
 * DFS, drop back-edges). Returns a new, clean task list.
 */
export function sanitizeTasks(input: PlanTask[]): PlanTask[] {
  const seen = new Set<string>();
  const tasks: PlanTask[] = [];
  for (const t of input || []) {
    if (!t || typeof t.id !== "string" || seen.has(t.id)) continue;
    seen.add(t.id);
    tasks.push({
      ...t,
      duration_days: Math.max(0, Number(t.duration_days) || 0),
      cost_min: Math.max(0, Number(t.cost_min) || 0),
      cost_max: Math.max(0, Number(t.cost_max) || 0),
      predecessors: Array.isArray(t.predecessors) ? t.predecessors : [],
    });
  }

  const ids = new Set(tasks.map((t) => t.id));
  // Drop unknown + self references first.
  for (const t of tasks) {
    t.predecessors = [...new Set(t.predecessors)].filter(
      (p) => p !== t.id && ids.has(p),
    );
  }

  // Break cycles with a DFS, removing back-edges.
  const color = new Map<string, 0 | 1 | 2>(); // 0=unseen 1=in-stack 2=done
  const map = new Map(tasks.map((t) => [t.id, t]));
  const visit = (id: string) => {
    color.set(id, 1);
    const t = map.get(id)!;
    t.predecessors = t.predecessors.filter((p) => {
      const c = color.get(p) ?? 0;
      if (c === 1) return false; // back-edge → cycle, drop it
      if (c === 0) visit(p);
      return true;
    });
    color.set(id, 2);
  };
  for (const t of tasks) if ((color.get(t.id) ?? 0) === 0) visit(t.id);

  return tasks;
}

/** Kahn topological order over a clean (acyclic) task list. */
function topoOrder(tasks: PlanTask[]): PlanTask[] {
  const map = new Map(tasks.map((t) => [t.id, t]));
  const indeg = new Map<string, number>();
  const succ = new Map<string, string[]>();
  for (const t of tasks) {
    indeg.set(t.id, t.predecessors.length);
    for (const p of t.predecessors) {
      succ.set(p, [...(succ.get(p) ?? []), t.id]);
    }
  }
  const queue = tasks.filter((t) => (indeg.get(t.id) ?? 0) === 0).map((t) => t.id);
  const order: PlanTask[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(map.get(id)!);
    for (const s of succ.get(id) ?? []) {
      indeg.set(s, (indeg.get(s) ?? 0) - 1);
      if ((indeg.get(s) ?? 0) === 0) queue.push(s);
    }
  }
  // Any leftovers (shouldn't happen post-sanitize) appended as-is.
  for (const t of tasks) if (!order.includes(t)) order.push(t);
  return order;
}

/**
 * Critical Path Method. Forward pass for ES/EF, backward pass for LS/LF,
 * slack = LS - ES, critical when slack ≈ 0.
 */
export function schedule(rawTasks: PlanTask[]): Schedule {
  const tasks = sanitizeTasks(rawTasks);
  const order = topoOrder(tasks);
  const map = new Map(tasks.map((t) => [t.id, t]));

  const ES = new Map<string, number>();
  const EF = new Map<string, number>();

  // Forward pass
  for (const t of order) {
    const start = t.predecessors.length
      ? Math.max(...t.predecessors.map((p) => EF.get(p) ?? 0))
      : 0;
    ES.set(t.id, start);
    EF.set(t.id, start + t.duration_days);
  }

  const totalDuration = tasks.length
    ? Math.max(...tasks.map((t) => EF.get(t.id) ?? 0))
    : 0;

  // Successor map for backward pass
  const succ = new Map<string, string[]>();
  for (const t of tasks)
    for (const p of t.predecessors)
      succ.set(p, [...(succ.get(p) ?? []), t.id]);

  const LF = new Map<string, number>();
  const LS = new Map<string, number>();

  // Backward pass (reverse topo order)
  for (let i = order.length - 1; i >= 0; i--) {
    const t = order[i];
    const successors = succ.get(t.id) ?? [];
    const lf = successors.length
      ? Math.min(...successors.map((s) => LS.get(s) ?? totalDuration))
      : totalDuration;
    LF.set(t.id, lf);
    LS.set(t.id, lf - t.duration_days);
  }

  const scheduled: ScheduledTask[] = tasks.map((t) => {
    const es = ES.get(t.id) ?? 0;
    const ef = EF.get(t.id) ?? 0;
    const ls = LS.get(t.id) ?? es;
    const lf = LF.get(t.id) ?? ef;
    const slack = ls - es;
    return {
      ...t,
      earliestStart: es,
      earliestFinish: ef,
      latestStart: ls,
      latestFinish: lf,
      slack,
      critical: slack <= EPS,
    };
  });

  // Preserve original ordering for display.
  const indexOf = new Map(rawTasks.map((t, i) => [t.id, i]));
  scheduled.sort(
    (a, b) => (indexOf.get(a.id) ?? 0) - (indexOf.get(b.id) ?? 0),
  );

  const byId: Record<string, ScheduledTask> = {};
  for (const s of scheduled) byId[s.id] = s;

  return { tasks: scheduled, byId, totalDuration };
}

// ----- Budget -----

export interface BudgetView {
  labourMin: number;
  labourMax: number;
  materialsMin: number;
  materialsMax: number;
  totalMin: number;
  totalMax: number;
  contingencyPct: number;
  contingencyMin: number;
  contingencyMax: number;
  buffer: number; // amber hard cushion (₹)
  ceiling: number; // totalMax + buffer — the locked hard ceiling
  activeCount: number;
  taskCount: number;
}

/**
 * Recompute the budget over the currently-active tasks. Totals are summed from
 * per-task ranges; labour/materials are split using the AI's aggregate ratio so
 * the split stays sensible as tasks toggle. Buffer and ceiling are derived from
 * the contingency % — so they react instantly to toggles, fully in JS.
 */
export function computeBudget(
  plan: RenovationPlan,
  activeIds: Set<string>,
): BudgetView {
  const active = plan.tasks.filter((t) => activeIds.has(t.id));
  const totalMin = active.reduce((s, t) => s + (t.cost_min || 0), 0);
  const totalMax = active.reduce((s, t) => s + (t.cost_max || 0), 0);

  const aiLabour =
    ((plan.budget.labour_min || 0) + (plan.budget.labour_max || 0)) / 2;
  const aiMaterials =
    ((plan.budget.materials_min || 0) + (plan.budget.materials_max || 0)) / 2;
  const denom = aiLabour + aiMaterials;
  const labourShare = denom > 0 ? aiLabour / denom : 0.4;

  const contingencyPct = Math.max(0, plan.budget.contingency_pct || 10);
  const buffer = Math.round((totalMax * contingencyPct) / 100);

  return {
    labourMin: Math.round(totalMin * labourShare),
    labourMax: Math.round(totalMax * labourShare),
    materialsMin: Math.round(totalMin * (1 - labourShare)),
    materialsMax: Math.round(totalMax * (1 - labourShare)),
    totalMin: Math.round(totalMin),
    totalMax: Math.round(totalMax),
    contingencyPct,
    contingencyMin: Math.round((totalMin * contingencyPct) / 100),
    contingencyMax: Math.round((totalMax * contingencyPct) / 100),
    buffer,
    ceiling: Math.round(totalMax + buffer),
    activeCount: active.length,
    taskCount: plan.tasks.length,
  };
}

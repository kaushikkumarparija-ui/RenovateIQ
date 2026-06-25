import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionProfile } from "@/lib/supabase/server";
import { AppNav } from "@/components/AppNav";
import { formatINR, formatDate, addDays } from "@/lib/format";
import type { ProjectRow, RenovationPlan } from "@/lib/types";

export default async function HomeownerDashboard() {
  const { supabase, user, profile } = await getSessionProfile();
  if (!user) redirect("/login?next=/dashboard");
  if (profile?.role === "contractor") redirect("/dashboard/contractor");

  const { data: projRows } = await supabase
    .from("projects")
    .select("*")
    .eq("homeowner_id", user.id)
    .order("created_at", { ascending: false });
  const projects = (projRows ?? []) as ProjectRow[];

  const { data: leadRows } = await supabase
    .from("leads")
    .select("id, contractor_id, project_id, status")
    .eq("homeowner_id", user.id);
  const leads = leadRows ?? [];

  const { data: cRows } = await supabase
    .from("contractor_profiles")
    .select("id, business_name");
  const bizName: Record<string, string> = {};
  for (const c of cRows ?? []) bizName[c.id] = c.business_name;

  // Next decision due across all planned/locked projects.
  const today = new Date();
  let nextDue: { date: Date; decision: string; projectId: string } | null = null;
  for (const p of projects) {
    const plan = p.ai_plan as RenovationPlan | null;
    if (!plan) continue;
    for (const d of plan.decision_queue ?? []) {
      const date = addDays(p.start_date, d.deadline_day);
      if (date >= today && (!nextDue || date < nextDue.date)) {
        nextDue = { date, decision: d.decision, projectId: p.id };
      }
    }
  }

  const active = projects.filter((p) => p.status !== "locked");
  const locked = projects.filter((p) => p.status === "locked");

  return (
    <>
      <AppNav role="homeowner" name={profile?.full_name || "You"} />
      <main className="mx-auto max-w-5xl px-5 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold text-navy">
            Hi {profile?.full_name?.split(" ")[0] || "there"} 👋
          </h1>
          <Link href="/project/new" className="btn-amber">
            + New project
          </Link>
        </div>

        {/* Summary stats */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="card p-5">
            <div className="text-xs uppercase tracking-wide text-muted">Projects</div>
            <div className="mt-1 text-2xl font-extrabold text-navy">{projects.length}</div>
            <div className="text-sm text-muted">
              {locked.length} locked · {active.length} in progress
            </div>
          </div>
          <div className="card p-5">
            <div className="text-xs uppercase tracking-wide text-muted">Next decision due</div>
            {nextDue ? (
              <>
                <div className="mt-1 text-lg font-bold text-navy">
                  {formatDate(nextDue.date)}
                </div>
                <Link
                  href={`/project/${nextDue.projectId}`}
                  className="text-sm text-teal hover:underline"
                >
                  {nextDue.decision.slice(0, 48)}
                  {nextDue.decision.length > 48 ? "…" : ""}
                </Link>
              </>
            ) : (
              <div className="mt-1 text-sm text-muted">Nothing pending</div>
            )}
          </div>
          <div className="card p-5">
            <div className="text-xs uppercase tracking-wide text-muted">Matched contractors</div>
            <div className="mt-1 text-2xl font-extrabold text-navy">{leads.length}</div>
            <Link href="/marketplace" className="text-sm text-teal hover:underline">
              Browse marketplace →
            </Link>
          </div>
        </div>

        {/* Projects */}
        <h2 className="mt-8 text-lg font-bold text-navy">Your projects</h2>
        {projects.length === 0 ? (
          <div className="card mt-3 p-8 text-center">
            <p className="text-muted">No projects yet.</p>
            <Link href="/project/new" className="btn-amber mt-4 inline-flex">
              Plan your first renovation
            </Link>
          </div>
        ) : (
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {projects.map((p) => {
              const plan = p.ai_plan as RenovationPlan | null;
              const ceiling = plan?.budget?.ceiling ?? null;
              const pct =
                ceiling && p.budget_input
                  ? Math.min(100, Math.round((p.budget_input / ceiling) * 100))
                  : null;
              return (
                <Link key={p.id} href={`/project/${p.id}`} className="card card-hover p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-navy">
                      {p.type} · {p.city}
                    </h3>
                    <span
                      className={`badge ${
                        p.status === "locked"
                          ? "bg-teal-soft text-teal"
                          : "bg-amber-soft text-amber-dark"
                      }`}
                    >
                      {p.status === "locked" ? "🔒 Locked" : p.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {p.area_sqft} sqft · starts {formatDate(p.start_date)}
                  </p>
                  {ceiling != null && (
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-muted">
                        <span>Stated {formatINR(p.budget_input)}</span>
                        <span>Ceiling {formatINR(ceiling)}</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-canvas">
                        <div
                          className="h-full bg-teal"
                          style={{ width: `${pct ?? 0}%` }}
                        />
                      </div>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}

        {/* Conversations */}
        {leads.length > 0 && (
          <>
            <h2 className="mt-8 text-lg font-bold text-navy">Conversations</h2>
            <div className="mt-3 space-y-2">
              {leads.map((l) => {
                const p = projects.find((x) => x.id === l.project_id);
                return (
                  <Link
                    key={l.id}
                    href={`/chat/${l.id}`}
                    className="card card-hover flex items-center justify-between p-4"
                  >
                    <div>
                      <p className="font-semibold text-navy">
                        {bizName[l.contractor_id] || "Contractor"}
                      </p>
                      <p className="text-sm text-muted">
                        {p ? `${p.type} · ${p.city}` : "Project"}
                      </p>
                    </div>
                    <span className="badge bg-canvas text-muted">{l.status}</span>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </main>
    </>
  );
}

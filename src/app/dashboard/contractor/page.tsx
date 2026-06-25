import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionProfile } from "@/lib/supabase/server";
import { AppNav } from "@/components/AppNav";
import { ContractorEditor } from "@/components/ContractorEditor";
import { formatINR } from "@/lib/format";
import type { ProjectRow, RenovationPlan } from "@/lib/types";

export default async function ContractorDashboard() {
  const { supabase, user, profile } = await getSessionProfile();
  if (!user) redirect("/login?next=/dashboard/contractor");
  if (profile?.role === "homeowner") redirect("/dashboard");

  const { data: cp } = await supabase
    .from("contractor_profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const { data: portfolio } = await supabase
    .from("portfolio_items")
    .select("*")
    .eq("contractor_id", user.id);

  const { data: leadRows } = await supabase
    .from("leads")
    .select("id, project_id, homeowner_id, status, sent_at")
    .eq("contractor_id", user.id)
    .order("sent_at", { ascending: false });
  const leads = leadRows ?? [];

  const projectIds = [...new Set(leads.map((l) => l.project_id))];
  const projMap: Record<string, ProjectRow> = {};
  if (projectIds.length) {
    const { data: projRows } = await supabase
      .from("projects")
      .select("*")
      .in("id", projectIds);
    for (const p of (projRows ?? []) as ProjectRow[]) projMap[p.id] = p;
  }

  const ownerIds = [...new Set(leads.map((l) => l.homeowner_id))];
  const ownerName: Record<string, string> = {};
  if (ownerIds.length) {
    const { data: owners } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", ownerIds);
    for (const o of owners ?? []) ownerName[o.id] = o.full_name;
  }

  return (
    <>
      <AppNav role="contractor" name={profile?.full_name || "You"} />
      <main className="mx-auto max-w-5xl px-5 py-8">
        <h1 className="text-2xl font-extrabold text-navy">
          {cp?.business_name || "Your"} dashboard
        </h1>
        <p className="mt-1 text-muted">
          Scoped leads arrive with a locked budget and a downloadable scope PDF.
        </p>

        {/* Leads */}
        <h2 className="mt-6 text-lg font-bold text-navy">
          Incoming leads{" "}
          <span className="text-sm font-normal text-muted">({leads.length})</span>
        </h2>
        {leads.length === 0 ? (
          <div className="card mt-3 p-8 text-center text-muted">
            No leads yet. Homeowners will reach out once they&apos;ve locked a scope.
          </div>
        ) : (
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {leads.map((l) => {
              const p = projMap[l.project_id];
              const plan = p?.ai_plan as RenovationPlan | null;
              const ceiling = plan?.budget?.ceiling ?? null;
              return (
                <div key={l.id} className="card p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-navy">
                      {p ? `${p.type} · ${p.city}` : "Project"}
                    </h3>
                    <span
                      className={`badge ${
                        l.status === "accepted"
                          ? "bg-teal-soft text-teal"
                          : "bg-amber-soft text-amber-dark"
                      }`}
                    >
                      {l.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {ownerName[l.homeowner_id] || "Homeowner"}
                    {p ? ` · ${p.area_sqft} sqft` : ""}
                  </p>
                  {ceiling != null && (
                    <p className="mt-2 text-sm font-semibold text-amber-dark">
                      Budget ceiling: {formatINR(ceiling)}
                    </p>
                  )}
                  <div className="mt-4 flex gap-2">
                    {p?.pdf_url && (
                      <a
                        href={p.pdf_url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-ghost flex-1"
                      >
                        ⬇ Scope PDF
                      </a>
                    )}
                    <Link href={`/chat/${l.id}`} className="btn-teal flex-1">
                      Open chat →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Profile + portfolio */}
        <h2 className="mt-8 text-lg font-bold text-navy">Profile & portfolio</h2>
        <div className="mt-3">
          <ContractorEditor
            myId={user.id}
            initial={{
              business_name: cp?.business_name ?? "",
              experience_years: cp?.experience_years ?? 0,
              project_types: cp?.project_types ?? [],
              rating: Number(cp?.rating) || 0,
              bio: cp?.bio ?? null,
            }}
            initialPortfolio={portfolio ?? []}
          />
        </div>
      </main>
    </>
  );
}

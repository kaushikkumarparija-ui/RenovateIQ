"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ALL_CITIES } from "@/lib/cities";
import { PROJECT_TYPES } from "@/lib/types";

export interface ContractorCard {
  id: string;
  business_name: string;
  full_name: string;
  city: string;
  experience_years: number;
  project_types: string[];
  rating: number;
  bio: string | null;
  portfolio: { type: string; location: string; year: number; cost_display: string; description: string }[];
}

export interface LockedProject {
  id: string;
  type: string;
  city: string;
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-amber" title={`${rating} stars`}>
      {"★".repeat(Math.round(rating))}
      <span className="text-line">{"★".repeat(5 - Math.round(rating))}</span>
      <span className="ml-1 text-xs font-semibold text-muted">{rating.toFixed(1)}</span>
    </span>
  );
}

export function Marketplace({
  myId,
  myCity,
  contractors,
  lockedProjects,
  existingLeads,
}: {
  myId: string;
  myCity: string;
  contractors: ContractorCard[];
  lockedProjects: LockedProject[];
  existingLeads: Record<string, string>; // contractorId -> leadId
}) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [cityFilter, setCityFilter] = useState(myCity || "");
  const [typeFilter, setTypeFilter] = useState("");
  const [dialog, setDialog] = useState<ContractorCard | null>(null);
  const [pickProject, setPickProject] = useState<string>(lockedProjects[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      contractors.filter(
        (c) =>
          (!cityFilter || c.city === cityFilter) &&
          (!typeFilter || c.project_types.includes(typeFilter)),
      ),
    [contractors, cityFilter, typeFilter],
  );

  async function connect(contractor: ContractorCard, projectId: string) {
    setBusy(true);
    setError(null);
    try {
      const { data, error: insErr } = await supabase
        .from("leads")
        .insert({
          project_id: projectId,
          homeowner_id: myId,
          contractor_id: contractor.id,
          status: "pending",
        })
        .select("id")
        .single();

      if (insErr) {
        // already connected → reuse the existing thread
        const { data: existing } = await supabase
          .from("leads")
          .select("id")
          .eq("project_id", projectId)
          .eq("contractor_id", contractor.id)
          .single();
        if (existing) {
          router.push(`/chat/${existing.id}`);
          return;
        }
        throw new Error(insErr.message);
      }
      router.push(`/chat/${data.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <h1 className="text-2xl font-extrabold text-navy">Contractor marketplace</h1>
      <p className="mt-1 text-muted">
        Pre-qualified pros. Connecting shares your locked scope PDF and opens a chat.
      </p>

      {lockedProjects.length === 0 && (
        <div className="mt-4 rounded-lg bg-amber-soft px-4 py-3 text-sm text-amber-dark">
          You need a <span className="font-semibold">locked</span> project before you can
          connect.{" "}
          <Link href="/project/new" className="font-semibold underline">
            Plan and lock one first.
          </Link>
        </div>
      )}

      {/* Filters */}
      <div className="mt-6 flex flex-wrap gap-3">
        <select
          className="input max-w-xs"
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
        >
          <option value="">All cities</option>
          {ALL_CITIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          className="input max-w-xs"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">All project types</option>
          {PROJECT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {/* Cards */}
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        {filtered.map((c) => {
          const connected = existingLeads[c.id];
          return (
            <div key={c.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold text-navy">{c.business_name}</h3>
                  <p className="text-sm text-muted">
                    {c.full_name} · {c.city}
                  </p>
                </div>
                <Stars rating={c.rating} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="badge bg-canvas text-muted">{c.experience_years} yrs</span>
                {c.project_types.map((t) => (
                  <span key={t} className="badge bg-teal-soft text-teal">
                    {t}
                  </span>
                ))}
              </div>
              {c.bio && <p className="mt-3 text-sm text-ink">{c.bio}</p>}
              {c.portfolio.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-muted">
                  {c.portfolio.slice(0, 3).map((p, i) => (
                    <li key={i}>
                      • {p.location} — {p.description} ({p.cost_display}, {p.year})
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4">
                {connected ? (
                  <Link href={`/chat/${connected}`} className="btn-ghost w-full">
                    Open chat →
                  </Link>
                ) : (
                  <button
                    className="btn-teal w-full"
                    disabled={lockedProjects.length === 0}
                    onClick={() => {
                      setDialog(c);
                      setPickProject(lockedProjects[0]?.id || "");
                      setError(null);
                    }}
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-muted">No contractors match these filters.</p>
        )}
      </div>

      {/* Connect dialog */}
      {dialog && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="card w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-navy">
              Connect with {dialog.business_name}
            </h3>
            <p className="mt-2 text-sm text-muted">
              Choose which locked project to share. Your scope PDF and budget ceiling go
              with it.
            </p>
            <select
              className="input mt-4"
              value={pickProject}
              onChange={(e) => setPickProject(e.target.value)}
            >
              {lockedProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.type} · {p.city}
                </option>
              ))}
            </select>
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setDialog(null)} disabled={busy}>
                Cancel
              </button>
              <button
                className="btn-teal"
                disabled={busy || !pickProject}
                onClick={() => connect(dialog, pickProject)}
              >
                {busy ? "Connecting…" : "Send request & open chat"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

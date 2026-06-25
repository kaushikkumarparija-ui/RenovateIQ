"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { PROJECT_TYPES } from "@/lib/types";

interface Portfolio {
  id: string;
  type: string;
  location: string;
  year: number;
  cost_display: string;
  description: string;
}

export function ContractorEditor({
  myId,
  initial,
  initialPortfolio,
}: {
  myId: string;
  initial: {
    business_name: string;
    experience_years: number;
    project_types: string[];
    rating: number;
    bio: string | null;
  };
  initialPortfolio: Portfolio[];
}) {
  const supabase = createSupabaseBrowserClient();

  const [businessName, setBusinessName] = useState(initial.business_name);
  const [experience, setExperience] = useState(String(initial.experience_years));
  const [types, setTypes] = useState<string[]>(initial.project_types);
  const [bio, setBio] = useState(initial.bio || "");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [portfolio, setPortfolio] = useState<Portfolio[]>(initialPortfolio);
  const [np, setNp] = useState({
    type: "Kitchen",
    location: "",
    year: String(new Date().getFullYear()),
    cost_display: "",
    description: "",
  });

  const toggle = (t: string) =>
    setTypes((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));

  async function saveProfile() {
    setSaving(true);
    setSavedMsg(null);
    const { error } = await supabase
      .from("contractor_profiles")
      .update({
        business_name: businessName,
        experience_years: Number(experience) || 0,
        project_types: types,
        bio,
      })
      .eq("id", myId);
    setSaving(false);
    setSavedMsg(error ? error.message : "Profile saved.");
  }

  async function addPortfolio() {
    if (!np.location.trim() || !np.description.trim()) return;
    const { data, error } = await supabase
      .from("portfolio_items")
      .insert({
        contractor_id: myId,
        type: np.type,
        location: np.location,
        year: Number(np.year) || new Date().getFullYear(),
        cost_display: np.cost_display,
        description: np.description,
      })
      .select("*")
      .single();
    if (!error && data) {
      setPortfolio((p) => [...p, data as Portfolio]);
      setNp({ ...np, location: "", cost_display: "", description: "" });
    }
  }

  async function removePortfolio(id: string) {
    await supabase.from("portfolio_items").delete().eq("id", id);
    setPortfolio((p) => p.filter((x) => x.id !== id));
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {/* Profile editor */}
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-navy">Your profile</h3>
          <span className="text-amber" title={`${initial.rating} stars`}>
            {"★".repeat(Math.round(initial.rating))}
            <span className="text-line">{"★".repeat(5 - Math.round(initial.rating))}</span>
            <span className="ml-1 text-xs font-semibold text-muted">
              {initial.rating.toFixed(1)}
            </span>
          </span>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <label className="label">Business name</label>
            <input className="input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          </div>
          <div>
            <label className="label">Years of experience</label>
            <input
              className="input"
              type="number"
              min={0}
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Project types</label>
            <div className="flex flex-wrap gap-2">
              {PROJECT_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggle(t)}
                  className={`badge border px-3 py-1.5 transition ${
                    types.includes(t)
                      ? "border-teal bg-teal-soft text-teal"
                      : "border-line bg-white text-muted"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Bio</label>
            <textarea className="input min-h-20" value={bio} onChange={(e) => setBio(e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            <button className="btn-teal" onClick={saveProfile} disabled={saving}>
              {saving ? "Saving…" : "Save profile"}
            </button>
            {savedMsg && <span className="text-sm text-teal-dark">{savedMsg}</span>}
          </div>
        </div>
      </div>

      {/* Portfolio manager */}
      <div className="card p-5">
        <h3 className="font-bold text-navy">Portfolio</h3>
        <div className="mt-3 space-y-2">
          {portfolio.map((p) => (
            <div key={p.id} className="flex items-start justify-between rounded-lg bg-canvas p-3 text-sm">
              <div>
                <p className="font-semibold text-navy">
                  {p.type} · {p.location}
                </p>
                <p className="text-muted">
                  {p.description} — {p.cost_display}, {p.year}
                </p>
              </div>
              <button
                onClick={() => removePortfolio(p.id)}
                className="shrink-0 text-xs text-danger hover:underline"
              >
                Remove
              </button>
            </div>
          ))}
          {portfolio.length === 0 && <p className="text-sm text-muted">No work added yet.</p>}
        </div>

        <div className="mt-4 space-y-2 border-t border-line pt-4">
          <p className="text-sm font-semibold text-navy">Add a project</p>
          <div className="grid grid-cols-2 gap-2">
            <select
              className="input"
              value={np.type}
              onChange={(e) => setNp({ ...np, type: e.target.value })}
            >
              {PROJECT_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <input
              className="input"
              placeholder="Location"
              value={np.location}
              onChange={(e) => setNp({ ...np, location: e.target.value })}
            />
            <input
              className="input"
              placeholder="Year"
              type="number"
              value={np.year}
              onChange={(e) => setNp({ ...np, year: e.target.value })}
            />
            <input
              className="input"
              placeholder="Cost e.g. ₹3.2L"
              value={np.cost_display}
              onChange={(e) => setNp({ ...np, cost_display: e.target.value })}
            />
          </div>
          <input
            className="input"
            placeholder="Description"
            value={np.description}
            onChange={(e) => setNp({ ...np, description: e.target.value })}
          />
          <button className="btn-ghost w-full" onClick={addPortfolio}>
            + Add to portfolio
          </button>
        </div>
      </div>
    </div>
  );
}

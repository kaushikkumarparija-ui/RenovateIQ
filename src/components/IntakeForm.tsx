"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { CITY_GROUPS } from "@/lib/cities";
import { PROJECT_TYPES, HOME_AGES, type ProjectType, type HomeAge } from "@/lib/types";

const PHASES = [
  "Reading your project…",
  "Benchmarking against Indian market rates…",
  "Sequencing trades and the critical path…",
  "Flagging hidden conditions and risks…",
  "Finalising your budget and buffer…",
];

export function IntakeForm({ defaultCity }: { defaultCity: string }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [type, setType] = useState<ProjectType>("Kitchen");
  const [city, setCity] = useState(defaultCity);
  const [homeAge, setHomeAge] = useState<HomeAge>("5–15yr");
  const [area, setArea] = useState("");
  const [budget, setBudget] = useState("");
  const [asks, setAsks] = useState("");
  const [startDate, setStartDate] = useState("");

  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setPhase(0);

    const ticker = setInterval(
      () => setPhase((x) => Math.min(x + 1, PHASES.length - 1)),
      8000,
    );

    let projectId: string | undefined;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("You need to be logged in.");

      const { data: project, error: insErr } = await supabase
        .from("projects")
        .insert({
          homeowner_id: user.id,
          type,
          city,
          home_age: homeAge,
          area_sqft: Number(area),
          budget_input: Number(budget),
          specific_asks: asks,
          start_date: startDate,
          status: "draft",
        })
        .select("id")
        .single();
      if (insErr || !project) throw new Error(insErr?.message || "Could not save project.");
      projectId = project.id;

      // /api/plan already retries internally on Gemini's "heavy traffic"
      // response — this is a second layer, retrying the whole request once
      // more on that same failure before the homeowner ever sees it.
      const PLAN_FETCH_ATTEMPTS = 2;
      let res: Response | undefined;
      let planError = "";
      for (let attempt = 1; attempt <= PLAN_FETCH_ATTEMPTS; attempt++) {
        res = await fetch("/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId }),
        });
        if (res.ok) break;
        const j = await res.json().catch(() => ({}));
        planError = j.error || "Plan generation failed.";
        const retryable = planError.includes("heavy traffic");
        if (!retryable || attempt === PLAN_FETCH_ATTEMPTS) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (!res!.ok) throw new Error(planError);

      clearInterval(ticker);
      router.push(`/project/${projectId}`);
    } catch (err) {
      clearInterval(ticker);
      // Don't leave a planless draft behind if generation failed after the
      // row was created, or every retry piles up another dead project.
      if (projectId) {
        await supabase.from("projects").delete().eq("id", projectId);
      }
      setError((err as Error).message);
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-xl px-6 py-20 text-center">
        <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-4 border-line border-t-teal" />
        <h2 className="text-xl font-bold text-navy">Building your plan</h2>
        <p className="mt-2 text-muted">{PHASES[phase]}</p>
        <p className="mt-6 text-xs text-muted">
          Your AI architect is reasoning over Indian market data. This usually
          takes under a minute.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-extrabold text-navy">Tell us about your project</h1>
      <p className="mt-2 text-muted">
        Your AI architect turns this into a complete, sequenced plan with an
        itemised, benchmarked budget.
      </p>

      <form onSubmit={handleSubmit} className="card mt-6 space-y-5 p-6">
        <div>
          <label className="label">What are you renovating?</label>
          <div className="flex flex-wrap gap-2">
            {PROJECT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`badge border px-3.5 py-2 transition ${
                  type === t
                    ? "border-teal bg-teal-soft text-teal"
                    : "border-line bg-white text-muted"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label">City</label>
            <select
              className="input"
              required
              value={city}
              onChange={(e) => setCity(e.target.value)}
            >
              <option value="">Select your city</option>
              {CITY_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.cities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="label">How old is the home?</label>
            <select
              className="input"
              value={homeAge}
              onChange={(e) => setHomeAge(e.target.value as HomeAge)}
            >
              {HOME_AGES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label">Area (sqft)</label>
            <input
              className="input"
              type="number"
              min={1}
              required
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="e.g. 180"
            />
          </div>
          <div>
            <label className="label">Budget (₹)</label>
            <input
              className="input"
              type="number"
              min={1}
              required
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="e.g. 450000"
            />
          </div>
        </div>

        <div>
          <label className="label">Target start date</label>
          <input
            className="input"
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div>
          <label className="label">What exactly do you want? (plain words)</label>
          <textarea
            className="input min-h-24"
            value={asks}
            onChange={(e) => setAsks(e.target.value)}
            placeholder="e.g. Want to move the sink, add an island, Italian marble flooring"
          />
        </div>

        {error && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <button type="submit" className="btn-amber w-full text-base">
          Build my plan →
        </button>
      </form>
    </div>
  );
}

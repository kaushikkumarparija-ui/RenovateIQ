"use client";

import { useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { CITY_GROUPS } from "@/lib/cities";
import { PROJECT_TYPES, type Role } from "@/lib/types";
import { Logo } from "@/components/Logo";

export function SignupForm({ initialRole }: { initialRole: Role }) {
  const supabase = createSupabaseBrowserClient();

  const [role, setRole] = useState<Role>(initialRole);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [experience, setExperience] = useState("");
  const [projectTypes, setProjectTypes] = useState<string[]>([]);
  const [bio, setBio] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const toggleType = (t: string) =>
    setProjectTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    const data: Record<string, unknown> = {
      role,
      full_name: fullName,
      city,
      phone,
    };
    if (role === "contractor") {
      data.business_name = businessName;
      data.experience_years = Number(experience) || 0;
      data.project_types = projectTypes;
      data.bio = bio;
      data.rating = 0;
    }

    const { data: res, error: signErr } = await supabase.auth.signUp({
      email,
      password,
      options: { data },
    });

    if (signErr) {
      setError(signErr.message);
      setLoading(false);
      return;
    }

    if (!res.session) {
      // Email confirmation is enabled on the project.
      setNotice(
        "Account created. Check your email to confirm, then log in. (For the prototype, disable 'Confirm email' in Supabase → Authentication to skip this.)",
      );
      setLoading(false);
      return;
    }

    // A client-side router.push() here can race the just-written session
    // cookie and bounce through /login — a hard navigation always sends a
    // fresh request, by which point the cookie is reliably set.
    window.location.href = role === "contractor" ? "/dashboard/contractor" : "/project/new";
  }

  return (
    <div className="mx-auto w-full max-w-lg px-6 py-10">
      <div className="mb-8 flex justify-center">
        <Logo />
      </div>

      {/* Role switch */}
      <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-canvas p-1">
        {(["homeowner", "contractor"] as Role[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={`rounded-lg py-2.5 text-sm font-semibold capitalize transition ${
              role === r ? "bg-white text-navy shadow-sm" : "text-muted"
            }`}
          >
            {r === "homeowner" ? "I'm renovating" : "I'm a contractor"}
          </button>
        ))}
      </div>

      <div className="card p-6 shadow-sm">
        <h1 className="text-xl font-bold text-navy">
          {role === "homeowner"
            ? "Create your homeowner account"
            : "Create your contractor profile"}
        </h1>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="label">Full name</label>
            <input
              className="input"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your name"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                className="input"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
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
              <label className="label">Phone</label>
              <input
                className="input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          {role === "contractor" && (
            <>
              <div>
                <label className="label">Business name</label>
                <input
                  className="input"
                  required
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Sharma Interiors"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Years of experience</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={experience}
                    onChange={(e) => setExperience(e.target.value)}
                    placeholder="e.g. 10"
                  />
                </div>
              </div>
              <div>
                <label className="label">Project types you take on</label>
                <div className="flex flex-wrap gap-2">
                  {PROJECT_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleType(t)}
                      className={`badge border px-3 py-1.5 transition ${
                        projectTypes.includes(t)
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
                <label className="label">Short bio</label>
                <textarea
                  className="input min-h-20"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="What you specialise in"
                />
              </div>
            </>
          )}

          {error && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          {notice && (
            <p className="rounded-lg bg-teal-soft px-3 py-2 text-sm text-teal-dark">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className={role === "contractor" ? "btn-teal w-full" : "btn-amber w-full"}
          >
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>
      </div>

      <p className="mt-5 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-teal hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}

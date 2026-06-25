"use client";

import { useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";

export function LoginForm({ next }: { next: string }) {
  const supabase = createSupabaseBrowserClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signErr) {
      setError(signErr.message);
      setLoading(false);
      return;
    }
    // A client-side router.push() here can race the just-written session
    // cookie and bounce through /login — a hard navigation always sends a
    // fresh request, by which point the cookie is reliably set.
    window.location.href = next || "/dashboard";
  }

  return (
    <div className="mx-auto w-full max-w-md px-6 py-10">
      <div className="mb-8 flex justify-center">
        <Logo />
      </div>
      <div className="card p-6 shadow-sm">
        <h1 className="text-xl font-bold text-navy">Welcome back</h1>
        <p className="mt-1 text-sm text-muted">Log in to your account.</p>
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <button type="submit" disabled={loading} className="btn-amber w-full">
            {loading ? "Logging in…" : "Log in"}
          </button>
        </form>
      </div>
      <p className="mt-5 text-center text-sm text-muted">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-teal hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}

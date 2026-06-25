"use client";

import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import type { Role } from "@/lib/types";

export function AppNav({ role, name }: { role: Role; name: string }) {
  const supabase = createSupabaseBrowserClient();

  async function logout() {
    await supabase.auth.signOut();
    // Hard navigation, not router.push — same cookie-write race as signup/login.
    window.location.href = "/";
  }

  const home = role === "contractor" ? "/dashboard/contractor" : "/dashboard";

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <Logo href={home} />
        <nav className="flex items-center gap-1 text-sm font-medium sm:gap-2">
          <Link
            href={home}
            className="rounded-lg px-3 py-2 text-navy hover:bg-canvas"
          >
            Dashboard
          </Link>
          {role === "homeowner" && (
            <>
              <Link
                href="/project/new"
                className="rounded-lg px-3 py-2 text-navy hover:bg-canvas"
              >
                New project
              </Link>
              <Link
                href="/marketplace"
                className="rounded-lg px-3 py-2 text-navy hover:bg-canvas"
              >
                Contractors
              </Link>
            </>
          )}
          <span className="mx-1 hidden text-muted sm:inline">·</span>
          <span className="hidden text-sm text-muted sm:inline">{name}</span>
          <button
            onClick={logout}
            className="rounded-lg border border-line px-3 py-2 text-navy hover:bg-canvas"
          >
            Log out
          </button>
        </nav>
      </div>
    </header>
  );
}

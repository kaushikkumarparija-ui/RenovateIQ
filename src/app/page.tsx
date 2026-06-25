import Link from "next/link";
import { Logo } from "@/components/Logo";

const TRUST = [
  {
    title: "AI is your architect — free",
    body: "A complete, sequenced plan and itemised budget in 60 seconds. No paid consultation, no waiting.",
    icon: "🧠",
  },
  {
    title: "Scope locked before contractors enter",
    body: "You decide exactly what's being built and what it should cost — before a single contractor sees your project.",
    icon: "🔒",
  },
  {
    title: "Buffer budget enforced",
    body: "A hard ceiling with a built-in cushion. No surprise demands halfway through the job.",
    icon: "🛡️",
  },
];

const STEPS = [
  ["Describe it", "Tell us the room, your city, the home's age and budget — in plain words."],
  ["Get the plan", "Timeline, itemised budget, hidden-condition flags and a risk register."],
  ["Lock the scope", "Freeze it into a PDF you control. Now match with a contractor."],
];

export default function HomeownerLanding() {
  return (
    <main className="flex min-h-full flex-col">
      {/* Nav */}
      <header className="flex items-center justify-between px-6 py-5 md:px-12">
        <Logo />
        <nav className="flex items-center gap-3 text-sm font-medium">
          <Link
            href="/contractor"
            className="hidden text-muted hover:text-navy sm:inline"
          >
            For contractors
          </Link>
          <Link href="/login" className="text-navy hover:text-teal">
            Log in
          </Link>
          <Link href="/signup?role=homeowner" className="btn-amber px-4 py-2">
            Get started
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-navy px-6 py-20 text-white md:px-12 md:py-28">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full opacity-20 blur-3xl"
          style={{ background: "var(--color-amber)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full opacity-10 blur-3xl"
          style={{ background: "var(--color-teal)" }}
        />
        <div className="relative mx-auto max-w-3xl text-center">
          <span className="badge mb-6 bg-white/10 text-amber">
            Built for India 🇮🇳
          </span>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight md:text-6xl">
            Renovate Your Dream Home —{" "}
            <span className="bg-gradient-to-r from-amber to-[#ffd9a8] bg-clip-text text-transparent">
              Without the Nightmares.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/80 md:text-xl">
            AI builds your complete renovation plan in 60 seconds. Scope locked.
            Budget protected. Contractor matched.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup?role=homeowner"
              className="btn-amber w-full px-7 py-3.5 text-base sm:w-auto"
            >
              Plan my renovation →
            </Link>
            <Link
              href="/login"
              className="btn w-full border border-white/20 px-7 py-3.5 text-base text-white hover:bg-white/10 sm:w-auto"
            >
              I have an account
            </Link>
          </div>
        </div>
      </section>

      {/* Trust signals */}
      <section className="mx-auto mt-14 grid w-full max-w-6xl gap-5 px-6 md:grid-cols-3 md:px-12">
        {TRUST.map((t) => (
          <div key={t.title} className="card card-hover p-6">
            <div className="mb-3 text-3xl">{t.icon}</div>
            <h3 className="text-lg font-bold text-navy">{t.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{t.body}</p>
          </div>
        ))}
      </section>

      {/* How it works */}
      <section className="mx-auto w-full max-w-6xl px-6 py-20 md:px-12">
        <h2 className="text-center text-2xl font-extrabold text-navy md:text-3xl">
          From idea to locked scope in three steps
        </h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map(([title, body], i) => (
            <div key={title} className="card card-hover p-7">
              <div className="mb-4 grid h-10 w-10 place-items-center rounded-full bg-teal-soft font-bold text-teal">
                {i + 1}
              </div>
              <h3 className="text-lg font-bold text-navy">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 text-center">
          <Link href="/signup?role=homeowner" className="btn-teal px-8 py-3.5 text-base">
            Start free — no contractor needed yet
          </Link>
        </div>
      </section>

      <footer className="mt-auto border-t border-line bg-white px-6 py-8 text-sm text-muted md:px-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
          <Logo />
          <p>Prototype · AI estimates are not a substitute for a site survey.</p>
          <Link href="/contractor" className="hover:text-navy">
            Are you a contractor? →
          </Link>
        </div>
      </footer>
    </main>
  );
}

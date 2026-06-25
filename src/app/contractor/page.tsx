import Link from "next/link";
import { Logo } from "@/components/Logo";

const TRUST = [
  {
    title: "Pre-qualified leads",
    body: "Every lead arrives with a locked scope and a defined budget. No tyre-kickers.",
    icon: "🎯",
  },
  {
    title: "No scope creep",
    body: "The job is documented before you quote. What's agreed is what's built.",
    icon: "📋",
  },
  {
    title: "No payment disputes",
    body: "A clear ceiling and a written record of every conversation, on the platform.",
    icon: "🤝",
  },
];

export default function ContractorLanding() {
  return (
    <main className="flex min-h-full flex-col">
      <header className="flex items-center justify-between px-6 py-5 md:px-12">
        <Logo href="/contractor" />
        <nav className="flex items-center gap-3 text-sm font-medium">
          <Link href="/" className="hidden text-muted hover:text-navy sm:inline">
            For homeowners
          </Link>
          <Link href="/login" className="text-navy hover:text-teal">
            Log in
          </Link>
          <Link href="/signup?role=contractor" className="btn-teal px-4 py-2">
            Join as a pro
          </Link>
        </nav>
      </header>

      <section className="relative overflow-hidden bg-navy px-6 py-20 text-white md:px-12 md:py-28">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full opacity-20 blur-3xl"
          style={{ background: "var(--color-teal)" }}
        />
        <div className="relative mx-auto max-w-3xl text-center">
          <span className="badge mb-6 bg-white/10 text-teal">
            For renovation professionals
          </span>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight md:text-6xl">
            Help Make Their <span className="text-teal">Dream Come True.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/80 md:text-xl">
            Receive pre-qualified leads with locked scopes and defined budgets.
            No tyre-kickers. No scope creep. No payment disputes.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup?role=contractor"
              className="btn-teal w-full px-7 py-3.5 text-base sm:w-auto"
            >
              Join as a pro →
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

      <section className="mx-auto -mt-12 grid w-full max-w-6xl gap-5 px-6 md:grid-cols-3 md:px-12">
        {TRUST.map((t) => (
          <div key={t.title} className="card p-6 shadow-sm">
            <div className="mb-3 text-3xl">{t.icon}</div>
            <h3 className="text-lg font-bold text-navy">{t.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{t.body}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto w-full max-w-3xl px-6 py-20 text-center md:px-12">
        <h2 className="text-2xl font-extrabold text-navy md:text-3xl">
          The homeowner did the homework. You just do great work.
        </h2>
        <p className="mt-4 text-muted">
          Build a verified portfolio, manage your pipeline, and win jobs where
          the scope and budget are already agreed.
        </p>
        <div className="mt-8">
          <Link href="/signup?role=contractor" className="btn-navy px-8 py-3.5 text-base">
            Create my contractor profile
          </Link>
        </div>
      </section>

      <footer className="mt-auto border-t border-line bg-white px-6 py-8 text-sm text-muted md:px-12">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Logo href="/contractor" />
          <Link href="/" className="hover:text-navy">
            Homeowner? Plan your renovation →
          </Link>
        </div>
      </footer>
    </main>
  );
}

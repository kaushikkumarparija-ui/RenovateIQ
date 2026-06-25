import Link from "next/link";

export function Logo({
  href = "/",
  dark = false,
}: {
  href?: string;
  dark?: boolean;
}) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber font-bold text-navy shadow-sm">
        R
      </span>
      <span
        className={`text-lg font-extrabold tracking-tight ${
          dark ? "text-white" : "text-navy"
        }`}
      >
        Renovate<span className="text-amber">IQ</span>
      </span>
    </Link>
  );
}

// Indian number / currency / date formatting helpers.

const inr0 = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** ₹1,20,000 — Indian digit grouping, no paise. */
export function formatINR(n: number): string {
  return inr0.format(Math.round(n || 0));
}

/** Always a range: "₹X — ₹Y". */
export function formatRange(min: number, max: number): string {
  return `${formatINR(min)} — ${formatINR(max)}`;
}

/** Compact lakh display for headlines: ₹4.5L */
export function formatLakh(n: number): string {
  const l = n / 100000;
  const s = Number.isInteger(l) ? l.toString() : l.toFixed(1);
  return `₹${s}L`;
}

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** Add whole days to a date (UTC-safe for date-only values). */
export function addDays(start: Date | string, days: number): Date {
  const d = typeof start === "string" ? new Date(start + "T00:00:00") : new Date(start);
  d.setDate(d.getDate() + Math.round(days));
  return d;
}

/** "5 Mar 2026" */
export function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d + "T00:00:00") : d;
  return dateFmt.format(date);
}

/** Calendar date for a project "day N" offset from start. */
export function projectDate(start: string, dayOffset: number): string {
  return formatDate(addDays(start, dayOffset));
}

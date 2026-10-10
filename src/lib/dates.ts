const TZ = "Africa/Lagos";

/** Today's date in Lagos as YYYY-MM-DD. */
export function todayLagos(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Current month in Lagos as YYYY-MM. */
export function currentMonthKey(now: Date = new Date()): string {
  return todayLagos(now).slice(0, 7);
}

export function isMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function isDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** YYYY-MM -> Date at UTC midnight on the 1st (suitable for a @db.Date column). */
export function monthStart(key: string): Date {
  return new Date(`${key}-01T00:00:00Z`);
}

/** Exclusive end of the month: first day of the next month. */
export function monthEnd(key: string): Date {
  const d = monthStart(key);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

export function dateFromString(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

export function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function monthKeyOf(d: Date): string {
  return d.toISOString().slice(0, 7);
}

export function addMonths(key: string, delta: number): string {
  const d = monthStart(key);
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1));
  return next.toISOString().slice(0, 7);
}

export function monthLabel(key: string): string {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    monthStart(key),
  );
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(dateFromString(value));
}

/** Adds one recurrence step to a YYYY-MM-DD date. */
export function advanceDate(value: string, frequency: "weekly" | "monthly" | "yearly"): string {
  const d = dateFromString(value);
  const day = d.getUTCDate();
  if (frequency === "weekly") {
    d.setUTCDate(day + 7);
    return toDateString(d);
  }
  const months = frequency === "monthly" ? 1 : 12;
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return toDateString(target);
}

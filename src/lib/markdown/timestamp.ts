import type { TimestampStyle } from "./types";

const LOCALE = "hu-HU";

const OPTIONS: Record<Exclude<TimestampStyle, "R">, Intl.DateTimeFormatOptions> = {
  t: { hour: "2-digit", minute: "2-digit" },
  T: { hour: "2-digit", minute: "2-digit", second: "2-digit" },
  d: { year: "numeric", month: "2-digit", day: "2-digit" },
  D: { year: "numeric", month: "long", day: "numeric" },
  f: { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" },
  F: {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
};

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

/** Renders <t:unix:style> the way Discord does, localised to Hungarian. */
export function formatTimestamp(unix: number, style: TimestampStyle, now = Date.now()): string {
  const date = new Date(unix * 1000);
  if (Number.isNaN(date.getTime())) return String(unix);
  if (style !== "R") return date.toLocaleString(LOCALE, OPTIONS[style]);

  const deltaSeconds = Math.round((date.getTime() - now) / 1000);
  const absolute = Math.abs(deltaSeconds);
  const [unit, size] = UNITS.find(([, seconds]) => absolute >= seconds) ?? UNITS[UNITS.length - 1];
  const value = Math.round(deltaSeconds / size);
  return new Intl.RelativeTimeFormat(LOCALE, { numeric: "always" }).format(value, unit);
}

/** Full, unambiguous form used as the hover title of every timestamp. */
export function formatFullTimestamp(unix: number): string {
  const date = new Date(unix * 1000);
  return Number.isNaN(date.getTime()) ? String(unix) : date.toLocaleString(LOCALE, OPTIONS.F);
}

/** Relative timestamps need periodic re-rendering; this is the tick interval. */
export function relativeRefreshMs(unix: number, now = Date.now()): number {
  const absolute = Math.abs(unix * 1000 - now);
  if (absolute < 60_000) return 5_000;
  if (absolute < 3_600_000) return 30_000;
  return 300_000;
}

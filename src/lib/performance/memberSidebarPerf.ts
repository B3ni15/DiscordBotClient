import { GuildMemberFlags, type APIGuildMember } from "discord-api-types/v10";
import { groupMembersByHoistedRole } from "@/lib/discord/roles";

interface Metric {
  count: number;
  totalMs: number;
  maxMs: number;
  items: number;
}

const isDevelopment = process.env.NODE_ENV !== "production";
const metrics = new Map<string, Metric>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function record(name: string, elapsedMs: number, items: number) {
  const metric = metrics.get(name) ?? { count: 0, totalMs: 0, maxMs: 0, items: 0 };
  metric.count += 1;
  metric.totalMs += elapsedMs;
  metric.maxMs = Math.max(metric.maxMs, elapsedMs);
  metric.items += items;
  metrics.set(name, metric);

  if (flushTimer === null) flushTimer = setTimeout(flushMetrics, 2_000);
}

export function recordMemberSidebarDuration(name: string, elapsedMs: number, items = 0) {
  if (!isDevelopment || typeof window === "undefined") return;
  record(name, elapsedMs, items);
}

export function measureMemberSidebarMetric<T>(
  name: string,
  operation: () => T,
  items = 0,
): T {
  if (!isDevelopment || typeof window === "undefined") return operation();
  const start = performance.now();
  try {
    return operation();
  } finally {
    record(name, performance.now() - start, items);
  }
}

function flushMetrics() {
  flushTimer = null;
  if (metrics.size === 0) return;

  const summary = Object.fromEntries(
    [...metrics].map(([name, metric]) => [
      name,
      {
        count: metric.count,
        totalMs: Number(metric.totalMs.toFixed(2)),
        maxMs: Number(metric.maxMs.toFixed(2)),
        items: metric.items,
      },
    ]),
  );
  metrics.clear();
  console.debug("[member-sidebar-perf] aggregate (2s window)", summary);
}

export function runMemberSidebarGroupingStressTest(memberCount = 5_000, iterations = 3) {
  if (!isDevelopment) {
    throw new Error("The member sidebar stress test is available only in development.");
  }
  if (!Number.isInteger(memberCount) || memberCount < 1 || memberCount > 50_000) {
    throw new RangeError("memberCount must be an integer between 1 and 50000.");
  }
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 20) {
    throw new RangeError("iterations must be an integer between 1 and 20.");
  }

  const members = Array.from({ length: memberCount }, (_, index) => {
    const id = String(BigInt(index + 1) + 1_000_000_000_000_000_000n);
    return {
      nick: `Synthetic Member ${String(memberCount - index).padStart(6, "0")}`,
      roles: [],
      deaf: false,
      mute: false,
      flags: GuildMemberFlags.DidRejoin,
      joined_at: "2024-01-01T00:00:00.000Z",
      user: {
        id,
        username: `synthetic-${index}`,
        discriminator: "0",
        avatar: null,
        global_name: `Synthetic Member ${index}`,
      },
    } as APIGuildMember;
  });

  const durations: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    groupMembersByHoistedRole(members, []);
    const elapsedMs = performance.now() - started;
    durations.push(elapsedMs);
    record("synthetic-group-and-sort", elapsedMs, memberCount);
  }

  const result = {
    memberCount,
    iterations,
    totalMs: Number(durations.reduce((total, duration) => total + duration, 0).toFixed(2)),
    maxMs: Number(Math.max(...durations).toFixed(2)),
    averageMs: Number(
      (durations.reduce((total, duration) => total + duration, 0) / durations.length).toFixed(2),
    ),
  };
  console.info("[member-sidebar-perf] synthetic grouping test", result);
  return result;
}

if (isDevelopment && typeof window !== "undefined") {
  Object.assign(window, { runMemberSidebarGroupingStressTest });
}

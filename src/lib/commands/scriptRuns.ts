"use client";

import { useSyncExternalStore } from "react";
import type { LogLevel } from "./sandbox";

/** Only the newest runs are kept; this is a console, not an archive. */
export const MAX_RUNS = 30;
const MAX_LOG_LINES = 200;

export type RunStatus = "running" | "ok" | "error" | "timeout";

export interface RunLogLine {
  level: LogLevel | "system";
  text: string;
  at: number;
}

export interface ScriptRun {
  id: string;
  botId: string;
  /** Command name the script belongs to. */
  name: string;
  /** A test run from the editor: nothing was sent to the interaction. */
  test: boolean;
  /** Who used the command, for the console header. */
  userName: string | null;
  startedAt: number;
  endedAt: number | null;
  status: RunStatus;
  logs: RunLogLine[];
}

let runs: ScriptRun[] = [];
const EMPTY: ScriptRun[] = [];
const listeners = new Set<() => void>();
let runCounter = 0;

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function startRun(botId: string, name: string, test: boolean, userName: string | null): string {
  const id = `run-${++runCounter}`;
  runs = [
    { id, botId, name, test, userName, startedAt: Date.now(), endedAt: null, status: "running" as const, logs: [] },
    ...runs,
  ].slice(0, MAX_RUNS);
  emit();
  return id;
}

function update(id: string, change: (run: ScriptRun) => ScriptRun) {
  let changed = false;
  runs = runs.map((run) => {
    if (run.id !== id) return run;
    changed = true;
    return change(run);
  });
  if (changed) emit();
}

export function appendLog(id: string, level: RunLogLine["level"], text: string) {
  update(id, (run) => ({
    ...run,
    logs: [...run.logs, { level, text, at: Date.now() }].slice(-MAX_LOG_LINES),
  }));
}

export function finishRun(id: string, status: Exclude<RunStatus, "running">) {
  update(id, (run) => ({ ...run, status, endedAt: Date.now() }));
}

export function clearRuns(botId: string, name: string) {
  const next = runs.filter((run) => run.botId !== botId || run.name !== name);
  if (next.length === runs.length) return;
  runs = next;
  emit();
}

/** Every recorded run, newest first. */
export function useScriptRuns(): ScriptRun[] {
  return useSyncExternalStore(
    subscribe,
    () => runs,
    () => EMPTY,
  );
}

// Test-only factory for domain tasks.

import type { Task } from "./task";

let sequence = 0;

export function makeTask(overrides: Partial<Task> = {}): Task {
  sequence++;
  return {
    id: `task-${String(sequence).padStart(4, "0")}`,
    title: `משימה ${sequence}`,
    notes: null,
    status: "todo",
    isImportant: false,
    urgentOverride: null,
    deadline: "2026-12-31",
    startDate: null,
    scheduledAt: null,
    projectId: null,
    categoryId: null,
    completedAt: null,
    createdAt: "2026-10-01T08:00:00.000Z",
    ...overrides,
  };
}

/** Deterministic Fisher–Yates shuffle (mulberry32). */
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  let state = seed;
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

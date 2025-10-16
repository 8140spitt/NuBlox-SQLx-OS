
export type Plan = { summary: string, steps: string[] };
export type ApplyReport = { ok: boolean, elapsedMs: number, logs: string[] };

export function planDiff(fromIR: object, toIR: object): Plan {
  return { summary: "No-op plan (starter)", steps: [] };
}

export async function applyPlan(plan: Plan): Promise<ApplyReport> {
  return { ok: true, elapsedMs: 1, logs: ["starter apply noop"] };
}

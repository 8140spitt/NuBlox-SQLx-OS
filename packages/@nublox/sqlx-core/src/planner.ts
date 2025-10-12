import type { Plan } from './ir.js';


export function diffSnapshots(_a: any, _b: any): Plan {
    // TODO: implement real diff; Phase 1 returns an empty plan
    return { ops: [], risk: 'low', summary: 'Phase 1 placeholder plan' };
}


export async function applyPlan(_url: string, plan: Plan, _opts: { riskBudget: string }) {
    // TODO: leader election, tx grouping, retries, audit in later phases
    return { ok: true, applied: plan.ops.length };
}
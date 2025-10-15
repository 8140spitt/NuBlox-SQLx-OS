import type { Session, Transport } from '@nublox/sqlx-transport';
import type { CapabilityMatrix } from '@nublox/sqlx-flo';

export type IRSchemaSnapshot = { objects: any[] };
export type PlanStep = { op: string; sql?: string; rationale?: string; rollbackSql?: string };
export type Plan = { steps: PlanStep[]; risk: 'low'|'med'|'high'; rationale: string[] };
export type ApplyReport = { ok: boolean; startedAt: string; finishedAt?: string; actions: any[] };
export type ImproveGoals = { reduceLatencyPct?: number; reduceStoragePct?: number };
export type SchemaImprovementPlan = Plan;

export interface Planner {
  snapshot(session: Session): Promise<IRSchemaSnapshot>;
  diff(from: IRSchemaSnapshot, to: IRSchemaSnapshot): Promise<Plan>;
  schemaImprove(session: Session, goals?: ImproveGoals): Promise<SchemaImprovementPlan>;
  apply(session: Session, plan: Plan | SchemaImprovementPlan, opts?: Record<string, unknown>): Promise<ApplyReport>;
}

export function createPlanner(caps: CapabilityMatrix, transport: Transport): Planner {
  return {
    async snapshot(_session) {
      return { objects: [] };
    },
    async diff(_from, _to) {
      return { steps: [{ op: 'noop', rationale: 'stub' }], risk: 'low', rationale: ['stub planner'] };
    },
    async schemaImprove(_session, goals) {
      const steps: PlanStep[] = [];
      if (caps.features.concurrentIndexCreate) {
        steps.push({ op: 'create_index', sql: 'CREATE INDEX CONCURRENTLY idx_stub ON t(c)', rollbackSql: 'DROP INDEX CONCURRENTLY idx_stub', rationale: 'concurrent available' });
      } else {
        steps.push({ op: 'create_index', sql: 'CREATE INDEX idx_stub ON t(c)', rollbackSql: 'DROP INDEX idx_stub', rationale: 'fallback path' });
      }
      if (goals?.reduceLatencyPct) {
        steps.push({ op: 'analyze', sql: 'ANALYZE', rationale: 'improve planner stats' });
      }
      return { steps, risk: 'low', rationale: ['auto SIP (stub)'] };
    },
    async apply(session, plan, _opts) {
      const startedAt = new Date().toISOString();
      const actions = [];
      for (const s of plan.steps) {
        if (s.sql) {
          await transport.exec(session, { sql: s.sql });
        }
        actions.push({ step: s.op, ok: true });
      }
      return { ok: true, startedAt, finishedAt: new Date().toISOString(), actions };
    }
  };
}

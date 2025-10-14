import { loadTransportFromRegistry, runHandshake } from '@nublox/sqlx-transport';
import { learnCapabilities, CapabilityMatrix } from '@nublox/sqlx-flo';
import type { Transport, Session } from '@nublox/sqlx-transport';
import { createPlanner, Planner, IRSchemaSnapshot, Plan, SchemaImprovementPlan, ApplyReport, ImproveGoals } from '@nublox/sqlx-planner';

export interface Driver {
  url: string;
  ping(): Promise<void>;
  execute(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount?: number }>;
  explain(sql: string): Promise<any>;
  snapshot(): Promise<IRSchemaSnapshot>;
  capabilities(): Promise<CapabilityMatrix>;
  plan: {
    diff(from: IRSchemaSnapshot, to: IRSchemaSnapshot): Promise<Plan>;
    schemaImprove(goals?: ImproveGoals): Promise<SchemaImprovementPlan>;
    apply(plan: Plan | SchemaImprovementPlan, opts?: Record<string, unknown>): Promise<ApplyReport>;
  };
  close(): Promise<void>;
}

export async function createDriver(rawUrl: string): Promise<Driver> {
  const { transportPackPath, transport } = await loadTransportFromRegistry(rawUrl, process.cwd());
  const { session } = await runHandshake(transportPackPath, rawUrl);
  const caps = await learnCapabilities(session);
  const planner: Planner = createPlanner(caps, transport);

  return {
    url: rawUrl,
    async ping() { return transport.ping(session); },
    async execute(sql, params) { return transport.exec(session, { sql, params }); },
    async explain(sql) { return transport.explain(session, sql); },
    async snapshot() { return planner.snapshot(session); },
    async capabilities() { return caps; },
    plan: {
      diff(from, to) { return planner.diff(from, to); },
      schemaImprove(goals) { return planner.schemaImprove(session, goals); },
      apply(plan, opts) { return planner.apply(session, plan, opts); }
    },
    async close() { return transport.close(session); }
  };
}

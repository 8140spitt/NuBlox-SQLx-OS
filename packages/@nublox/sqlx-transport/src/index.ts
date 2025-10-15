import { URL } from 'node:url';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type Session = {
  id: string;
  url: string;
  packName: string;
  connectedAt: number;
  // optional extra info provided by specific transports
  meta?: Record<string, unknown>;
};

export interface ExecResult { rows: any[]; rowCount?: number }
export interface Transport {
  handshake(packPath: string, url: string, policy?: any): Promise<{ session: Session }>;
  exec(session: Session, req: { sql: string; params?: unknown[] }): Promise<ExecResult>;
  explain(session: Session, sql: string): Promise<any>;
  ping(session: Session): Promise<void>;
  close(session: Session): Promise<void>;
}

export async function loadTransportFromRegistry(rawUrl: string, cwd: string): Promise<{ transportPackPath: string; transport: Transport; }> {
  const scheme = new URL(rawUrl).protocol.replace(':', '').toLowerCase();
  const regPath = path.resolve(cwd, 'transports', 'registry.json');
  const reg = JSON.parse(await readFile(regPath, 'utf8'));

  const entry = reg.families[scheme];
  if (!entry) throw new Error(`No transport pack for scheme '${scheme}'`);

  const packPath = path.resolve(cwd, 'transports', entry.pack);

  // If a module is specified, dynamically import it; otherwise use the default stub.
  if (entry.module) {
    const mod = await import(entry.module);
    const transport: Transport = mod.default ?? mod.transport ?? mod;
    if (!transport?.handshake) throw new Error(`Transport module '${entry.module}' did not export a Transport`);
    return { transportPackPath: packPath, transport };
  }
  return { transportPackPath: packPath, transport: defaultTransport };
}

export async function runHandshake(packPath: string, rawUrl: string) {
  return defaultTransport.handshake(packPath, rawUrl, { requireTLSForRemote: true, allowPlainLocalhost: true });
}

// Minimal fallback (kept for other families until we add them)
export const defaultTransport: Transport = {
  async handshake(packPath, url, _policy) {
    const pack = JSON.parse(await readFile(packPath, 'utf8'));
    const session: Session = { id: crypto.randomUUID(), url, packName: pack.name, connectedAt: Date.now() };
    return { session };
  },
  async exec(_session, req) {
    return { rows: [{ ok: true, sql: req.sql }], rowCount: 1 };
  },
  async explain(_session, sql) { return { plan: 'stub', sql }; },
  async ping(_session) { return; },
  async close(_session) { return; }
};

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

  // If a module is specified, dynamically import it; otherwise use wire protocol or default stub.
  if (entry.module) {
    const mod = await import(entry.module);
    const transport: Transport = mod.default ?? mod.transport ?? mod;
    if (!transport?.handshake) throw new Error(`Transport module '${entry.module}' did not export a Transport`);
    return { transportPackPath: packPath, transport };
  }

  // If transports array is specified, use wire protocol transport
  if (entry.transports && entry.transports.length > 0) {
    return { transportPackPath: packPath, transport: wireProtocolTransport };
  }

  return { transportPackPath: packPath, transport: defaultTransport };
}

export async function runHandshake(packPath: string, rawUrl: string) {
  return defaultTransport.handshake(packPath, rawUrl, { requireTLSForRemote: true, allowPlainLocalhost: true });
}

// Wire protocol transport for TDL-based connections
export const wireProtocolTransport: Transport = {
  async handshake(packPath, url, policy) {
    const pack = JSON.parse(await readFile(packPath, 'utf8'));
    const parsedUrl = new URL(url);

    // Basic TLS policy check
    const isRemote = parsedUrl.hostname !== 'localhost' && parsedUrl.hostname !== '127.0.0.1';
    const requireTLS = policy?.requireTLSForRemote && isRemote;

    if (requireTLS && parsedUrl.protocol !== 'mysqls:') {
      console.warn(`⚠️  Security Warning: TLS required for remote connection to ${parsedUrl.hostname}`);
    }

    const session: Session = {
      id: crypto.randomUUID(),
      url,
      packName: pack.name,
      connectedAt: Date.now(),
      meta: {
        protocol: pack.protocol,
        security: {
          tls: requireTLS ? 'required' : 'optional',
          trust: policy?.trust || pack.security?.trustDefault || 'system',
          fingerprint: policy?.fingerprint || null
        }
      }
    };

    console.log(`🔌 Connected to ${pack.name} at ${parsedUrl.hostname}:${parsedUrl.port || 3306}`);
    return { session };
  },

  async exec(session, req) {
    // For now, simulate execution - in production this would implement the actual wire protocol
    await new Promise(resolve => setTimeout(resolve, Math.random() * 50)); // Simulate network latency

    const sql = req.sql.toLowerCase().trim();

    if (sql.startsWith('select version()')) {
      return { rows: [{ version: 'MySQL 8.0.39' }], rowCount: 1 };
    }

    if (sql.includes('show variables')) {
      return {
        rows: [
          { Variable_name: 'version_comment', Value: 'MySQL Community Server - GPL' },
          { Variable_name: 'sql_mode', Value: 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' }
        ],
        rowCount: 2
      };
    }

    if (sql.startsWith('select') || sql.startsWith('show')) {
      return { rows: [{ status: 'simulated_query', sql: req.sql }], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  },

  async explain(session, sql) {
    return {
      query_block: {
        select_id: 1,
        cost_info: { query_cost: "1.00" },
        table: { table_name: "simulated", access_type: "ALL" }
      },
      sql
    };
  },

  async ping(session) {
    // Simulate ping latency
    await new Promise(resolve => setTimeout(resolve, 5));
    return;
  },

  async close(session) {
    console.log(`📴 Closed connection ${session.id}`);
    return;
  }
};

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

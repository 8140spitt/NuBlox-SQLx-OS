import type { Session, Transport } from '@nublox/sqlx-transport';
import { loadTDL } from './tdl';


export interface CapabilityMatrix {
  version: string;
  features: Record<string, boolean | string | number>;
  limits: Record<string, number>;
  sql: { supports: string[]; reservedWords: string[] };
  security?: { tls: 'on' | 'off' | 'unknown'; trust?: 'system' | 'selfsigned' | 'pin' | 'unknown'; fingerprint?: string };
}

export type ServerGreeting = {
  serverCaps: number;
  authPlugin: string;
  versionText?: string;
  isLocalhost?: boolean;
  wantTLS?: boolean;
};

export const CLIENT_CAP = {
  LONG_PASSWORD: 0x00000001,
  FOUND_ROWS: 0x00000002,
  LONG_FLAG: 0x00000004,
  CONNECT_WITH_DB: 0x00000008,
  PROTOCOL_41: 0x00000200,
  SECURE_CONNECTION: 0x00000800,
  MULTI_STATEMENTS: 0x00010000,
  MULTI_RESULTS: 0x00020000,
  PS_MULTI_RESULTS: 0x00040000,
  PLUGIN_AUTH: 0x00080000,
  CONNECT_ATTRS: 0x00100000,
  SSL: 0x08000000
} as const;

export type HandshakePolicy = {
  requireTLSForRemote?: boolean;
  allowPlainLocalhost?: boolean;
  connect_timeout_seconds?: number;
};

export function proposeClientCaps(g: ServerGreeting, policy?: HandshakePolicy): number {
  const isLocal = !!g.isLocalhost;
  const wantTLS = !!g.wantTLS || (!!policy?.requireTLSForRemote && !isLocal);

  let caps =
    CLIENT_CAP.PROTOCOL_41 |
    CLIENT_CAP.SECURE_CONNECTION |
    CLIENT_CAP.LONG_PASSWORD |
    CLIENT_CAP.LONG_FLAG |
    CLIENT_CAP.MULTI_RESULTS |
    CLIENT_CAP.PLUGIN_AUTH |
    CLIENT_CAP.CONNECT_ATTRS |
    CLIENT_CAP.CONNECT_WITH_DB;

  if (wantTLS) caps |= CLIENT_CAP.SSL;
  return caps >>> 0;
}

/** Learn capabilities by executing TDL probes via the transport. */
export async function learnCapabilitiesTDL(opts: {
  session: Session;
  transport: Transport;
  packPath: string;
}): Promise<CapabilityMatrix> {
  const { session, transport, packPath } = opts;
  const tdl = await loadTDL(packPath);

  // --- 1) VERSION probe
  let versionText = 'unknown';
  try {
    const res = await transport.exec(session, { sql: tdl.discover.version.sql });
    const row0 = Array.isArray(res.rows) && res.rows[0];
    versionText = (row0 && (row0.version || row0.VERSION || row0[0])) ?? 'unknown';
  } catch { /* keep unknown */ }

  // --- 2) VARIABLES (optional)
  const variables: Record<string, any> = {};
  if (Array.isArray(tdl.discover.variables)) {
    for (const v of tdl.discover.variables) {
      try {
        const r = await transport.exec(session, { sql: v.sql });
        // MySQL SHOW VARIABLES LIKE returns: [ { Variable_name, Value } ]
        const row = Array.isArray(r.rows) && r.rows[0];
        if (row) {
          const key = (row.Variable_name || row.variable_name || v.key || '').toString();
          const val = row.Value ?? row.value ?? null;
          variables[key || v.key] = val;
        }
      } catch { /* swallow benign probe failures */ }
    }
  }

  // --- 3) Derive features by version rules + probes
  const features: Record<string, any> = { ...(tdl.defaults?.features || {}) };
  const supports: string[] = [];

  const vOk = (min?: string) => (min ? semverGte(versionText, min) : true);

  if (Array.isArray(tdl.rules?.featuresByVersion)) {
    for (const rule of tdl.rules.featuresByVersion) {
      if (vOk(rule.minVersion)) {
        features[rule.key] = true;
        if (rule.key.startsWith('sql.')) supports.push(rule.key.replace(/^sql\./, ''));
      }
    }
  }
  if (Array.isArray(tdl.rules?.featuresByProbe)) {
    for (const rule of tdl.rules.featuresByProbe) {
      const cond = rule.assumeTrueIf || {};
      if (vOk(cond.minVersion)) {
        features[rule.key] = true;
      }
    }
  }

  // --- 4) Limits (defaults; you can add TDL-driven derivations later)
  const limits = { ...(tdl.defaults?.limits || {}) };

  // --- 5) Security (TLS from session meta; trust from TDL default)
  const tlsOn = ((session.meta as any)?.tls === true) ? 'on' : 'off';
  const trust = tdl.security?.trustDefault || 'system';

  // --- 6) Final matrix conforms to your CLI shape
  return {
    version: inferFamilyFromPackName(session.packName) + '-' + (versionText || 'unknown'),
    features: {
      concurrentIndexCreate: !!features['ddl.concurrentIndexCreate'],
      alterColumnOnline: !!features['ddl.onlineAlter']
    },
    limits,
    sql: { supports, reservedWords: [] },
    security: { tls: tlsOn, trust }
  };
}

// ---- helpers ----
function inferFamilyFromPackName(packName: string): string {
  if (!packName) return 'unknown';
  if (packName.includes('mysql')) return 'mysql';
  if (packName.includes('pg')) return 'postgres';
  if (packName.includes('sqlite')) return 'sqlite';
  return 'unknown';
}

function parseSemver(s: string): [number, number, number] | null {
  if (!s) return null;
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(s);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
function semverGte(a: string, min: string): boolean {
  const A = parseSemver(a); const B = parseSemver(min);
  if (!A || !B) return false;
  for (let i = 0; i < 3; i++) {
    if (A[i] > B[i]) return true;
    if (A[i] < B[i]) return false;
  }
  return true;
}

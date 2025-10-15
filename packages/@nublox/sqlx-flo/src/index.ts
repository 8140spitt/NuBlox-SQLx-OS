import type { Session } from '@nublox/sqlx-transport';

export interface CapabilityMatrix {
  version: string;
  features: Record<string, boolean | string | number>;
  limits: Record<string, number>;
  sql: { supports: string[]; reservedWords: string[] };
  security?: { tls: 'on' | 'off' | 'unknown'; trust?: 'system' | 'selfsigned' | 'pin' | 'unknown'; fingerprint?: string };
}

/** Server greeting snapshot supplied by the transport prior to auth. */
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

/** FLO proposes the client capability bitmask from greeting + policy. */
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

/** Existing learn() stub (post-auth, keep as-is for now). */
export async function learnCapabilities(session: Session): Promise<CapabilityMatrix> {
  const isPg = (session.packName || '').includes('pg');
  const isMy = (session.packName || '').includes('mysql');
  const ver = isPg ? 'pg-unknown' : isMy ? 'mysql-unknown' : 'sqlite-unknown';
  return {
    version: ver,
    features: { concurrentIndexCreate: !!isPg, alterColumnOnline: !!isMy },
    limits: { maxIdentifierLen: 63, maxParams: 32767 },
    sql: { supports: ['cte', 'window', 'json'], reservedWords: [] },
    security: { tls: 'unknown', trust: 'unknown' }
  };
}

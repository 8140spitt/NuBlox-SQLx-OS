import type { Session } from '@nublox/sqlx-transport';

export interface CapabilityMatrix {
  version: string;
  features: Record<string, boolean | string | number>;
  limits: Record<string, number>;
  sql: { supports: string[]; reservedWords: string[] };
  security?: { tls: 'on' | 'off'; fingerprint?: string; trust?: string };
}

export async function learnCapabilities(session: Session): Promise<CapabilityMatrix> {
  // placeholder: infer from URL pack name only for now
  const isPg = session.packName.includes('pg');
  const isMy = session.packName.includes('mysql');
  const ver = isPg ? 'pg-unknown' : isMy ? 'mysql-unknown' : 'sqlite-unknown';
  return {
    version: ver,
    features: {
      concurrentIndexCreate: isPg ? true : false,
      alterColumnOnline: isMy ? true : false
    },
    limits: { maxIdentifierLen: 63, maxParams: 32767 },
    sql: { supports: ['cte','window','json'], reservedWords: [] },
    security: { tls: 'on', trust: 'system' }
  };
}

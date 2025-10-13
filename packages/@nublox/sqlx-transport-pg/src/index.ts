export * from './probe.js';
export * from './client.js';

// Export standard interface functions
import { probePostgres } from './probe.js';
import { PostgresClient } from './client.js';
import type { ProbeInfo, ISqlxClient } from '@nublox/sqlx-core';

export async function probe(url: string, timeoutMs?: number): Promise<ProbeInfo> {
    const result = await probePostgres(url, timeoutMs);
    return {
        dialect: 'pg',
        version: null, // PostgreSQL probe doesn't get version during handshake
        tls: result.tlsOffered || false,
        capabilities: {
            portOpen: result.portOpen || false,
            tlsOffered: result.tlsOffered || false
        }
    };
}

export async function connect(url: string): Promise<ISqlxClient> {
    return PostgresClient.connect(url);
}

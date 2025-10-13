export * from './probe.js';
export * from './client.js';

// Export standard interface functions
import { probeMySQL } from './probe.js';
import { MySQLClient } from './client.js';
import type { ProbeInfo, ISqlxClient } from '@nublox/sqlx-core';

export async function probe(url: string, timeoutMs?: number): Promise<ProbeInfo> {
    const result = await probeMySQL(url, timeoutMs);
    return {
        dialect: 'mysql',
        version: result.serverVersion || null,
        tls: result.tlsAttempted,
        authPlugins: result.authPlugin ? [result.authPlugin] : undefined,
        capabilities: {
            portOpen: result.portOpen || false,
            capabilityBits: result.capabilityBits || 0
        }
    };
}

export async function connect(url: string): Promise<ISqlxClient> {
    return MySQLClient.connect(url);
}

import { URL } from 'url';
import type { Dialect } from '@nublox/sqlx-core';

export function parseDialect(conn: string): Dialect {
    const u = new URL(conn);
    const p = u.protocol.replace(/:$/, '').toLowerCase();
    if (p.startsWith('mysql')) return 'mysql';
    if (p.startsWith('postgres') || p === 'pg') return 'pg';
    throw new Error(`Unsupported protocol: ${p}`);
}

export function requireArg(args: string[], name: string, fallback?: string): string {
    const i = args.indexOf(`--${name}`);
    if (i >= 0 && args[i + 1]) return args[i + 1];
    if (fallback !== undefined) return fallback;
    throw new Error(`--${name} is required`);
}

export function optionalArg(args: string[], name: string, fallback?: string): string | undefined {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : fallback;
}

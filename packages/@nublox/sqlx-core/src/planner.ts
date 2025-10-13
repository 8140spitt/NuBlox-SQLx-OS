import type { Dialect } from './contracts';

/**
 * Very small param-normalizer so the CLI can run queries portably during MVP.
 * - mysql: replaces unnumbered ? with escaped values
 * - pg:    expects $1, $2, ... placeholders
 */
export function normalizeParams(sql: string, dialect: Dialect, params?: unknown[]) {
    if (!params || params.length === 0) return sql;

    if (dialect === 'mysql') {
        let i = 0;
        return sql.replace(/\?/g, () => escapeSql(params[i++]));
    }

    return sql.replace(/\$(\d+)/g, (_m, n) => {
        const ix = Number(n) - 1;
        return escapeSql(params[ix]);
    });
}

function escapeSql(v: any): string {
    if (v === null || v === undefined) return 'NULL';
    switch (typeof v) {
        case 'number': return Number.isFinite(v) ? String(v) : 'NULL';
        case 'boolean': return v ? 'TRUE' : 'FALSE';
        case 'bigint': return String(v);
        default: {
            const s = String(v).replace(/\\/g, '\\\\').replace(/'/g, "''");
            return `'${s}'`;
        }
    }
}

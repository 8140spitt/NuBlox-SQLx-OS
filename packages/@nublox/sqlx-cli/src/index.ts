//sqlx-cli/src/index.ts

#!/usr/bin / env node
import { parseDialect, requireArg, optionalArg } from './resolve.js';
import type { ISqlxClient, ProbeInfo } from '@nublox/sqlx-core';
import { normalizeParams } from '@nublox/sqlx-core';

// ✅ static namespace imports (no dynamic import typing issues)
import * as Mysql from '@nublox/sqlx-transport-mysql';
import * as Pg from '@nublox/sqlx-transport-pg';

type Cmd = 'ping' | 'learn' | 'query' | 'snapshot:pull';
const [, , rawCmd, ...rest] = process.argv;
const cmd = (rawCmd || '').toLowerCase() as Cmd;

type TransportModule = {
    probe: (url: string, timeoutMs?: number) => Promise<ProbeInfo>;
    connect: (url: string) => Promise<ISqlxClient>;
};

function getTransport(dialect: 'mysql' | 'pg'): TransportModule {
    return (dialect === 'mysql' ? Mysql : Pg) as unknown as TransportModule;
}

async function doPing(url: string, dialect: 'mysql' | 'pg') {
    const t = getTransport(dialect);
    const info = await t.probe(url, 2500);
    console.log(JSON.stringify(info, null, 2));
}

async function doLearn(url: string, dialect: 'mysql' | 'pg') {
    const t = getTransport(dialect);
    const c = await t.connect(url);
    try {
        const sql = dialect === 'mysql' ? 'SELECT VERSION() AS version' : 'SELECT version() AS version';
        const out = await c.query(sql);
        console.log(JSON.stringify(out, null, 2));
    } finally {
        await c.close().catch(() => void 0);
    }
}

async function doQuery(url: string, dialect: 'mysql' | 'pg', sql: string, params?: string) {
    const t = getTransport(dialect);
    const c = await t.connect(url);
    try {
        const parsedParams = params ? JSON.parse(params) : undefined;
        const finalSql = normalizeParams(sql, dialect, parsedParams);
        const out = await c.query(finalSql);
        console.log(JSON.stringify(out, null, 2));
    } finally {
        await c.close().catch(() => void 0);
    }
}

async function doSnapshotPull(url: string, dialect: 'mysql' | 'pg', outFile?: string) {
    const t = getTransport(dialect);
    const c = await t.connect(url);
    try {
        let rows: any[] = [];
        if (dialect === 'mysql') {
            const r = await c.query(`SELECT table_schema, table_name, table_type
                               FROM information_schema.tables
                               WHERE table_schema NOT IN ('mysql','performance_schema','information_schema','sys')`);
            rows = r.rows;
        } else {
            const r = await c.query(`SELECT table_schema, table_name, table_type
                               FROM information_schema.tables
                               WHERE table_schema NOT IN ('pg_catalog','information_schema')`);
            rows = r.rows;
        }
        const json = JSON.stringify({ dialect, tables: rows }, null, 2);
        if (outFile) {
            const fs = await import('node:fs');
            fs.writeFileSync(outFile, json, 'utf8');
            console.log(`wrote ${outFile}`);
        } else {
            console.log(json);
        }
    } finally {
        await c.close().catch(() => void 0);
    }
}

async function main() {
    if (!cmd) {
        console.error(`Usage:
  sqlx <cmd> --url <conn> [--sql "..."] [--params "[...json...]"] [--out file]

Commands:
  ping           Probe capabilities without logging in
  learn          Basic capability check via version()
  query          Execute a one-off SQL
  snapshot:pull  Dump a minimal table list
`);
        process.exit(2);
    }

    const url = requireArg(rest, 'url');
    const dialect = parseDialect(url);

    if (cmd === 'ping') return doPing(url, dialect);
    if (cmd === 'learn') return doLearn(url, dialect);
    if (cmd === 'query') {
        const sql = requireArg(rest, 'sql');
        const params = optionalArg(rest, 'params');
        return doQuery(url, dialect, sql, params);
    }
    if (cmd === 'snapshot:pull') {
        const out = optionalArg(rest, 'out');
        return doSnapshotPull(url, dialect, out);
    }

    console.error(`Unknown command: ${cmd}`);
    process.exit(2);
}

main().catch((e) => {
    console.error(e && (e.stack || e.message) || String(e));
    process.exit(1);
});

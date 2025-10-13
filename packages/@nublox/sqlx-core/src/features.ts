import type { ColumnSpec } from './ir.js';


export type FeatureMap = {
    quote: '"' | '`' | '[';
    ifExists: boolean; ifNotExists: boolean;
    jsonType: 'json' | 'jsonb' | 'text';
    returning: boolean;
    upsert: 'ON_CONFLICT' | 'ON_DUPLICATE' | 'NONE';
    onlineAlterHint?: string;
    boolType: 'boolean' | 'tinyint(1)';
    timestampType: 'timestamp with time zone' | 'timestamp' | 'datetime';
    transactionalDDL: boolean; maxIdentLen: number;
    serverFingerprint?: string;
    authMethods?: string[]; // Learned authentication methods
};


export async function learnFeatures(db: { query: (sql: string) => Promise<any> }, probeInfo?: { authPlugins?: string[]; dialect?: string; version?: string | null }): Promise<FeatureMap> {
    const q = async (sql: string) => db.query(sql).then(() => true, () => false);
    const quote: FeatureMap['quote'] = (await q('select 1 as "x"')) ? '"' : (await q('select 1 as `x`')) ? '`' : '[';
    const ifNotExists = await q('create table if not exists __probe_q (id int)');
    const ifExists = await q('drop table if exists __probe_q');
    let jsonType: FeatureMap['jsonType'] = 'json';
    if (!(await q('create table __probe_json (d json)'))) { jsonType = (await q('create table __probe_json (d jsonb)')) ? 'jsonb' : 'text'; }
    await q('drop table if exists __probe_json');
    await q('create table __probe_ret (id int)');
    const returning = await q('insert into __probe_ret(id) values(1) returning id');
    await q('drop table if exists __probe_ret');
    await q('create table __probe_up (id int primary key, v int)');
    const onConflict = await q('insert into __probe_up(id,v) values (1,1) on conflict (id) do update set v=excluded.v');
    const onDuplicate = onConflict ? false : await q('insert into __probe_up(id,v) values (1,1) on duplicate key update v=values(v)');
    await q('drop table if exists __probe_up');
    const upsert = onConflict ? 'ON_CONFLICT' : (onDuplicate ? 'ON_DUPLICATE' : 'NONE');
    await q('create table __probe_alter (id int)');
    const hintOk = await q('alter table __probe_alter add column c int, algorithm=inplace, lock=none');
    await q('drop table if exists __probe_alter');

    // Include authentication methods learned from probe
    const authMethods = probeInfo?.authPlugins;

    return {
        quote, ifExists, ifNotExists, jsonType, returning, upsert,
        onlineAlterHint: hintOk ? 'ALGORITHM=INPLACE,LOCK=NONE' : undefined,
        boolType: 'boolean', timestampType: 'timestamp', transactionalDDL: true, maxIdentLen: 63,
        authMethods
    };
}


export function quoteIdent(quoteChar: FeatureMap['quote'], id: string) {
    if (quoteChar === '[') return `[${id.replace(/]/g, ']]')}]`;
    const esc = quoteChar; return `${quoteChar}${id.split(quoteChar).join(esc + quoteChar)}${quoteChar}`;
}


export function typeSql(f: FeatureMap, c: ColumnSpec): string {
    switch (c.logicalType) {
        case 'string': return `varchar(${c.len ?? 255})`;
        case 'text': return 'text';
        case 'int': return 'integer';
        case 'bigint': return 'bigint';
        case 'bool': return f.boolType;
        case 'json': return f.jsonType;
        case 'decimal': return `decimal(${c.len ?? 10},${c.scale ?? 2})`;
        case 'ts': return f.timestampType;
        default: return 'text'; // fallback for unknown types
    }
}
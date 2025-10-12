import type { FeatureMap } from './features.js';
import { quoteIdent, typeSql } from './features.js';
import type { Op } from './ir.js';


export function emitCreateTable(f: FeatureMap, op: Extract<Op, { kind: 'CreateTable' }>): string {
    const q = (s: string) => quoteIdent(f.quote, s);
    const cols = op.columns.map((c: any) => `${q(c.name)} ${typeSql(f, c)} ${c.nullable ? 'NULL' : 'NOT NULL'}${c.defaultSql ? ` DEFAULT ${c.defaultSql}` : ''}`);
    if (op.pk?.length) cols.push(`PRIMARY KEY (${op.pk.map(q).join(', ')})`);
    const ifne = f.ifNotExists ? ' IF NOT EXISTS' : '';
    return `CREATE TABLE${ifne} ${q(op.schema)}.${q(op.name)} (${cols.join(', ')})`;
}


export function emitAddColumn(f: FeatureMap, op: Extract<Op, { kind: 'AddColumn' }>): string {
    const q = (s: string) => quoteIdent(f.quote, s);
    const c = op.column;
    return `ALTER TABLE ${q(op.schema)}.${q(op.table)} ADD COLUMN ${q(c.name)} ${typeSql(f, c)} ${c.nullable ? 'NULL' : 'NOT NULL'}${c.defaultSql ? ` DEFAULT ${c.defaultSql}` : ''}`;
}


export function emitAddIndex(f: FeatureMap, op: Extract<Op, { kind: 'AddIndex' }>): string {
    const q = (s: string) => quoteIdent(f.quote, s);
    const cols = op.columns.map(q).join(', ');
    return `CREATE ${op.unique ? 'UNIQUE ' : ''}INDEX ${q(op.name)} ON ${q(op.schema)}.${q(op.table)} (${cols})`;
}


export function renderSQL(f: FeatureMap, op: Op): string {
    switch (op.kind) {
        case 'CreateTable': return emitCreateTable(f, op);
        case 'AddColumn': return emitAddColumn(f, op);
        case 'AddIndex': return emitAddIndex(f, op);
        case 'DropTable': return `DROP TABLE${f.ifExists ? ' IF EXISTS' : ''} ${quoteIdent(f.quote, op.schema)}.${quoteIdent(f.quote, op.name)}`;
        case 'ExecSQL': return op.sql;
        default: throw new Error(`Unknown operation kind: ${(op as any).kind}`);
    }
}
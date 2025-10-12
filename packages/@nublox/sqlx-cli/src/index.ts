#!/usr/bin/env node
import fs from 'node:fs';
import { URL } from "url";
import { diffSnapshots, applyPlan } from '@nublox/sqlx-core';
import { probeMySQL } from '@nublox/sqlx-transport-mysql';
import { probePostgres } from '@nublox/sqlx-transport-pg';


const commands: Record<string, (argv: string[]) => Promise<number>> = {
    async '--help'() { return help(); }, async '-h'() { return help(); }, async help() { return help(); },
    async '--version'() { console.log('nublox-sqlx v0.1.0'); return 0; },


    async ping(argv) {
        const { url } = flags(argv); if (!url) return usage('ping');
        const u = new URL(url); const p = u.protocol.replace(':', '');
        if (p.startsWith('mysql')) { console.log(JSON.stringify(await probeMySQL(url), null, 2)); return 0; }
        if (p.startsWith('postgres') || p === 'pg') { console.log(JSON.stringify(await probePostgres(url), null, 2)); return 0; }
        console.log('{"note":"generic ping not implemented"}'); return 0;
    },


    async 'snapshot:pull'(argv) {
        const { url, out } = flags(argv); if (!url) return usage('snapshot:pull');
        const snap = { version: 1, schemas: {} }; // Phase 1 placeholder
        fs.writeFileSync(out || `snapshot.${Date.now()}.json`, JSON.stringify(snap, null, 2));
        return 0;
    },


    async 'plan:diff'(argv) {
        const { from, to, out } = flags(argv); if (!from || !to) return usage('plan:diff');
        const A = JSON.parse(fs.readFileSync(from, 'utf8')); const B = JSON.parse(fs.readFileSync(to, 'utf8'));
        const plan = diffSnapshots(A, B); fs.writeFileSync(out || 'plan.ir.json', JSON.stringify(plan, null, 2)); return 0;
    },


    async apply(argv) {
        const { url, plan, execute, risk } = flags(argv); if (!url || !plan) return usage('apply');
        const ir = JSON.parse(fs.readFileSync(plan, 'utf8'));
        if (!execute) { console.log('--- DRY RUN ---'); console.log(JSON.stringify(ir, null, 2)); return 0; }
        console.log(JSON.stringify(await applyPlan(url, ir, { riskBudget: risk || 'low' }), null, 2)); return 0;
    },
};


main().catch(e => { console.error(e?.stack || e); process.exit(1); });


async function main() { const [, , cmd, ...rest] = process.argv; const fn = commands[cmd] || help; const code = await fn(rest); process.exit(code); }


async function help() {
    console.log(`\nNuBlox SQLx — CLI\nUsage: nublox-sqlx <command> [options]\n\nCommands:\n ping --url <db-url>\n snapshot:pull --url <db-url> [-o file]\n plan:diff --from A.json --to B.json [-o plan.ir.json]\n apply --url <db-url> --plan plan.ir.json [--execute] [--risk low|medium|high]\n`);
    return 0;
}


function usage(name: string) { console.error(`Usage error: ${name}. Try: nublox-sqlx help`); return 1; }
function flags(argv: string[]) { const out: Record<string, any> = {}; for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a.startsWith('--')) { const k = a.slice(2); const v = (i + 1 < argv.length && !argv[i + 1].startsWith('-')) ? argv[++i] : true; out[k] = v; } } return out; }
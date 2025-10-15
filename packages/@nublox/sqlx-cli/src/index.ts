#!/usr/bin/env node
import { createDriver } from '@nublox/sqlx';
import fs from 'node:fs';
import path from 'node:path';

const [,, cmd, ...args] = process.argv;
const url = process.env.DATABASE_URL;

function parseArgs(argv: string[]) {
  const out: Record<string,string|boolean> = {};
  for (const a of argv) {
    if (a.startsWith('--')) {
      const [k,v] = a.substring(2).split('=',2);
      out[k] = v ?? true;
    }
  }
  return out;
}

function banner(security:any) {
  const tls = security?.tls ?? 'unknown';
  const trust = security?.trust ?? 'unknown';
  const fp = security?.fingerprint ? `\n  fingerprint: ${security.fingerprint}` : '';
  console.log(`Security:\n  TLS: ${tls}\n  trust: ${trust}${fp}`);
}

if (!cmd) {
  console.error('Usage: sqlx <ping|learn|capabilities|snapshot:pull|plan:schema-improve|apply> [--out=path] [--latency=-30] [--storage=-10]'); process.exit(1);
}
if (!url) {
  console.error('DATABASE_URL env var is required'); process.exit(1);
}

(async () => {
  const db = await createDriver(url);
  switch (cmd) {
    case 'ping': {
      await db.ping();
      banner((await db.capabilities()).security);
      console.log('pong');
      break;
    }
    case 'capabilities':
    case 'learn': {
      const caps = await db.capabilities();
      banner(caps.security);
      console.log(JSON.stringify(caps, null, 2));
      break;
    }
    case 'snapshot:pull': {
      const snap = await db.snapshot();
      const opts = parseArgs(args);
      const out = String(opts.out || '.sqlx/schema.snapshot.json');
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, JSON.stringify(snap, null, 2));
      console.log(`wrote snapshot → ${out}`);
      break;
    }
    case 'plan:schema-improve': {
      const opts = parseArgs(args);
      const goals:any = {};
      if (opts.latency) goals.reduceLatencyPct = Number(opts.latency);
      if (opts.storage) goals.reduceStoragePct = Number(opts.storage);
      const sip = await db.plan.schemaImprove(goals);
      const out = String(opts.out || '.sqlx/plan.sip.json');
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, JSON.stringify(sip, null, 2));
      console.log(`wrote SIP → ${out}`);
      break;
    }
    case 'apply': {
      const opts = parseArgs(args);
      const planPath = String(opts.plan || '.sqlx/plan.sip.json');
      const payload = JSON.parse(fs.readFileSync(planPath, 'utf8'));
      const rep = await db.plan.apply(payload, { online: true });
      console.log(JSON.stringify(rep, null, 2));
      break;
    }
    default:
      console.error('Unknown command:', cmd); process.exit(1);
  }
  await db.close();
})().catch(e => { console.error(e?.stack || e); process.exit(1); });

#!/usr/bin/env node
import { createDriver } from '@nublox/sqlx';

const cmd = process.argv[2];
const url = process.env.DATABASE_URL;
if (!cmd) {
  console.error('Usage: sqlx <ping|learn|snapshot:pull|capabilities>'); process.exit(1);
}
if (!url) {
  console.error('DATABASE_URL env var is required'); process.exit(1);
}

(async () => {
  const db = await createDriver(url);
  switch (cmd) {
    case 'ping': {
      await db.ping();
      console.log('pong');
      break;
    }
    case 'learn': {
      const caps = await db.capabilities();
      console.log(JSON.stringify(caps, null, 2));
      break;
    }
    case 'snapshot:pull': {
      const snap = await db.snapshot();
      console.log(JSON.stringify(snap, null, 2));
      break;
    }
    case 'capabilities': {
      const caps = await db.capabilities();
      console.log(JSON.stringify(caps, null, 2));
      break;
    }
    default:
      console.error('Unknown command:', cmd); process.exit(1);
  }
  await db.close();
})().catch(e => { console.error(e?.stack || e); process.exit(1); });

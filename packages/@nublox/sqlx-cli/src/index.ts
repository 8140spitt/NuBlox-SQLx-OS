#!/usr/bin/env node
import { capabilities as getCapabilities, learn as learnFlow, ping as pingSvc } from "@nublox/sqlx";

function usage(): never {
  console.error(
    `sqlx CLI

Usage:
  sqlx capabilities [url]   Print a static capability profile (family inferred from URL or defaults)
  sqlx learn [url]          Actively learn from a live server (use DATABASE_URL if url omitted)
  sqlx ping                 Simple health check (prints "pong")
  sqlx help                 Show this help

Notes:
  - If [url] is omitted for 'learn', DATABASE_URL must be set.
  - URL examples: mysql://user:pass@localhost:3306/dbname
`
  );
  process.exit(1);
}

function getUrlFromArgOrEnv(arg?: string): string {
  if (arg && arg.trim().length > 0) return arg.trim();
  const env = process.env.DATABASE_URL;
  if (!env) throw new Error("No URL provided. Set DATABASE_URL or pass a URL argument.");
  return env;
}

async function main() {
  const [, , cmdRaw, maybeUrl] = process.argv;
  const cmd = (cmdRaw || "").toLowerCase();

  try {
    switch (cmd) {
      case "capabilities": {
        // Static profile (no network). If a URL is supplied, it’s only used for family detection.
        const url = maybeUrl || process.env.DATABASE_URL || "";
        const caps = getCapabilities(url);
        // Print the whole object to avoid unsafe optional access
        console.log(JSON.stringify(caps, null, 2));
        break;
      }

      case "learn": {
        const url = getUrlFromArgOrEnv(maybeUrl);
        const result = await learnFlow(url);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case "ping": {
        const res = await pingSvc();
        console.log(res);
        break;
      }

      case "help":
      case "--help":
      case "-h":
      case "":
      case undefined as any:
        usage();
        break;

      default:
        console.error(`Unknown command: ${cmd}\n`);
        usage();
    }
  } catch (err: any) {
    console.error(err?.stack || err?.message || String(err));
    process.exitCode = 1;
  }
}

main();

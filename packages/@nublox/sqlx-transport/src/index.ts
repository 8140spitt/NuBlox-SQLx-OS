// packages/@nublox/sqlx-transport/src/index.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type CapabilityProfile = {
  version?: string;
  features?: Record<string, boolean>;
  limits?: { maxIdentifierLen?: number; maxParams?: number };
  sql?: { supports?: string[]; reservedWords?: string[] };
  security?: { tls?: "on" | "off" | "starttls-optional"; trust?: "system" | "none" };
};

type Registry = {
  families: Record<
    string,
    {
      file: string;
      schemes?: string[];
      defaultPorts?: number[];
    }
  >;
};

type FamilyConfig = {
  name: string;
  match?: {
    defaultPorts?: number[];
    helloStartsWithHex?: string;
    clientFirst?: boolean;
  };
  capabilityFlags?: Record<string, number>;
  hello?: {
    recv?: { max?: number };
    parse?: unknown[];
    capabilities?: Array<{ when?: string; set?: string }>;
  };
  auth?: {
    plugins?: string[];
    methods?: string[];
    negotiation?: "server_selects" | "client_selects";
  };
  sql?: { supports?: string[]; reservedWords?: string[] };
  limits?: { maxIdentifierLen?: number; maxParams?: number };
  security?: { tls?: "on" | "off" | "starttls-optional"; trust?: "system" | "none" };
};

function isNonEmptyString(x: unknown): x is string {
  return typeof x === "string" && x.length > 0;
}

function pathExists(p: string): boolean {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find the repo root "transports" directory by trying:
 * 1) SQLX_TRANSPORTS_DIR
 * 2) ./transports relative to CWD
 * 3) Walk up from CWD until we find transports/registry.json
 */
function resolveTransportsDir(): string {
  const fromEnv = process.env.SQLX_TRANSPORTS_DIR;

  // Build a strict string[] by filtering out undefined
  const candidates: string[] = [
    fromEnv,
    path.resolve(process.cwd(), "transports"),
  ].filter((p): p is string => isNonEmptyString(p));

  // Try walking up from CWD
  let cur = process.cwd();
  for (let i = 0; i < 10; i++) {
    const maybe = path.join(cur, "transports");
    if (pathExists(path.join(maybe, "registry.json"))) {
      candidates.push(maybe);
      break;
    }
    const next = path.dirname(cur);
    if (next === cur) break;
    cur = next;
  }

  for (const dir of candidates) {
    if (pathExists(path.join(dir, "registry.json"))) {
      return dir;
    }
  }

  // As a last attempt, try alongside this package (useful if bundled)
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pkgRoot = path.resolve(here, "..", ".."); // packages/@nublox/sqlx-transport/..
  const fallback = path.join(pkgRoot, "transports");
  if (pathExists(path.join(fallback, "registry.json"))) {
    return fallback;
  }

  // Default to env or ./transports so error message is predictable
  return isNonEmptyString(fromEnv) ? fromEnv : path.resolve(process.cwd(), "transports");
}

function loadJSON<T = unknown>(filePath: string): T {
  const buf = fs.readFileSync(filePath, "utf8");
  return JSON.parse(buf) as T;
}

function loadRegistry(): Registry {
  const dir = resolveTransportsDir();
  const file = path.join(dir, "registry.json");
  if (!pathExists(file)) {
    throw new Error(`registry.json not found at ${file}`);
  }
  return loadJSON<Registry>(file);
}

function getFamilyFile(family: string): string {
  const dir = resolveTransportsDir();
  const registry = loadRegistry();
  const entry = registry.families?.[family];
  if (!entry || !isNonEmptyString(entry.file)) {
    throw new Error(`Family "${family}" not found in registry.json`);
  }
  const file = path.join(dir, entry.file);
  if (!pathExists(file)) {
    throw new Error(`Family config file not found: ${file}`);
  }
  return file;
}

export function loadFamilyConfig(family: string): FamilyConfig {
  const file = getFamilyFile(family);
  return loadJSON<FamilyConfig>(file);
}

export function capabilityFromFamily(family: string): CapabilityProfile {
  const cfg = loadFamilyConfig(family);
  const profile: CapabilityProfile = {
    version: `${cfg.name}-unknown`,
    features: {},
    limits: {
      maxIdentifierLen: cfg.limits?.maxIdentifierLen ?? 63,
      maxParams: cfg.limits?.maxParams ?? 32767,
    },
    sql: {
      supports: cfg.sql?.supports ?? [],
      reservedWords: cfg.sql?.reservedWords ?? [],
    },
    security: {
      tls: cfg.security?.tls ?? "on",
      trust: cfg.security?.trust ?? "system",
    },
  };

  // Map capability flags (presence implies feature:true)
  if (cfg.capabilityFlags) {
    for (const key of Object.keys(cfg.capabilityFlags)) {
      profile.features![key] = true;
    }
  }

  // Hello-derived capabilities (if the pack listed them)
  if (cfg.hello?.capabilities) {
    for (const cap of cfg.hello.capabilities) {
      if (cap.set) profile.features![cap.set] = true;
    }
  }

  return profile;
}

/**
 * Optional helper: pick a family by URL scheme.
 */
export function familyFromUrl(urlStr: string): string | undefined {
  try {
    const u = new URL(urlStr);
    const registry = loadRegistry();
    for (const [fam, info] of Object.entries(registry.families ?? {})) {
      const schemes = (info.schemes ?? []).filter((s): s is string => isNonEmptyString(s));
      if (schemes.includes(u.protocol.replace(/:$/, ""))) {
        return fam;
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}

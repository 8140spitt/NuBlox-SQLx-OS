// at top
import fs from "node:fs";
import path from "node:path";

function fileExists(p: string) {
  try { fs.accessSync(p, fs.constants.R_OK); return true; } catch { return false; }
}

function resolveTransportsDir(): string {
  // 1) explicit override
  const envDir = process.env.SQLX_TRANSPORTS_DIR;
  if (envDir && fileExists(path.join(envDir, "registry.json"))) return envDir;

  // 2) current working directory (repo root friendly)
  const cwdDir = path.resolve(process.cwd(), "transports");
  if (fileExists(path.join(cwdDir, "registry.json"))) return cwdDir;

  // 3) try a few ancestor levels relative to compiled file
  // __dirname ≈ packages/@nublox/sqlx-transport/dist
  const candidates = [
    path.resolve(__dirname, "..", "transports"),
    path.resolve(__dirname, "..", "..", "transports"),
    path.resolve(__dirname, "..", "..", "..", "transports"),
    path.resolve(__dirname, "..", "..", "..", "..", "transports"),
  ];
  for (const d of candidates) {
    if (fileExists(path.join(d, "registry.json"))) return d;
  }

  // 4) last-resort: repo root guess
  const repoGuess = path.resolve(__dirname, "../../../../transports");
  if (fileExists(path.join(repoGuess, "registry.json"))) return repoGuess;

  throw new Error(
    `Could not locate transports/registry.json. ` +
    `Set SQLX_TRANSPORTS_DIR, or create <repo-root>/transports with registry.json. ` +
    `Looked in: ${[envDir, cwdDir, ...candidates, repoGuess].filter(Boolean).join(", ")}`
  );
}

function loadJSON(p: string) {
  const s = fs.readFileSync(p, "utf8");
  return JSON.parse(s);
}

function loadRegistry() {
  const dir = resolveTransportsDir();
  return loadJSON(path.join(dir, "registry.json"));
}

function getFamilyFile(family: string) {
  const dir = resolveTransportsDir();
  const reg = loadRegistry();
  const file = reg[family];
  if (!file) throw new Error(`Family "${family}" not found in registry.json`);
  const abs = path.join(dir, file);
  if (!fileExists(abs)) {
    throw new Error(`Family "${family}" maps to "${file}" but file not found at ${abs}`);
  }
  return abs;
}

// keep using getFamilyFile/loadRegistry where you already do

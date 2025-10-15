import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type AuthProfile = {
    key: string; // scheme://host:port
    observed?: { version?: string; server_fingerprint?: string };
    auth: { preferred: string; fallbacks: string[]; tls_required: boolean; notes?: string };
    last_success_at: string;
};

function keyFromUrl(u: URL) {
    return `${u.protocol}//${u.hostname}:${u.port || (u.protocol.startsWith('mysql') ? '3306' : '')}`;
}
function dir() { return path.resolve(process.cwd(), '.sqlx/auth'); }
function fileFor(u: URL) { return path.join(dir(), encodeURIComponent(keyFromUrl(u)) + '.json'); }

export async function loadAuthProfile(urlStr: string): Promise<AuthProfile | null> {
    const u = new URL(urlStr);
    try {
        const raw = await readFile(fileFor(u), 'utf8');
        return JSON.parse(raw);
    } catch { return null; }
}

export async function saveAuthProfile(urlStr: string, prof: Omit<AuthProfile, 'last_success_at'>) {
    const u = new URL(urlStr);
    await mkdir(dir(), { recursive: true });
    const payload: AuthProfile = { ...prof, last_success_at: new Date().toISOString() } as any;
    await writeFile(fileFor(u), JSON.stringify(payload, null, 2), 'utf8');
}

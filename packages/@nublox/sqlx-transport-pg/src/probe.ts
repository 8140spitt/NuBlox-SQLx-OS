// @nublox/sqlx-transport-pg/src/probe.ts
import net from 'node:net';
import tls from 'node:tls';
import { URL } from 'node:url';

export type ProbeInfo = {
    dialect: 'pg';
    host: string;
    port: number;
    version?: string;     // reported later by learn()
    tls: { available: boolean; attempted: boolean };
    authMethod?: 'scram-sha-256' | 'md5' | 'cleartext' | 'gss' | 'sspi' | 'unknown';
    error?: string;
};

const DEFAULT_TIMEOUT_MS = 2500;
const SSL_REQUEST_CODE = 80877103; // 0x04D2162F

function parsePgUrl(raw: string) {
    const u = new URL(raw);
    const host = u.hostname || '127.0.0.1';
    const port = Number(u.port || 5432);
    const sslmode = (u.searchParams.get('sslmode') || '').toLowerCase(); // disable|allow|prefer|require|verify-ca|verify-full
    return { host, port, sslmode };
}

function writeSslRequest(): Buffer {
    // Int32 length (8) + Int32 code
    const b = Buffer.alloc(8);
    b.writeInt32BE(8, 0);
    b.writeInt32BE(SSL_REQUEST_CODE, 4);
    return b;
}

async function checkTls(host: string, port: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
        const sock = net.createConnection({ host, port });
        const to = setTimeout(() => { sock.destroy(); resolve(false); }, timeoutMs);
        sock.once('connect', () => {
            sock.write(writeSslRequest());
        });
        sock.once('data', (d) => {
            clearTimeout(to);
            // 'S' = yes, 'N' = no
            const ok = d[0] === 0x53;
            sock.destroy();
            resolve(ok);
        });
        sock.on('error', () => { clearTimeout(to); resolve(false); });
    });
}

async function authPeek(host: string, port: number, timeoutMs: number): Promise<ProbeInfo['authMethod']> {
    // Send a minimal startup message, read first Authentication request
    return new Promise((resolve) => {
        const sock = net.createConnection({ host, port });
        const to = setTimeout(() => { sock.destroy(); resolve('unknown'); }, timeoutMs);

        sock.once('connect', () => {
            // minimal StartupMessage: length + protocol + pairs + terminator
            const user = `user\0pgpeek\0database\0postgres\0\0`;
            const payload = Buffer.concat([
                Buffer.from([0x00, 0x03, 0x00, 0x00]), // protocol 3.0
                Buffer.from(user, 'binary'),
            ]);
            const len = Buffer.alloc(4);
            len.writeInt32BE(4 + payload.length, 0);
            const msg = Buffer.concat([len, payload]);
            sock.write(msg);
        });

        sock.on('data', (d) => {
            clearTimeout(to);
            // Response is a tagged message stream; 'R' (0x52) = Authentication
            // d[0] = tag, d[1..4] = length, then payload
            // AuthenticationOk = 0; CleartextPassword=3; MD5=5; SCM Credentials=6; GSS=7; SSPI=9; SASL=10 (SCRAM)
            const tag = d[0];
            if (tag !== 0x52) { sock.destroy(); return resolve('unknown'); }
            const code = d.readInt32BE(5); // skip tag + len
            switch (code) {
                case 3: resolve('cleartext'); break;
                case 5: resolve('md5'); break;
                case 7: resolve('gss'); break;
                case 9: resolve('sspi'); break;
                case 10: resolve('scram-sha-256'); break;
                default: resolve('unknown');
            }
            sock.destroy();
        });

        sock.on('error', () => { clearTimeout(to); resolve('unknown'); });
    });
}

export async function probe(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<ProbeInfo> {
    const { host, port, sslmode } = parsePgUrl(url);
    const out: ProbeInfo = { dialect: 'pg', host, port, tls: { available: false, attempted: true } };

    try {
        // Determine if server supports TLS
        out.tls.available = await checkTls(host, port, timeoutMs);

        // Peek auth method without credentials
        out.authMethod = await authPeek(host, port, timeoutMs);
    } catch (e: any) {
        out.error = e?.message || String(e);
    }
    return out;
}

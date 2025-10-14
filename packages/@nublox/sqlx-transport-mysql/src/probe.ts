// @nublox/sqlx-transport-mysql/src/probe.ts
import net from 'node:net';
import tls from 'node:tls';
import { URL } from 'node:url';

export type ProbeInfo = {
    dialect: 'mysql';
    host: string;
    port: number;
    version?: string;
    tls: { available: boolean; attempted: boolean };
    authPlugin?: string;     // e.g., 'caching_sha2_password' | 'mysql_native_password'
    capabilities?: string[]; // parsed flags (subset)
    error?: string;
};

const DEFAULT_TIMEOUT_MS = 2500;

function parseMysqlUrl(raw: string) {
    const u = new URL(raw);
    const host = u.hostname || '127.0.0.1';
    const port = Number(u.port || 3306);
    const ssl = u.searchParams.get('ssl'); // '0'|'1'
    return { host, port, ssl: ssl === '1' };
}

// Minimal parse for handshake V10
function parseHandshakeV10(buf: Buffer) {
    // packet header (length3 + seq1) = 4 bytes -> payload follows
    // payload starts with protocol_version (1) then nul-terminated server_version
    const payload = buf.subarray(4);
    const protocol = payload.readUInt8(0);
    if (protocol !== 10) return {};

    let off = 1;
    const endVersion = payload.indexOf(0x00, off);
    const version = payload.subarray(off, endVersion).toString('utf8');
    off = endVersion + 1;

    // connection_id (4)
    off += 4;

    // auth-plugin-data-part-1 (8) + filler (1)
    off += 8 + 1;

    // capability flags (lower 2 bytes)
    const capLow = payload.readUInt16LE(off); off += 2;

    // if more data
    if (payload.length > off) {
        const charset = payload.readUInt8(off); off += 1;
        const statusFlags = payload.readUInt16LE(off); off += 2;
        const capHigh = payload.readUInt16LE(off); off += 2;
        const caps = (capHigh << 16) | capLow;

        let authPluginName: string | undefined;
        // auth-plugin-data length (1)
        const authLen = payload.readUInt8(off); off += 1;
        // 10 bytes reserved
        off += 10;

        // auth-plugin-data-part-2 (min 12)
        const part2len = Math.max(12, authLen - 8);
        off += part2len;

        // optional plugin name (null-terminated)
        const nulIdx = payload.indexOf(0x00, off);
        if (nulIdx !== -1) {
            authPluginName = payload.subarray(off, nulIdx).toString('utf8');
        }

        const capabilities: string[] = [];
        const CAP = (bit: number) => (caps & (1 << bit)) !== 0;
        if (CAP(5)) capabilities.push('LONG_PASSWORD');
        if (CAP(9)) capabilities.push('CONNECT_WITH_DB');
        if (CAP(15)) capabilities.push('SECURE_CONNECTION');
        if (CAP(21)) capabilities.push('PLUGIN_AUTH');
        if (CAP(23)) capabilities.push('SSL');
        if (CAP(30)) capabilities.push('CLIENT_DEPRECATE_EOF');

        return { version, authPlugin: authPluginName, capabilities };
    }

    return { version };
}

async function tcpProbe(host: string, port: number, timeoutMs: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const s = net.createConnection({ host, port });
        const chunks: Buffer[] = [];
        const to = setTimeout(() => {
            s.destroy(new Error('timeout'));
        }, timeoutMs);

        s.on('data', (d) => chunks.push(d));
        s.on('error', (e) => { clearTimeout(to); reject(e); });
        s.on('close', () => {
            clearTimeout(to);
            resolve(Buffer.concat(chunks));
        });
    });
}

async function tlsProbe(host: string, port: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
        const s = tls.connect({ host, port, servername: host });
        const to = setTimeout(() => {
            s.destroy();
            resolve(false);
        }, timeoutMs);

        s.on('secureConnect', () => {
            clearTimeout(to);
            s.destroy();
            resolve(true);
        });
        s.on('error', () => {
            clearTimeout(to);
            resolve(false);
        });
    });
}

export async function probe(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<ProbeInfo> {
    const { host, port, ssl } = parseMysqlUrl(url);
    const out: ProbeInfo = {
        dialect: 'mysql',
        host, port,
        tls: { available: false, attempted: true }
    };

    try {
        // TLS availability (unless explicitly disabled in URL)
        if (!ssl) {
            out.tls.available = await tlsProbe(host, port, timeoutMs);
        } else {
            out.tls.available = true;
        }

        // Plain TCP to read initial handshake and infer auth plugin + caps
        const buf = await tcpProbe(host, port, timeoutMs);
        const parsed = parseHandshakeV10(buf);
        Object.assign(out, parsed);
    } catch (e: any) {
        out.error = e?.message || String(e);
    }
    return out;
}

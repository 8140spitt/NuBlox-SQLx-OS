import net from 'node:net';
import tls from 'node:tls';
import { URL } from 'node:url';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type Session = {
    id: string;
    url: string;
    packName: string;
    connectedAt: number;
    meta?: Record<string, unknown>;
};

export interface ExecResult { rows: any[]; rowCount?: number }
export interface Transport {
    handshake(packPath: string, url: string, opts?: any): Promise<{ session: Session }>;
    exec(session: Session, req: { sql: string; params?: unknown[] }): Promise<ExecResult>;
    explain(session: Session, sql: string): Promise<any>;
    ping(session: Session): Promise<void>;
    close(session: Session): Promise<void>;
}

type WirePack = {
    name: string;
    framing: { kind: 'mysql-3byte-len'; charsetDefault?: number };
    caps: { clientSSLFlag: number };
    commands: { PING: number; QUERY: number };
    handshake: {
        greeting: 'mysql-v10';
        fields: string[];
        auth: {
            pluginField: string;
            algos: string[];
            tlsRequiredFor?: string[];
        }
    };
};

class PacketCodec {
    constructor(public s: net.Socket | tls.TLSSocket) { }
    seq = -1;
    private carry: Buffer = Buffer.alloc(0);

    async readPacket(): Promise<Buffer> {
        const h = await this.readExactly(4);
        const len = h[0] | (h[1] << 8) | (h[2] << 16);
        this.seq = h[3];
        return this.readExactly(len);
    }

    writePacket(payload: Buffer) {
        const hdr = Buffer.alloc(4);
        hdr.writeUIntLE(payload.length, 0, 3);
        hdr[3] = (this.seq + 1) & 0xff;
        this.seq = hdr[3];
        this.s.write(hdr);
        this.s.write(payload);
    }

    private readExactly(n: number): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            let acc = this.carry;
            const onData = (chunk: Buffer) => {
                acc = Buffer.concat([acc, chunk]);
                if (acc.length >= n) {
                    this.s.off('data', onData);
                    // IMPORTANT: return copies, not views, to satisfy Buffer<ArrayBuffer> typing
                    const out = Buffer.from(acc.subarray(0, n));
                    this.carry = Buffer.from(acc.subarray(n));
                    resolve(out);
                }
            };
            const die = (e: any) => { cleanup(); reject(e || new Error('socket closed')); };
            const cleanup = () => { this.s.off('data', onData); this.s.off('error', die); this.s.off('close', die); };
            this.s.on('data', onData);
            this.s.once('error', die);
            this.s.once('close', die);
        });
    }
}

const AuthAlgos: Record<string, (password: string, salt: Buffer, ctx: { tls: boolean }) => Buffer> = {
    mysql_native_password(password, salt) {
        const p = Buffer.from(password || '', 'utf8');
        const s1 = crypto.createHash('sha1').update(p).digest();
        const s2 = crypto.createHash('sha1').update(s1).digest();
        const s3 = crypto.createHash('sha1').update(Buffer.concat([salt, s2])).digest();
        const out = Buffer.alloc(s1.length);
        for (let i = 0; i < s1.length; i++) out[i] = s1[i] ^ s3[i];
        return Buffer.concat([Buffer.from([out.length]), out]);
    },
    caching_sha2_password(password, _salt, ctx) {
        if (!ctx.tls) throw new Error('caching_sha2_password requires TLS (MVP)');
        const b = Buffer.from(password || '', 'utf8');
        return Buffer.concat([Buffer.from([b.length]), b]);
    }
};

function isLocalHost(h: string) { return ['localhost', '127.0.0.1', '::1'].includes(h); }

async function upgradeTLS(sock: net.Socket, host: string): Promise<tls.TLSSocket> {
    return await new Promise<tls.TLSSocket>((res, rej) => {
        const s = tls.connect({ socket: sock, servername: host }, () => res(s));
        s.once('error', rej);
    });
}

function parseGreetingMySQLv10(pkt: Buffer) {
    let i = 0;
  /* const protocol = */ pkt[i++]; // not used
    const verEnd = pkt.indexOf(0, i);
    const versionText = pkt.toString('utf8', i, verEnd); i = verEnd + 1;
    const connId = pkt.readUInt32LE(i); i += 4;
    const salt1 = pkt.subarray(i, i + 8); i += 8;
    i += 1; // filler
    const capsLow = pkt.readUInt16LE(i); i += 2;

    let capsHigh = 0, authLen = 0, plugin = 'mysql_native_password', salt2 = Buffer.alloc(0);
    if (pkt.length > i) {
        i += 1;      // charset
        i += 2;      // status
        capsHigh = pkt.readUInt16LE(i); i += 2;
        authLen = pkt[i]; i += 1;
        i += 10;     // reserved
        const tailLen = Math.max(13, Math.max(0, authLen - 8));
        salt2 = pkt.subarray(i, i + tailLen); i += tailLen;
        const j = pkt.indexOf(0, i);
        if (j >= 0) { plugin = pkt.toString('utf8', i, j); i = j + 1; }
    }
    const serverCaps = (capsLow | (capsHigh << 16)) >>> 0;
    const salt = Buffer.concat([salt1, salt2]).subarray(0, 20);
    return { versionText, connId, serverCaps, plugin, salt };
}

export async function loadWirePack(packPath: string): Promise<WirePack> {
    const raw = await readFile(path.resolve(packPath), 'utf8');
    return JSON.parse(raw);
}

export default function createWireTransport(): Transport {
    let PACK: WirePack;

    async function handshake(packPath: string, rawUrl: string, opts?: {
        advisor?: { proposeClientCaps: (g: any, policy?: any) => number },
        policy?: { requireTLSForRemote?: boolean; allowPlainLocalhost?: boolean }
    }) {
        PACK = PACK ?? await loadWirePack(packPath);

        const u = new URL(rawUrl);
        const host = u.hostname || 'localhost';
        const port = u.port ? Number(u.port) : 3306;
        const database = u.pathname?.replace(/^\//, '') || '';
        const user = decodeURIComponent(u.username || '');
        const password = decodeURIComponent(u.password || '');
        const wantTLSParam = u.searchParams.get('ssl') ?? u.searchParams.get('tls');
        const wantTLSPref = (wantTLSParam === 'true' || wantTLSParam === '1') ||
            (!!opts?.policy?.requireTLSForRemote && !isLocalHost(host));

        // 1) TCP connect
        const base = await new Promise<net.Socket>((res, rej) => {
            const s = net.createConnection({ host, port }, () => res(s));
            s.once('error', rej);
        });
        const codec0 = new PacketCodec(base);

        // 2) Greeting
        const gPkt = await codec0.readPacket();
        const g = parseGreetingMySQLv10(gPkt);

        // 3) FLO: client caps
        const advisedCaps = opts?.advisor?.proposeClientCaps({
            serverCaps: g.serverCaps,
            authPlugin: g.plugin,
            versionText: g.versionText,
            isLocalhost: isLocalHost(host),
            wantTLS: wantTLSPref
        }, opts?.policy) ?? 0;

        // 4) Optional TLS (CLIENT_SSL)
        const clientSSLFlag = PACK.caps.clientSSLFlag;
        let sock: net.Socket | tls.TLSSocket = base;
        if (advisedCaps & clientSSLFlag) {
            const sslReq = Buffer.alloc(32, 0);
            sslReq.writeUInt32LE(advisedCaps, 0);
            sslReq.writeUInt32LE(1 << 24, 4);
            sslReq[8] = PACK.framing.charsetDefault ?? 45;
            codec0.writePacket(sslReq);
            sock = await upgradeTLS(base, host);
        }
        const codec = new PacketCodec(sock);

        // 5) Try auth algos from pack
        const algos = PACK.handshake.auth.algos;
        const tlsRequiredFor = new Set(PACK.handshake.auth.tlsRequiredFor ?? []);
        let lastError: any;

        for (const algoName of algos) {
            try {
                if (tlsRequiredFor.has(algoName) && !(sock as any).encrypted) {
                    const sslReq = Buffer.alloc(32, 0);
                    sslReq.writeUInt32LE(advisedCaps | clientSSLFlag, 0);
                    sslReq.writeUInt32LE(1 << 24, 4);
                    sslReq[8] = PACK.framing.charsetDefault ?? 45;
                    codec.writePacket(sslReq);
                    sock = await upgradeTLS(sock as net.Socket, host);
                }
                const algo = AuthAlgos[algoName];
                if (!algo) continue;

                // Handshake Response 41
                const fixed = Buffer.alloc(4 + 4 + 1 + 23, 0);
                const finalCaps = (advisedCaps | (((sock as any).encrypted) ? clientSSLFlag : 0)) >>> 0;
                fixed.writeUInt32LE(finalCaps, 0);
                fixed.writeUInt32LE(0x01000000, 4);
                fixed[8] = PACK.framing.charsetDefault ?? 45;

                const userB = Buffer.from(user || '', 'utf8');
                const dbB = Buffer.from(database || '', 'utf8');
                const authResp = algo(password, g.salt, { tls: (sock as any).encrypted === true });

                const payload = Buffer.concat([
                    fixed,
                    userB, Buffer.from([0x00]),
                    authResp,
                    database ? Buffer.concat([dbB, Buffer.from([0x00])]) : Buffer.alloc(0),
                    Buffer.from((g as any).plugin + '\0', 'utf8')
                ]);
                codec.writePacket(payload);

                const p = await codec.readPacket();
                if (p[0] === 0xFF) {
                    const code = p.readUInt16LE(1);
                    const msg = p.subarray(9).toString('utf8');
                    throw new Error(`Auth error ${code}: ${msg}`);
                }
                if ((p[0] === 0xFE || p[0] === 0x01) && (sock as any).encrypted) {
                    codec.writePacket(Buffer.concat([Buffer.from(password || '', 'utf8'), Buffer.from([0x00])]));
                    const p2 = await codec.readPacket();
                    if (p2[0] !== 0x00) throw new Error('Auth failed (post-step)');
                }

                const session: Session = {
                    id: crypto.randomUUID(),
                    url: rawUrl,
                    packName: PACK.name,
                    connectedAt: Date.now(),
                    meta: {
                        wirevm: { host, port, database, user },
                        tls: (sock as any).encrypted === true,
                        packPath,
                        socket: sock
                    }
                };
                return { session };
            } catch (e) {
                lastError = e;
            }
        }

        throw lastError ?? new Error('No auth strategy succeeded');
    }

    async function exec(session: Session, req: { sql: string; params?: unknown[] }): Promise<ExecResult> {
        const sock = (session.meta as any)?.socket as net.Socket | tls.TLSSocket;
        if (!sock) throw new Error('No socket');
        const codec = new PacketCodec(sock);
        codec.writePacket(Buffer.concat([Buffer.from([PACK.commands.QUERY]), Buffer.from(req.sql, 'utf8')]));
        let p = await codec.readPacket();
        if (p[0] === 0xFF) {
            const code = p.readUInt16LE(1);
            const msg = p.subarray(9).toString('utf8');
            throw new Error(`QUERY ERR ${code}: ${msg}`);
        }
        if (p[0] === 0x00) {
            return { rows: [], rowCount: p.readUIntLE(1, Math.min(3, p.length - 1)) || 0 };
        }
        let colCount = p[0];
        for (let i = 0; i < colCount; i++) await codec.readPacket();
        const rows: any[] = [];
        while (true) {
            p = await codec.readPacket();
            if ((p[0] === 0xFE && p.length < 9) || p[0] === 0x00) break;
            if (p[0] === 0xFF) {
                const code = p.readUInt16LE(1);
                const msg = p.subarray(9).toString('utf8');
                throw new Error(`ROW ERR ${code}: ${msg}`);
            }
            const vals: any[] = [];
            let idx = 0;
            for (let c = 0; c < colCount; c++) {
                const first = p[idx];
                if (first === 0xfb) { vals.push(null); idx += 1; continue; }
                let len = 0, adv = 0;
                if (first < 0xfb) { len = first; adv = 1; }
                else if (first === 0xfc) { len = p.readUInt16LE(idx + 1); adv = 3; }
                else if (first === 0xfd) { len = p.readUIntLE(idx + 1, 3); adv = 4; }
                else { len = Number(p.readBigUInt64LE(idx + 1)); adv = 9; }
                vals.push(p.toString('utf8', idx + adv, idx + adv + len));
                idx += adv + len;
            }
            rows.push(vals);
        }
        return { rows, rowCount: rows.length };
    }

    async function explain(session: Session, sql: string) {
        const r = await exec(session, { sql: 'EXPLAIN ' + sql });
        return { explain: r.rows };
    }

    async function ping(session: Session) {
        const sock = (session.meta as any)?.socket as net.Socket | tls.TLSSocket;
        if (!sock) throw new Error('No socket');
        const codec = new PacketCodec(sock);
        codec.writePacket(Buffer.from([PACK.commands.PING]));
        const p = await codec.readPacket();
        if (p[0] === 0xFF) {
            const code = p.readUInt16LE(1);
            const msg = p.subarray(9).toString('utf8');
            throw new Error(`PING ERR ${code}: ${msg}`);
        }
    }

    async function close(session: Session) {
        const sock = (session.meta as any)?.socket as net.Socket | tls.TLSSocket;
        try { sock?.end(); } catch { }
        if (session.meta) (session.meta as any).socket = undefined;
    }

    return { handshake, exec, explain, ping, close };
}

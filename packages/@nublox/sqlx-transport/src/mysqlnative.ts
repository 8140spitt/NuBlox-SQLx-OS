// packages/@nublox/sqlx-transport/src/transports/mysqlnative.ts
// Zero-dep MySQL Native Protocol (Handshake v10) — text protocol only (COM_QUERY, COM_PING)
// Client capability mask is advised by FLO via HandshakeAdvisor (no hardcoded caps here).

import net from 'node:net';
import tls from 'node:tls';
import { URL } from 'node:url';
import crypto from 'node:crypto';
import type { Transport, Session, ExecResult, HandshakeAdvisor } from '../index';

type Policy = {
    requireTLSForRemote?: boolean;
    allowPlainLocalhost?: boolean;
    connect_timeout_seconds?: number;
};

type Conn = {
    sock: net.Socket | tls.TLSSocket;
    seq: number;
    serverCaps: number;
    connId: number;
    plugin: string;          // e.g. 'mysql_native_password' | 'caching_sha2_password'
    salt: Buffer;            // 20-byte scramble
    clientCaps: number;      // decided by FLO advisor
};

const COMMAND = {
    COM_QUERY: 0x03,
    COM_PING: 0x0e
} as const;

function toCfg(urlStr: string, policy?: Policy) {
    const u = new URL(urlStr);
    const host = u.hostname || 'localhost';
    const port = u.port ? Number(u.port) : 3306;
    const database = u.pathname?.replace(/^\//, '') || '';
    const user = decodeURIComponent(u.username || '');
    const password = decodeURIComponent(u.password || '');
    const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(host);
    const useSSLParam = u.searchParams.get('ssl') ?? u.searchParams.get('tls');
    const wantTLS =
        useSSLParam === 'true' || useSSLParam === '1' ||
        (!!policy?.requireTLSForRemote && !isLocalhost);
    return { host, port, database, user, password, wantTLS, isLocalhost };
}

// ---------- small utils ----------
function sha1(buf: Buffer) { return crypto.createHash('sha1').update(buf).digest(); }
function xor(a: Buffer, b: Buffer) { const o = Buffer.alloc(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] ^ b[i]; return o; }
function scrambleNative(password: string, salt: Buffer) {
    // mysql_native_password: SHA1(pwd) ^ SHA1(salt + SHA1(SHA1(pwd)))
    const p = Buffer.from(password, 'utf8');
    const s1 = sha1(p), s2 = sha1(s1), s3 = sha1(Buffer.concat([salt, s2]));
    return xor(s1, s3);
}

async function readExactly(sock: net.Socket | tls.TLSSocket, n: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        let acc = Buffer.alloc(0);
        function onData(ch: Buffer) {
            acc = Buffer.concat([acc, ch]);
            if (acc.length >= n) {
                sock.off('data', onData);
                resolve(acc.subarray(0, n));
                const rest = acc.subarray(n);
                if (rest.length) (sock as any).emit?.('data', rest);
            }
        }
        function die(e: any) { cleanup(); reject(e || new Error('socket closed')); }
        function cleanup() { sock.off('data', onData); sock.off('error', die); sock.off('close', die); }
        sock.on('data', onData); sock.once('error', die); sock.once('close', die);
    });
}

async function readPacket(conn: Conn): Promise<Buffer> {
    const h = await readExactly(conn.sock, 4);
    const len = h[0] | (h[1] << 8) | (h[2] << 16);
    conn.seq = h[3];
    return readExactly(conn.sock, len);
}

function writePacket(conn: Conn, payload: Buffer) {
    const hdr = Buffer.alloc(4);
    hdr.writeUIntLE(payload.length, 0, 3);
    hdr[3] = (conn.seq + 1) & 0xff;
    conn.seq = hdr[3];
    conn.sock.write(hdr);
    conn.sock.write(payload);
}

// ---------- handshake/auth that asks FLO for client caps ----------
async function doHandshake(rawUrl: string, opts?: { policy?: Policy; advisor?: HandshakeAdvisor }): Promise<Conn> {
    const cfg = toCfg(rawUrl, opts?.policy);

    // connect TCP
    const base = await new Promise<net.Socket>((res, rej) => {
        const s = net.createConnection({ host: cfg.host, port: cfg.port }, () => res(s));
        s.once('error', rej);
    });

    const conn: Conn = {
        sock: base,
        seq: -1,
        serverCaps: 0,
        connId: 0,
        plugin: 'mysql_native_password',
        salt: Buffer.alloc(0),
        clientCaps: 0
    };

    // 1) Server Greeting (Handshake v10)
    let p = await readPacket(conn);
    let i = 0;
    const protocol = p[i++]; // not used further
    const verEnd = p.indexOf(0, i);
    const serverVersion = p.toString('utf8', i, verEnd); i = verEnd + 1;
    const connId = p.readUInt32LE(i); i += 4;
    const salt1 = p.subarray(i, i + 8); i += 8; i++; // filler 0x00
    const capsLow = p.readUInt16LE(i); i += 2;

    // May include extended fields
    let capsHigh = 0;
    let authPlugin = 'mysql_native_password';
    let authPluginDataLen = 0;

    if (p.length > i) {
    /* character_set */ i++;
    /* status_flags */ i += 2;
        capsHigh = p.readUInt16LE(i); i += 2;
        authPluginDataLen = p[i]; i++;
        i += 10; // reserved (all [00])
        const salt2 = p.subarray(i, i + Math.max(13, authPluginDataLen - 8));
        i += Math.max(13, authPluginDataLen - 8);
        const plugEnd = p.indexOf(0, i);
        if (plugEnd > 0) {
            authPlugin = p.toString('utf8', i, plugEnd);
            i = plugEnd + 1;
        }
        conn.salt = Buffer.concat([salt1, salt2]).subarray(0, 20);
    } else {
        conn.salt = salt1;
    }

    conn.serverCaps = (capsLow | (capsHigh << 16)) >>> 0;
    conn.connId = connId;
    conn.plugin = authPlugin;

    // 2) Ask FLO advisor for client capability mask
    const greeting = {
        serverCaps: conn.serverCaps,
        authPlugin: conn.plugin,
        versionText: serverVersion,
        isLocalhost: cfg.isLocalhost,
        wantTLS: cfg.wantTLS
    };
    conn.clientCaps = opts?.advisor?.proposeClientCaps(greeting, opts?.policy) ?? 0;

    // 3) Optional TLS upgrade (CLIENT_SSL bit)
    const CLIENT_SSL = 0x08000000;
    const wantTLS = !!(conn.clientCaps & CLIENT_SSL);
    if (wantTLS) {
        const sslReq = Buffer.alloc(32, 0);
        sslReq.writeUInt32LE(conn.clientCaps, 0);
        sslReq.writeUInt32LE(1 << 24, 4); // max packet
        sslReq[8] = 45; // utf8_general_ci
        writePacket(conn, sslReq);

        const tlsSock = await new Promise<tls.TLSSocket>((res, rej) => {
            const s = tls.connect({ socket: conn.sock as net.Socket, servername: cfg.host }, () => res(s));
            s.once('error', rej);
        });
        conn.sock = tlsSock;
        conn.seq = -1; // reset sequence after SSLRequest
    }

    // 4) Handshake Response 41
    const userB = Buffer.from(cfg.user || '', 'utf8');
    const dbB = Buffer.from(cfg.database || '', 'utf8');

    const authResp = (() => {
        if (conn.plugin === 'mysql_native_password') {
            const scr = scrambleNative(cfg.password || '', conn.salt);
            return Buffer.concat([Buffer.from([scr.length]), scr]);
        }
        if (conn.plugin === 'caching_sha2_password') {
            // MVP: require TLS for full auth and send cleartext (safe under TLS)
            if (!wantTLS) throw new Error('caching_sha2_password without TLS is not supported in MVP');
            const b = Buffer.from(cfg.password || '', 'utf8');
            return Buffer.concat([Buffer.from([b.length]), b]);
        }
        // fallback: no auth data
        return Buffer.from([0]);
    })();

    const fixed = Buffer.alloc(4 + 4 + 1 + 23, 0);
    fixed.writeUInt32LE(conn.clientCaps, 0);        // capability flags (from FLO)
    fixed.writeUInt32LE(0x01000000, 4);            // max_packet_size
    fixed[8] = 45;                                  // character_set = utf8_general_ci

    const payload = Buffer.concat([
        fixed,
        userB, Buffer.from([0x00]),                   // null-terminated user
        authResp,
        cfg.database ? Buffer.concat([dbB, Buffer.from([0x00])]) : Buffer.alloc(0),
        Buffer.from(conn.plugin + '\0', 'utf8')       // plugin name, NUL-terminated
    ]);
    writePacket(conn, payload);

    // 5) Auth result
    p = await readPacket(conn);
    if (p[0] === 0x00) {
        // OK
    } else if (p[0] === 0xFE || p[0] === 0x01) {
        // Auth more data / switch — MVP supports only TLS full-auth path
        if (!wantTLS) throw new Error('Server requested additional auth; TLS required in MVP');
        const b = Buffer.concat([Buffer.from(cfg.password || '', 'utf8'), Buffer.from([0x00])]);
        writePacket(conn, b);
        const p2 = await readPacket(conn);
        if (p2[0] !== 0x00) throw new Error('Auth failed');
    } else if (p[0] === 0xFF) {
        const code = p.readUInt16LE(1);
        const msg = p.subarray(9).toString('utf8');
        throw new Error(`Auth error ${code}: ${msg}`);
    }

    return conn;
}

// ---------- simple COM_* ----------
async function comPing(conn: Conn) {
    writePacket(conn, Buffer.from([COMMAND.COM_PING]));
    const p = await readPacket(conn);
    if (p[0] === 0xFF) {
        const code = p.readUInt16LE(1);
        const msg = p.subarray(9).toString('utf8');
        throw new Error(`PING ERR ${code}: ${msg}`);
    }
}

async function comQuery(conn: Conn, sql: string): Promise<ExecResult> {
    writePacket(conn, Buffer.concat([Buffer.from([COMMAND.COM_QUERY]), Buffer.from(sql, 'utf8')]));
    let p = await readPacket(conn);

    if (p[0] === 0xFF) {
        const code = p.readUInt16LE(1);
        const msg = p.subarray(9).toString('utf8');
        throw new Error(`QUERY ERR ${code}: ${msg}`);
    }

    if (p[0] === 0x00) {
        // OK packet (no resultset)
        return { rows: [], rowCount: p.readUIntLE(1, Math.min(3, p.length - 1)) || 0 };
    }

    // Result set (text protocol) — minimalist parsing: skip columns, read rows as strings/nulls.
    let colCount = p[0]; // lenenc int (fits in 1 byte for small counts)
    // Consume column definitions
    for (let i = 0; i < colCount; i++) await readPacket(conn);

    const rows: any[] = [];
    while (true) {
        p = await readPacket(conn);
        // EOF (pre-5.7) or OK after rows (5.7+)
        if ((p[0] === 0xFE && p.length < 9) || p[0] === 0x00) break;
        if (p[0] === 0xFF) {
            const code = p.readUInt16LE(1);
            const msg = p.subarray(9).toString('utf8');
            throw new Error(`ROW ERR ${code}: ${msg}`);
        }

        // parse one text row (len-enc value per column)
        const vals: any[] = [];
        let idx = 0;
        for (let c = 0; c < colCount; c++) {
            const first = p[idx];
            if (first === 0xfb) { vals.push(null); idx += 1; continue; } // NULL
            let len = 0, adv = 0;
            if (first < 0xfb) { len = first; adv = 1; }
            else if (first === 0xfc) { len = p.readUInt16LE(idx + 1); adv = 3; }
            else if (first === 0xfd) { len = p.readUIntLE(idx + 1, 3); adv = 4; }
            else /* 0xfe */ { len = Number(p.readBigUInt64LE(idx + 1)); adv = 9; }
            vals.push(p.toString('utf8', idx + adv, idx + adv + len));
            idx += adv + len;
        }
        rows.push(vals);
    }
    return { rows, rowCount: rows.length };
}

// ---------- Transport implementation ----------
const transport: Transport = {
    async handshake(packPath: string, rawUrl: string, opts?: { policy?: Policy; advisor?: HandshakeAdvisor }) {
        const conn = await doHandshake(rawUrl, opts);
        const session: Session = {
            id: crypto.randomUUID(),
            url: rawUrl,
            packName: 'mysql-wire-pack',
            connectedAt: Date.now(),
            meta: {
                conn,
                clientCaps: conn.clientCaps,
                serverCaps: conn.serverCaps,
                tls: (conn.sock as any).encrypted === true, // FLO reads this to report tls:on/off
                packPath                                       // so FLO can load the TDL manifest
            }
        };
        return { session };
    },

    async exec(session, req) {
        const conn = (session.meta as any)?.conn as Conn;
        if (!conn) throw new Error('Connection not initialized');
        return comQuery(conn, req.sql);
    },

    async explain(session, sql) {
        const r = await this.exec(session, { sql: 'EXPLAIN ' + sql });
        return { explain: r.rows };
    },

    async ping(session) {
        const conn = (session.meta as any)?.conn as Conn;
        if (!conn) throw new Error('Connection not initialized');
        await comPing(conn);
    },

    async close(session) {
        const conn = (session.meta as any)?.conn as Conn;
        if (conn) {
            try { conn.sock.end(); } catch { }
            (session.meta as any).conn = undefined;
        }
    }
};

export default transport;

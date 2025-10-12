import * as net from "net";
import * as tls from "tls";
import * as crypto from "crypto";
import { URL } from "url";


export type QueryResult = { rows: any[] };

export class MySQLClient {
    private sock!: net.Socket | tls.TLSSocket;
    private seq = 0;
    private salt!: Buffer;
    private db = '';

    static async connect(url: string) { const c = new MySQLClient(); await c._connect(url); return c; }

    private async _connect(urlString: string) {
        const u = new URL(urlString);
        const host = u.hostname || '127.0.0.1';
        const port = Number(u.port) || 3306;
        const user = decodeURIComponent(u.username || 'root');
        const pass = decodeURIComponent(u.password || '');
        this.db = u.pathname ? u.pathname.replace(/^\//, '') : '';
        const useTLS = u.protocol === 'mysqls:' || ['1', 'true', 'on'].includes(String(u.searchParams.get('ssl')));

        this.sock = useTLS ? tls.connect({ host, port, rejectUnauthorized: false }) : net.connect({ host, port });
        const greet = await readPacket(this.sock); // seq=0
        this.seq = 1;

        // parse greeting
        const p = greet.payload; let off = 0;
        off += 1; // protocol
        const end = p.indexOf(0x00, off);
    /* const serverVersion = */ p.toString('utf8', off, end); off = end + 1;
        off += 4; // conn id
        const auth1 = p.subarray(off, off + 8); off += 8; off += 1; // filler
    /* const capLo = */ p.readUInt16LE(off); off += 2; off += 1; // charset
        off += 2; // status
    /* const capHi = */ p.readUInt16LE(off); off += 2;
        const authLen = p.readUInt8(off) || 21; off += 1; off += 10; // reserved
        const auth2 = p.subarray(off, off + Math.max(13, authLen - 8));
        this.salt = Buffer.concat([auth1, auth2]).subarray(0, 20);

        // login
        const CLIENT_PROTOCOL_41 = 1 << 9, SECURE_CONNECTION = 1 << 15, PLUGIN_AUTH = 1 << 19, CONNECT_WITH_DB = 1 << 3, MULTI_RESULTS = 1 << 17;
        const caps = CLIENT_PROTOCOL_41 | SECURE_CONNECTION | PLUGIN_AUTH | MULTI_RESULTS | (this.db ? CONNECT_WITH_DB : 0);
        const maxPacket = 0x01000000; const coll = 0x21; // utf8_general_ci
        const body = Buffer.concat([
            u32le(caps), u32le(maxPacket), Buffer.from([coll]), Buffer.alloc(23, 0),
            cstr(user), Buffer.from([scramble(pass, this.salt).length]), scramble(pass, this.salt),
            this.db ? cstr(this.db) : Buffer.alloc(0), cstr('mysql_native_password')
        ]);
        await writePacket(this.sock, this.seq++, body);

        const authOk = await readPacket(this.sock);
        if (authOk.payload[0] === 0xFF) throw new Error('MySQL auth error');
    }

    async query(sql: string, params?: any[]): Promise<QueryResult> {
        if (params?.length) sql = interpolate(sql, params);
        const COM_QUERY = 0x03;
        await writePacket(this.sock, this.seq++, Buffer.concat([Buffer.from([COM_QUERY]), Buffer.from(sql, 'utf8')]));

        const first = await readPacket(this.sock);
        const b0 = first.payload[0];
        if (b0 === 0xFF) throw new Error('MySQL ERR');
        if (b0 === 0x00) return { rows: [] };

        const { value: colCount } = readLenEnc(first.payload, 0);
        for (let i = 0; i < colCount; i++) await readPacket(this.sock); // column defs
        await readPacket(this.sock); // EOF/OK

        const rows: any[] = [];
        while (true) {
            const pkt = await readPacket(this.sock);
            const p = pkt.payload;
            if (p[0] === 0xFE && p.length < 9) break; // EOF
            let off = 0; const row: any = {};
            for (let c = 0; c < colCount; c++) { const r = readLenEncString(p, off); row[c] = r.value; off = r.next; }
            rows.push(row);
        }
        return { rows };
    }

    async close() { try { this.sock.destroy(); } catch { } }
}

// helpers
function u32le(n: number) { const b = Buffer.allocUnsafe(4); b.writeUInt32LE(n, 0); return b; }
function cstr(s: string) { return Buffer.from(s + '\0'); }
function packet(payload: Buffer, seq: number) { const h = Buffer.allocUnsafe(4); h.writeUIntLE(payload.length, 0, 3); h[3] = seq & 0xFF; return Buffer.concat([h, payload]); }
async function writePacket(sock: net.Socket | tls.TLSSocket, seq: number, payload: Buffer) { sock.write(packet(payload, seq)); }

async function readPacket(sock: net.Socket | tls.TLSSocket) {
    const hdr = await readExact(sock, 4); const len = hdr.readUIntLE(0, 3);
    const payload = await readExact(sock, len); return { payload };
}
async function readExact(sock: net.Socket | tls.TLSSocket, n: number) {
    const chunks: Buffer[] = []; let got = 0;
    while (got < n) { const chunk = await onceBuf(sock, 'data'); chunks.push(chunk); got += chunk.length; }
    return Buffer.concat(chunks).subarray(0, n);
}
function onceBuf(em: any, ev: string) { return new Promise<Buffer>((res, rej) => { const er = (e: any) => { cl(); rej(e) }; const ok = (b: Buffer) => { cl(); res(b) }; const cl = () => { em.off('error', er); em.off(ev, ok) }; em.once('error', er); em.once(ev, ok); }); }

function scramble(password: string, salt: Buffer) {
    const sha1 = (b: Buffer | string) => crypto.createHash('sha1').update(b).digest();
    const p = sha1(Buffer.from(password, 'utf8')); const p2 = sha1(p); const p3 = sha1(Buffer.concat([salt, p2]));
    const out = Buffer.allocUnsafe(p.length); for (let i = 0; i < p.length; i++) out[i] = p[i] ^ p3[i]; return out;
}

function interpolate(sql: string, params: any[]) { let i = 0; return sql.replace(/\?/g, () => escapeSql(params[i++])); }
function escapeSql(v: any) { if (v == null) return 'NULL'; if (typeof v === 'number') return String(v); if (typeof v === 'boolean') return v ? '1' : '0'; return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`; }

function readLenEnc(buf: Buffer, off: number) { const first = buf.readUInt8(off); if (first < 0xfb) return { value: first, bytes: 1 }; if (first === 0xfc) return { value: buf.readUInt16LE(off + 1), bytes: 3 }; if (first === 0xfd) return { value: buf.readUIntLE(off + 1, 3), bytes: 4 }; return { value: Number(buf.readBigUInt64LE(off + 1)), bytes: 9 }; }
function readLenEncString(buf: Buffer, off: number) { if (buf[off] === 0xfb) return { value: null, next: off + 1 }; const { value: len, bytes } = readLenEnc(buf, off); const s = off + bytes; const e = s + len; return { value: buf.toString('utf8', s, e), next: e }; }

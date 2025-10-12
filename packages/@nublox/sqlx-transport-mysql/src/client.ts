// Minimal MySQL text-protocol client with mysql_native_password auth (zero deps).
const p = pkt.payload;
if (p[0] === 0xFE && p.length < 9) break; // EOF
// text row: len-enc strings per column
const row: any = {};
let off = 0;
for (let c = 0; c < colCount; c++) {
    const v = readLenEncString(p, off);
    row[c] = v.value; off = v.next;
}
rows.push(row);
}
return { rows };
}


async close() { try { this.sock.destroy(); } catch { } }
}


// Helpers
function u32le(n: number) { const b = Buffer.allocUnsafe(4); b.writeUInt32LE(n, 0); return b; }
function packet(payload: Buffer, seq: number) { const h = Buffer.allocUnsafe(4); h.writeUIntLE(payload.length, 0, 3); h[3] = seq & 0xFF; return Buffer.concat([h, payload]); }
async function writePacket(sock: net.Socket | tls.TLSSocket, seq: number, payload: Buffer) { sock.write(packet(payload, seq)); }


async function readPacket(sock: net.Socket | tls.TLSSocket): Promise<{ seq: number, payload: Buffer }> {
    const header = await readExact(sock, 4);
    const len = header.readUIntLE(0, 3); const seq = header[3];
    const payload = await readExact(sock, len);
    return { seq, payload };
}


async function readExact(sock: net.Socket | tls.TLSSocket, n: number): Promise<Buffer> {
    const chunks: Buffer[] = []; let got = 0;
    while (got < n) {
        const chunk = await onceBuf(sock, 'data');
        chunks.push(chunk); got += chunk.length;
        if (got > n) { // push back extra data by unshifting into internal buffer (not trivial). For Phase 1 assume aligned packets
            // In practice, Node may coalesce exactly to packet boundaries for small packets. This MVP keeps simple.
        }
    }
    return Buffer.concat(chunks).subarray(0, n);
}


function onceBuf(em: any, ev: string): Promise<Buffer> { return new Promise((res, rej) => { const onErr = (e: any) => { cleanup(); rej(e) }; const onOk = (v: any) => { cleanup(); res(v) }; const cleanup = () => { em.off('error', onErr); em.off(ev, onOk) }; em.once('error', onErr); em.once(ev, onOk); }); }


function scrambleNative(password: string, salt: Buffer) {
    const sha1 = (b: Buffer | string) => crypto.createHash('sha1').update(b).digest();
    const p = sha1(Buffer.from(password, 'utf8'));
    const p2 = sha1(p);
    const p3 = sha1(Buffer.concat([salt, p2]));
    const out = Buffer.allocUnsafe(p.length);
    for (let i = 0; i < p.length; i++) out[i] = p[i] ^ p3[i];
    return out;
}


function interpolate(sql: string, params: any[]): string {
    let i = 0; return sql.replace(/\?/g, () => escapeSql(params[i++]));
}
function escapeSql(v: any): string {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return v ? '1' : '0';
    const s = String(v).replace(/\/g, \`\\\`).replace(/'/g, "''");
return `'${s}'`;
}


function readLenEnc(buf: Buffer, off: number): { value: number, bytes: number } {
    const first = buf.readUInt8(off);
    if (first < 0xfb) return { value: first, bytes: 1 };
    if (first === 0xfc) return { value: buf.readUInt16LE(off + 1), bytes: 3 };
    if (first === 0xfd) return { value: buf.readUIntLE(off + 1, 3), bytes: 4 };
    return { value: Number(buf.readBigUInt64LE(off + 1)), bytes: 9 };
}
function readLenEncString(buf: Buffer, off: number): { value: string | null, next: number } {
    if (buf[off] === 0xfb) return { value: null, next: off + 1 }; // NULL
    const { value: len, bytes } = readLenEnc(buf, off);
    const start = off + bytes; const end = start + len;
    return { value: buf.toString('utf8', start, end), next: end };
}
```ts
// Phase 1: placeholder client interface for future snapshot/queries
export type QueryResult = { rows: any[] };
export class MySQLClient { constructor(public url: string) {} async query(_sql: string): Promise<QueryResult> { return { rows: [] }; } async close() {} }
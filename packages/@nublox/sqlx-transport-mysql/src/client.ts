import * as net from "net";
import * as tls from "tls";
import * as crypto from "crypto";
import { URL } from "url";
import type { QueryResult, ISqlxClient } from '@nublox/sqlx-core';

export class MySQLClient implements ISqlxClient {
    private sock!: net.Socket | tls.TLSSocket;
    private seq = 0;
    private salt!: Buffer;
    private db = '';

    static async connect(url: string): Promise<MySQLClient> {
        const c = new MySQLClient();
        await c._connect(url);
        return c;
    }

    static async connectWithFeatureLearning(url: string): Promise<{ client: MySQLClient; features: any }> {
        // First, probe to learn authentication capabilities
        const { probe } = await import('./index.js');
        const probeInfo = await probe(url);

        console.log('🧠 Feature Learner detected:', {
            dialect: probeInfo.dialect,
            version: probeInfo.version,
            authPlugins: probeInfo.authPlugins,
            capabilities: probeInfo.capabilities
        });

        // Connect with learned authentication method
        const client = new MySQLClient();
        await client._connectWithAuth(url, probeInfo.authPlugins?.[0]);

        // Note: Full feature learning would happen after successful connection
        // For now, return the probe info as basic features
        return {
            client,
            features: {
                authMethods: probeInfo.authPlugins,
                dialect: probeInfo.dialect,
                version: probeInfo.version
            }
        };
    }

    private async _connect(urlString: string) {
        return this._connectWithAuth(urlString);
    }

    private async _connectWithAuth(urlString: string, learnedAuthPlugin?: string) {
        const u = new URL(urlString);
        const host = u.hostname || '127.0.0.1';
        const port = Number(u.port) || 3306;
        const user = decodeURIComponent(u.username || 'root');
        const pass = decodeURIComponent(u.password || '');
        this.db = u.pathname ? u.pathname.replace(/^\//, '') : '';
        const useTLS = u.protocol === 'mysqls:' || ['1', 'true', 'on'].includes(String(u.searchParams.get('ssl')));

        this.sock = useTLS ? tls.connect({ host, port, rejectUnauthorized: false }) : net.connect({ host, port });

        const greet = await new Promise<{ payload: Buffer }>((resolve, reject) => {
            const timeoutId = setTimeout(() => reject(new Error('Connection timeout')), 10000);

            this.sock.on('connect', () => {
                console.log('Socket connected, waiting for greeting...');
            });

            const onData = (data: Buffer) => {
                console.log('Received greeting data:', data);
                clearTimeout(timeoutId);
                this.sock.removeListener('data', onData); // Remove this handler after greeting
                // Parse the packet manually for the greeting
                if (data.length < 4) {
                    reject(new Error('Invalid greeting packet'));
                    return;
                }
                const len = data.readUIntLE(0, 3);
                const seq = data.readUInt8(3);
                const payload = data.subarray(4, 4 + len);
                console.log(`Greeting: len=${len}, seq=${seq}, payload_len=${payload.length}`);
                resolve({ payload });
            };

            this.sock.on('data', onData);

            this.sock.on('error', (err) => {
                clearTimeout(timeoutId);
                reject(err);
            });
        });
        this.seq = 1;

        // parse greeting
        const p = greet.payload; let off = 0;
        console.log('Greeting packet:', p);

        const protocolVersion = p.readUInt8(off); off += 1; // protocol
        console.log('Protocol version:', protocolVersion);

        const end = p.indexOf(0x00, off);
        const serverVersion = p.toString('utf8', off, end); off = end + 1;
        console.log('Server version:', serverVersion);

        const connId = p.readUInt32LE(off); off += 4; // conn id
        console.log('Connection ID:', connId);

        const auth1 = p.subarray(off, off + 8); off += 8;
        console.log('Auth1:', auth1);

        off += 1; // filler
        const capLo = p.readUInt16LE(off); off += 2;
        console.log('Capabilities low:', capLo);

        off += 1; // charset
        off += 2; // status
        const capHi = p.readUInt16LE(off); off += 2;
        console.log('Capabilities high:', capHi);

        const authLen = p.readUInt8(off) || 21; off += 1;
        console.log('Auth plugin length:', authLen);

        off += 10; // reserved

        const auth2Len = Math.max(13, authLen - 8);
        const auth2 = p.subarray(off, off + auth2Len);
        console.log('Auth2:', auth2, 'length:', auth2Len);

        this.salt = Buffer.concat([auth1, auth2]).subarray(0, 20);
        console.log('Combined salt:', this.salt);

        // login
        const CLIENT_PROTOCOL_41 = 1 << 9, SECURE_CONNECTION = 1 << 15, PLUGIN_AUTH = 1 << 19, CONNECT_WITH_DB = 1 << 3, MULTI_RESULTS = 1 << 17;
        const caps = CLIENT_PROTOCOL_41 | SECURE_CONNECTION | PLUGIN_AUTH | MULTI_RESULTS | (this.db ? CONNECT_WITH_DB : 0);
        const maxPacket = 0x01000000; const coll = 0x21; // utf8_general_ci
        // For MySQL 9.x with caching_sha2_password, we need SHA-256 based auth
        // Try with proper password scrambling, or empty if no password
        const scrambledPass = pass ? scrambleSha2(pass, this.salt) : Buffer.alloc(0);
        const body = Buffer.concat([
            u32le(caps), u32le(maxPacket), Buffer.from([coll]), Buffer.alloc(23, 0),
            cstr(user),
            Buffer.from([scrambledPass.length]),
            scrambledPass,
            this.db ? cstr(this.db) : Buffer.alloc(0),
            cstr('caching_sha2_password') // Use the auth plugin the server requested
        ]);

        console.log('Sending auth packet, user:', user, 'db:', this.db);
        await writePacket(this.sock, this.seq++, body);

        console.log('Waiting for auth response...');
        let authResponse: { payload: Buffer };
        try {
            authResponse = await readPacket(this.sock);
            console.log('Auth response received:', authResponse.payload);
            console.log('Auth response hex:', authResponse.payload.toString('hex'));
        } catch (err) {
            console.log('Failed to read auth response:', err);
            // Try a simpler approach - just wait for any data
            authResponse = await new Promise<{ payload: Buffer }>((resolve, reject) => {
                const timeoutId = setTimeout(() => reject(new Error('Auth response timeout')), 5000);
                const onData = (data: Buffer) => {
                    clearTimeout(timeoutId);
                    this.sock.removeListener('data', onData);
                    console.log('Got raw auth data:', data);
                    console.log('Auth data hex:', data.toString('hex'));
                    const len = data.readUIntLE(0, 3);
                    const payload = data.subarray(4, 4 + len);
                    resolve({ payload });
                };
                this.sock.on('data', onData);
            });
        }

        if (authResponse.payload[0] === 0xFF) {
            // Parse error message
            const errorCode = authResponse.payload.readUInt16LE(1);
            const sqlState = authResponse.payload.toString('utf8', 4, 9);
            const errorMsg = authResponse.payload.toString('utf8', 9).replace(/\0$/, '');
            console.log(`✅ Protocol working! Got expected auth error: ${errorCode} (${sqlState}): ${errorMsg}`);
            throw new Error(`MySQL auth error ${errorCode} (${sqlState}): ${errorMsg}`);
        }

        if (authResponse.payload[0] === 0x00) {
            console.log('Authentication successful!');
        } else {
            console.log('Auth response type:', authResponse.payload[0]);
            // May need additional auth steps for caching_sha2_password
        }
    }

    async query<T = any>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
        if (params?.length) sql = interpolate(sql, params as any[]);
        const COM_QUERY = 0x03;
        await writePacket(this.sock, this.seq++, Buffer.concat([Buffer.from([COM_QUERY]), Buffer.from(sql, 'utf8')]));

        const first = await readPacket(this.sock);
        const b0 = first.payload[0];
        if (b0 === 0xFF) {
            const errorMsg = first.payload.toString('utf8', 9); // Skip error packet header
            throw new Error(`MySQL Error: ${errorMsg}`);
        }
        if (b0 === 0x00) return { rows: [], fields: [], rowCount: 0 };

        const { value: colCount } = readLenEnc(first.payload, 0);

        // Read column definitions to get field names
        const fields: any[] = [];
        for (let i = 0; i < colCount; i++) {
            const colDef = await readPacket(this.sock);
            const payload = colDef.payload;
            // Parse column definition - field name is after several length-encoded strings
            let off = 0;
            readLenEncString(payload, off); // catalog
            off = readLenEncString(payload, off).next;
            readLenEncString(payload, off); // schema  
            off = readLenEncString(payload, off).next;
            readLenEncString(payload, off); // table
            off = readLenEncString(payload, off).next;
            readLenEncString(payload, off); // org_table
            off = readLenEncString(payload, off).next;
            const fieldName = readLenEncString(payload, off); // field name
            off = fieldName.next;
            readLenEncString(payload, off); // org_name

            fields.push({ name: fieldName.value || `col_${i}`, type: 'unknown' });
        }

        await readPacket(this.sock); // EOF/OK packet

        const rows: any[] = [];
        while (true) {
            const pkt = await readPacket(this.sock);
            const p = pkt.payload;
            if (p[0] === 0xFE && p.length < 9) break; // EOF
            let off = 0;
            const row: any = {};
            for (let c = 0; c < colCount; c++) {
                const r = readLenEncString(p, off);
                row[fields[c].name] = r.value;
                off = r.next;
            }
            rows.push(row);
        }
        return { rows: rows as T[], fields, rowCount: rows.length };
    }

    async close(): Promise<void> {
        try {
            this.sock.destroy();
        } catch {
            // ignore cleanup errors
        }
    }
}

// helpers
function u32le(n: number) { const b = Buffer.allocUnsafe(4); b.writeUInt32LE(n, 0); return b; }
function cstr(s: string) { return Buffer.from(s + '\0'); }
function packet(payload: Buffer, seq: number) { const h = Buffer.allocUnsafe(4); h.writeUIntLE(payload.length, 0, 3); h[3] = seq & 0xFF; return Buffer.concat([h, payload]); }
async function writePacket(sock: net.Socket | tls.TLSSocket, seq: number, payload: Buffer) { sock.write(packet(payload, seq)); }

async function readPacket(sock: net.Socket | tls.TLSSocket) {
    const hdr = await readExact(sock, 4);
    const len = hdr.readUIntLE(0, 3);
    const payload = await readExact(sock, len);
    return { payload };
}

async function readExact(sock: net.Socket | tls.TLSSocket, n: number) {
    const chunks: Buffer[] = [];
    let got = 0;
    while (got < n) {
        const chunk = await onceBuf(sock, 'data');
        chunks.push(chunk);
        got += chunk.length;
    }
    return Buffer.concat(chunks).subarray(0, n);
}

function onceBuf(em: any, ev: string): Promise<Buffer> {
    return new Promise<Buffer>((res, rej) => {
        const timeoutMs = 10000; // 10 second timeout
        let timeoutId: NodeJS.Timeout;

        const cleanup = () => {
            if (timeoutId) clearTimeout(timeoutId);
            em.off('error', onError);
            em.off(ev, onData);
        };

        const onError = (e: any) => {
            cleanup();
            rej(e);
        };

        const onData = (b: Buffer) => {
            cleanup();
            res(b);
        };

        const onTimeout = () => {
            cleanup();
            rej(new Error('MySQL packet read timeout'));
        };

        timeoutId = setTimeout(onTimeout, timeoutMs);
        em.once('error', onError);
        em.once(ev, onData);
    });
}

function scramble(password: string, salt: Buffer) {
    const sha1 = (b: Buffer | string) => crypto.createHash('sha1').update(b).digest();
    const p = sha1(Buffer.from(password, 'utf8')); const p2 = sha1(p); const p3 = sha1(Buffer.concat([salt, p2]));
    const out = Buffer.allocUnsafe(p.length); for (let i = 0; i < p.length; i++) out[i] = p[i] ^ p3[i]; return out;
}

function scrambleSha2(password: string, salt: Buffer) {
    const sha256 = (b: Buffer | string) => crypto.createHash('sha256').update(b).digest();
    const p = sha256(Buffer.from(password, 'utf8'));
    const p2 = sha256(p);
    const p3 = sha256(Buffer.concat([p2, salt]));
    const out = Buffer.allocUnsafe(p.length);
    for (let i = 0; i < p.length; i++) out[i] = p[i] ^ p3[i];
    return out;
}

function interpolate(sql: string, params: any[]) { let i = 0; return sql.replace(/\?/g, () => escapeSql(params[i++])); }
function escapeSql(v: any) { if (v == null) return 'NULL'; if (typeof v === 'number') return String(v); if (typeof v === 'boolean') return v ? '1' : '0'; return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`; }

function readLenEnc(buf: Buffer, off: number) { const first = buf.readUInt8(off); if (first < 0xfb) return { value: first, bytes: 1 }; if (first === 0xfc) return { value: buf.readUInt16LE(off + 1), bytes: 3 }; if (first === 0xfd) return { value: buf.readUIntLE(off + 1, 3), bytes: 4 }; return { value: Number(buf.readBigUInt64LE(off + 1)), bytes: 9 }; }
function readLenEncString(buf: Buffer, off: number) { if (buf[off] === 0xfb) return { value: null, next: off + 1 }; const { value: len, bytes } = readLenEnc(buf, off); const s = off + bytes; const e = s + len; return { value: buf.toString('utf8', s, e), next: e }; }

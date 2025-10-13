import * as net from "net";
import * as tls from "tls";
import { URL } from "url";

export type MySQLProbe = { serverVersion?: string; tlsAttempted: boolean; portOpen?: boolean; error?: string; capabilityBits?: number; authPlugin?: string };

export async function probeMySQL(urlString: string, timeoutMs = 3000): Promise<MySQLProbe> {
    const result: MySQLProbe = { tlsAttempted: false };
    let socket: net.Socket | tls.TLSSocket | undefined;

    try {
        const url = new URL(urlString);
        const host = url.hostname || '127.0.0.1';
        const port = Number(url.port) || (url.protocol === 'mysqls:' ? 33060 : 3306);
        const useTLS = url.protocol === 'mysqls:' || url.searchParams.get('ssl') === '1' || url.searchParams.get('ssl') === 'true';
        result.tlsAttempted = !!useTLS;

        await new Promise<void>((resolve, reject) => {
            let resolved = false;
            const onError = (err: Error) => { if (!resolved) { resolved = true; reject(err); } };
            const onTimeout = () => { if (!resolved) { resolved = true; reject(new Error('timeout')); } };
            const onData = (data: Buffer) => {
                if (resolved) return;
                resolved = true;
                try {
                    if (data.length < 5) throw new Error('handshake too short');
                    const payloadLen = data.readUIntLE(0, 3);
                    const payload = data.subarray(4, 4 + payloadLen);
                    const end = payload.indexOf(0x00, 1);
                    const serverVersion = payload.toString('utf8', 1, end > 0 ? end : payload.length);
                    // capability flags lower @ off after conn id(4) + auth1(8) + filler(1)
                    let off = (end > 0 ? end + 1 : payload.length);
                    off += 4 + 8 + 1;
                    let capLo = 0, capHi = 0;
                    if (payload.length >= off + 2) {
                        capLo = payload.readUInt16LE(off); off += 2;
                        off += 1 + 2; // charset + status
                        if (payload.length >= off + 2) capHi = payload.readUInt16LE(off);
                    }
                    result.serverVersion = `${serverVersion}`;
                    result.capabilityBits = (capHi << 16) | capLo;

                    // Extract authentication plugin name from the end of the greeting packet
                    // Skip to auth plugin data: after capabilities, auth_len, reserved(10), auth2
                    let authPluginOff = off + 2 + 1 + 10; // Skip caps_hi + auth_len + reserved
                    if (payload.length > authPluginOff) {
                        // Skip auth2 data - find the null-terminated auth plugin name at the end
                        let searchOff = authPluginOff;
                        while (searchOff < payload.length && payload[searchOff] !== 0x00) searchOff++;
                        if (searchOff < payload.length) searchOff++; // Skip the null terminator

                        // Auth plugin name is null-terminated string at the end
                        if (searchOff < payload.length) {
                            const pluginEnd = payload.indexOf(0x00, searchOff);
                            if (pluginEnd > searchOff) {
                                result.authPlugin = payload.toString('utf8', searchOff, pluginEnd);
                            }
                        }
                    }

                    socket?.end();
                    resolve();
                } catch (e) {
                    socket?.destroy();
                    reject(e as Error);
                }
            };
            const onConnect = () => { /* wait for server greeting */ };
            socket = useTLS ? tls.connect({ host, port, rejectUnauthorized: false }, onConnect) : net.connect({ host, port }, onConnect);
            socket.setTimeout(timeoutMs, onTimeout);
            socket.once('error', onError);
            socket.once('data', onData);
            socket.once('close', () => { if (!resolved) { resolved = true; resolve(); } });
        });

        result.portOpen = true;
        return result;
    } catch (err: any) {
        return { ...result, error: err?.message || String(err) };
    } finally {
        try {
            socket?.destroy();
        } catch {
            // ignore cleanup errors
        }
    }
}
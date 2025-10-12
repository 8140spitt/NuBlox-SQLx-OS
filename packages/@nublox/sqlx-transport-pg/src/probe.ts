import * as net from "net";
import { URL } from "url";

export type PGProbe = { tlsOffered?: boolean; error?: string; portOpen?: boolean };

export async function probePostgres(urlString: string, timeoutMs = 3000): Promise<PGProbe> {
    const res: PGProbe = {};
    let socket: net.Socket | undefined;

    try {
        const u = new URL(urlString);
        const host = u.hostname || '127.0.0.1';
        const port = Number(u.port) || 5432;

        await new Promise<void>((resolve, reject) => {
            let done = false;
            const fail = (e: Error) => {
                if (!done) {
                    done = true;
                    reject(e);
                }
            };

            socket = net.connect({ host, port }, () => {
                const buf = Buffer.allocUnsafe(8);
                buf.writeUInt32BE(8, 0);
                buf.writeUInt32BE(80877103, 4); // SSLRequest magic
                socket?.write(buf);
            });

            socket.setTimeout(timeoutMs, () => fail(new Error('timeout')));
            socket.once('error', fail);
            socket.once('data', (b: Buffer) => {
                res.tlsOffered = (String.fromCharCode(b[0]) === 'S');
                done = true;
                resolve();
            });
        });

        res.portOpen = true;
        return res;
    } catch (e: any) {
        return { ...res, error: e?.message || String(e) };
    } finally {
        try {
            socket?.destroy();
        } catch {
            // ignore cleanup errors
        }
    }
}
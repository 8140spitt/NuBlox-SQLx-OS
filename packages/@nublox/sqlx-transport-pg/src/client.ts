import * as net from "net";
import * as crypto from "crypto";
import { URL } from "url";
import type { QueryResult, ISqlxClient } from '@nublox/sqlx-core';

export class PostgresClient implements ISqlxClient {
    private sock!: net.Socket;
    private connected = false;
    private buffer = Buffer.alloc(0);

    static async connect(url: string): Promise<PostgresClient> {
        const client = new PostgresClient();
        await client._connect(url);
        return client;
    }

    private async _connect(urlString: string) {
        const u = new URL(urlString);
        const host = u.hostname || '127.0.0.1';
        const port = Number(u.port) || 5432;
        const user = decodeURIComponent(u.username || 'postgres');
        const password = decodeURIComponent(u.password || '');
        const database = u.pathname ? u.pathname.replace(/^\//, '') : 'postgres';

        this.sock = net.connect({ host, port });

        // Startup message
        const params = [
            'user', user,
            'database', database,
            'client_encoding', 'UTF8'
        ];
        
        let paramBuffer = Buffer.alloc(0);
        for (const param of params) {
            paramBuffer = Buffer.concat([paramBuffer, Buffer.from(param + '\0')]);
        }
        paramBuffer = Buffer.concat([paramBuffer, Buffer.from([0])]);

        const startupMsg = Buffer.alloc(8 + paramBuffer.length);
        startupMsg.writeUInt32BE(8 + paramBuffer.length, 0); // length
        startupMsg.writeUInt32BE(196608, 4); // protocol version 3.0
        paramBuffer.copy(startupMsg, 8);

        this.sock.write(startupMsg);

        // Handle authentication
        while (true) {
            const msg = await this.readMessage();
            
            switch (msg.type) {
                case 'R': // Authentication
                    const authType = msg.data.readUInt32BE(0);
                    if (authType === 0) {
                        // Authentication successful
                        continue;
                    } else if (authType === 3) {
                        // Clear text password
                        const passMsg = Buffer.concat([
                            Buffer.from('p'),
                            Buffer.alloc(4),
                            Buffer.from(password + '\0')
                        ]);
                        passMsg.writeUInt32BE(passMsg.length - 1, 1);
                        this.sock.write(passMsg);
                        continue;
                    } else if (authType === 5) {
                        // MD5 password
                        const salt = msg.data.subarray(4, 8);
                        const hash1 = crypto.createHash('md5').update(password + user).digest('hex');
                        const hash2 = crypto.createHash('md5').update(hash1 + salt.toString('binary')).digest('hex');
                        const md5Pass = 'md5' + hash2;
                        
                        const passMsg = Buffer.concat([
                            Buffer.from('p'),
                            Buffer.alloc(4),
                            Buffer.from(md5Pass + '\0')
                        ]);
                        passMsg.writeUInt32BE(passMsg.length - 1, 1);
                        this.sock.write(passMsg);
                        continue;
                    } else {
                        throw new Error(`Unsupported auth type: ${authType}`);
                    }
                    
                case 'S': // Parameter status
                    // Ignore parameter status for now
                    continue;
                    
                case 'K': // Backend key data
                    // Ignore backend key data for now
                    continue;
                    
                case 'Z': // Ready for query
                    this.connected = true;
                    return;
                    
                case 'E': // Error
                    const errorMsg = msg.data.toString('utf8').replace(/\0/g, ' ');
                    throw new Error(`PostgreSQL Error: ${errorMsg}`);
                    
                default:
                    console.warn(`Unknown message type: ${msg.type}`);
                    continue;
            }
        }
    }

    private async readMessage(): Promise<{ type: string; data: Buffer }> {
        // Read message type (1 byte)
        while (this.buffer.length < 1) {
            const chunk = await this.readChunk();
            this.buffer = Buffer.concat([this.buffer, chunk]);
        }
        
        const type = String.fromCharCode(this.buffer[0]);
        this.buffer = this.buffer.subarray(1);
        
        // Read message length (4 bytes)
        while (this.buffer.length < 4) {
            const chunk = await this.readChunk();
            this.buffer = Buffer.concat([this.buffer, chunk]);
        }
        
        const length = this.buffer.readUInt32BE(0) - 4; // length includes itself
        this.buffer = this.buffer.subarray(4);
        
        // Read message data
        while (this.buffer.length < length) {
            const chunk = await this.readChunk();
            this.buffer = Buffer.concat([this.buffer, chunk]);
        }
        
        const data = this.buffer.subarray(0, length);
        this.buffer = this.buffer.subarray(length);
        
        return { type, data };
    }

    private readChunk(): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('PostgreSQL read timeout'));
            }, 10000);
            
            const onData = (chunk: Buffer) => {
                clearTimeout(timeout);
                this.sock.off('error', onError);
                resolve(chunk);
            };
            
            const onError = (err: Error) => {
                clearTimeout(timeout);
                this.sock.off('data', onData);
                reject(err);
            };
            
            this.sock.once('data', onData);
            this.sock.once('error', onError);
        });
    }

    async query<T = any>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
        if (!this.connected) {
            throw new Error('Not connected to PostgreSQL server');
        }

        // Simple query protocol (no parameters for now)
        const queryMsg = Buffer.concat([
            Buffer.from('Q'),
            Buffer.alloc(4),
            Buffer.from(sql + '\0')
        ]);
        queryMsg.writeUInt32BE(queryMsg.length - 1, 1);
        
        this.sock.write(queryMsg);

        const fields: any[] = [];
        const rows: any[] = [];
        let rowCount = 0;

        while (true) {
            const msg = await this.readMessage();
            
            switch (msg.type) {
                case 'T': // Row description
                    const fieldCount = msg.data.readUInt16BE(0);
                    let offset = 2;
                    
                    for (let i = 0; i < fieldCount; i++) {
                        const nameEnd = msg.data.indexOf(0, offset);
                        const fieldName = msg.data.toString('utf8', offset, nameEnd);
                        fields.push({ name: fieldName, type: 'unknown' });
                        
                        // Skip the rest of the field description
                        offset = nameEnd + 1 + 18; // field name + null + field info (18 bytes)
                    }
                    break;
                    
                case 'D': // Data row
                    const columnCount = msg.data.readUInt16BE(0);
                    let colOffset = 2;
                    const row: any = {};
                    
                    for (let i = 0; i < columnCount; i++) {
                        const length = msg.data.readInt32BE(colOffset);
                        colOffset += 4;
                        
                        if (length === -1) {
                            // NULL value
                            row[fields[i]?.name || `col_${i}`] = null;
                        } else {
                            const value = msg.data.toString('utf8', colOffset, colOffset + length);
                            row[fields[i]?.name || `col_${i}`] = value;
                            colOffset += length;
                        }
                    }
                    
                    rows.push(row);
                    rowCount++;
                    break;
                    
                case 'C': // Command complete
                    // Parse row count from command tag if available
                    const commandTag = msg.data.toString('utf8', 0, -1);
                    const match = commandTag.match(/\d+$/);
                    if (match) {
                        rowCount = parseInt(match[0]);
                    }
                    break;
                    
                case 'Z': // Ready for query
                    return { rows: rows as T[], fields, rowCount };
                    
                case 'E': // Error
                    const errorMsg = msg.data.toString('utf8').replace(/\0/g, ' ');
                    throw new Error(`PostgreSQL Query Error: ${errorMsg}`);
                    
                case 'N': // Notice
                    // Ignore notices for now
                    break;
                    
                default:
                    console.warn(`Unknown query response type: ${msg.type}`);
                    break;
            }
        }
    }

    async close(): Promise<void> {
        if (this.sock) {
            // Send terminate message
            const terminateMsg = Buffer.from(['X'.charCodeAt(0), 0, 0, 0, 4]);
            this.sock.write(terminateMsg);
            this.sock.destroy();
        }
        this.connected = false;
    }
}
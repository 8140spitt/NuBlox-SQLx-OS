import createWireTransport from './wirevm';

export type Session = {
  id: string;
  url: string;
  packName: string;
  connectedAt: number;
  meta?: Record<string, unknown>;
};

export interface ExecResult {
  rows: any[];
  rowCount?: number;
}

export type Transport = {
  handshake(packPath: string, url: string, opts?: any): Promise<{ session: Session }>;
  exec(session: Session, req: { sql: string; params?: unknown[] }): Promise<ExecResult>;
  explain(session: Session, sql: string): Promise<any>;
  ping(session: Session): Promise<void>;
  close(session: Session): Promise<void>;
};

export type HandshakeAdvisor = {
  proposeClientCaps(greeting: any, policy?: any): number;
};

export async function loadTransportFromRegistry(
  rawUrl: string,
  cwd: string
): Promise<{ transportPackPath: string; transport: Transport }> {
  const { URL } = await import('node:url');
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');

  const scheme = new URL(rawUrl).protocol.replace(':', '').toLowerCase();
  const regPath = path.resolve(cwd, 'transports', 'registry.json');
  const reg = JSON.parse(await readFile(regPath, 'utf8'));
  const entry = reg.families[scheme];
  if (!entry) throw new Error(`No transport pack for scheme '${scheme}'`);

  const packPath = path.resolve(cwd, 'transports', entry.pack);
  const transport = createWireTransport();
  return { transportPackPath: packPath, transport };
}

export default createWireTransport;

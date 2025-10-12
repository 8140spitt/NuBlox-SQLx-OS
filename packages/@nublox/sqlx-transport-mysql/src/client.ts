// Phase 1: placeholder client interface for future snapshot/queries
export type QueryResult = { rows: any[] };
export class MySQLClient { constructor(public url: string) { } async query(_sql: string): Promise<QueryResult> { return { rows: [] }; } async close() { } }
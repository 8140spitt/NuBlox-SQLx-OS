export type DBClient = { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> };
export async function pullSnapshot(_db: DBClient, _dbName: string) { return { version: 1, schemas: [] }; }
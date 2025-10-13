export type Dialect = 'mysql' | 'pg';

export interface ProbeInfo {
    dialect: Dialect;
    version: string | null;
    tls: boolean;
    authPlugins?: string[];
    capabilities?: Record<string, boolean | number | string>;
    parameters?: Record<string, string>; // e.g., PG ParameterStatus
}

export interface QueryField {
    name: string;
    type?: string;
}

export interface QueryResult<T = any> {
    rows: T[];
    fields?: QueryField[];
    rowCount?: number;
}

export interface ISqlxClient {
    query<T = any>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
    close(): Promise<void>;
}

export interface ISqlxTransport {
    probe(url: string, timeoutMs?: number): Promise<ProbeInfo>;
    connect(url: string): Promise<ISqlxClient>;
}

export type LogicalType = 'string' | 'text' | 'int' | 'bigint' | 'bool' | 'json' | 'decimal' | 'ts';


export type ColumnSpec = {
    name: string;
    logicalType: LogicalType;
    len?: number; scale?: number;
    nullable: boolean;
    defaultSql?: string; generatedSql?: string;
};


export type Op =
    | { kind: 'CreateTable'; schema: string; name: string; columns: ColumnSpec[]; pk?: string[] }
    | { kind: 'AddColumn'; schema: string; table: string; column: ColumnSpec }
    | { kind: 'AddIndex'; schema: string; table: string; name: string; columns: string[]; unique?: boolean }
    | { kind: 'DropTable'; schema: string; name: string }
    | { kind: 'ExecSQL'; sql: string; unsafe?: boolean };


export type Plan = { ops: Op[]; risk: 'low' | 'medium' | 'high'; summary?: string };
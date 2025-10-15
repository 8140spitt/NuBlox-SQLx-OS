// Core IR types for dialect-agnostic database operations

// Base IR Node types
export interface IRNode {
    type: string;
    id?: string;
    meta?: Record<string, unknown>;
}

// DDL Operations
export interface IRCreateTable extends IRNode {
    type: 'CREATE_TABLE';
    name: string;
    schema?: string;
    columns: IRColumn[];
    constraints?: IRConstraint[];
    options?: IRTableOptions;
}

export interface IRDropTable extends IRNode {
    type: 'DROP_TABLE';
    name: string;
    schema?: string;
    ifExists?: boolean;
    cascade?: boolean;
}

export interface IRAlterTable extends IRNode {
    type: 'ALTER_TABLE';
    name: string;
    schema?: string;
    operations: IRAlterOperation[];
}

export interface IRColumn {
    name: string;
    dataType: IRDataType;
    nullable?: boolean;
    defaultValue?: IRExpression;
    autoIncrement?: boolean;
    comment?: string;
}

export interface IRDataType {
    type: 'INTEGER' | 'VARCHAR' | 'TEXT' | 'BOOLEAN' | 'TIMESTAMP' | 'JSON' | 'DECIMAL' | 'BLOB';
    length?: number;
    precision?: number;
    scale?: number;
    charset?: string;
}

export interface IRConstraint {
    type: 'PRIMARY_KEY' | 'FOREIGN_KEY' | 'UNIQUE' | 'CHECK' | 'INDEX';
    name?: string;
    columns: string[];
    referencedTable?: string;
    referencedColumns?: string[];
    onDelete?: 'CASCADE' | 'SET_NULL' | 'RESTRICT';
    onUpdate?: 'CASCADE' | 'SET_NULL' | 'RESTRICT';
    expression?: IRExpression;
    unique?: boolean;
    concurrent?: boolean;
}

export interface IRAlterOperation {
    type: 'ADD_COLUMN' | 'DROP_COLUMN' | 'MODIFY_COLUMN' | 'ADD_CONSTRAINT' | 'DROP_CONSTRAINT' | 'RENAME_TABLE' | 'RENAME_COLUMN';
    column?: IRColumn;
    columnName?: string;
    newColumnName?: string;
    newTableName?: string;
    constraint?: IRConstraint;
    constraintName?: string;
}

export interface IRTableOptions {
    engine?: string;
    charset?: string;
    collation?: string;
    comment?: string;
    autoIncrement?: number;
}

// DML Operations
export interface IRInsert extends IRNode {
    type: 'INSERT';
    table: string;
    schema?: string;
    columns?: string[];
    values?: IRExpression[][];
    onConflict?: IROnConflict;
}

export interface IRUpdate extends IRNode {
    type: 'UPDATE';
    table: string;
    schema?: string;
    set: IRAssignment[];
    where?: IRExpression;
    joins?: IRJoin[];
}

export interface IRDelete extends IRNode {
    type: 'DELETE';
    table: string;
    schema?: string;
    where?: IRExpression;
    joins?: IRJoin[];
}

export interface IRAssignment {
    column: string;
    value: IRExpression;
}

export interface IROnConflict {
    action: 'IGNORE' | 'UPDATE' | 'REPLACE';
    columns?: string[];
    updateSet?: IRAssignment[];
}

// DQL Operations
export interface IRSelect extends IRNode {
    type: 'SELECT';
    columns: IRSelectColumn[];
    from?: IRFromClause;
    where?: IRExpression;
    groupBy?: IRExpression[];
    having?: IRExpression;
    orderBy?: IROrderBy[];
    limit?: number;
    offset?: number;
    distinct?: boolean;
}

export interface IRSelectColumn {
    expression: IRExpression;
    alias?: string;
}

export interface IRFromClause {
    type: 'TABLE' | 'SUBQUERY' | 'JOIN';
    table?: string;
    schema?: string;
    alias?: string;
    subquery?: IRSelect;
    joins?: IRJoin[];
}

export interface IRJoin {
    type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' | 'CROSS';
    table: string;
    schema?: string;
    alias?: string;
    condition?: IRExpression;
}

export interface IROrderBy {
    expression: IRExpression;
    direction: 'ASC' | 'DESC';
    nulls?: 'FIRST' | 'LAST';
}

// Expressions
export interface IRExpression {
    type: 'LITERAL' | 'COLUMN' | 'FUNCTION' | 'BINARY_OP' | 'UNARY_OP' | 'CASE' | 'SUBQUERY' | 'PARAMETER';
    value?: unknown;
    column?: string;
    table?: string;
    functionName?: string;
    arguments?: IRExpression[];
    operator?: string;
    left?: IRExpression;
    right?: IRExpression;
    operand?: IRExpression;
    conditions?: IRCaseCondition[];
    elseValue?: IRExpression;
    subquery?: IRSelect;
    parameterIndex?: number;
}

export interface IRCaseCondition {
    when: IRExpression;
    then: IRExpression;
}

// Schema Snapshot
export interface IRSchemaSnapshot {
    version: string;
    timestamp: string;
    database: string;
    tables: IRTableDefinition[];
    views: IRViewDefinition[];
    indexes: IRIndexDefinition[];
    procedures: IRProcedureDefinition[];
    functions: IRFunctionDefinition[];
    triggers: IRTriggerDefinition[];
    sequences: IRSequenceDefinition[];
}

export interface IRTableDefinition {
    name: string;
    schema: string;
    columns: IRColumn[];
    constraints: IRConstraint[];
    indexes: IRIndexDefinition[];
    options: IRTableOptions;
    rowCount?: number;
    sizeBytes?: number;
}

export interface IRViewDefinition {
    name: string;
    schema: string;
    definition: string;
    columns: IRColumn[];
    materialized?: boolean;
}

export interface IRIndexDefinition {
    name: string;
    table: string;
    schema: string;
    columns: IRIndexColumn[];
    unique: boolean;
    type?: 'BTREE' | 'HASH' | 'GIN' | 'GIST' | 'FULLTEXT';
    where?: IRExpression;
    concurrent?: boolean;
}

export interface IRIndexColumn {
    name: string;
    direction?: 'ASC' | 'DESC';
    length?: number;
    expression?: IRExpression;
}

export interface IRProcedureDefinition {
    name: string;
    schema: string;
    parameters: IRParameter[];
    body: string;
    language?: string;
}

export interface IRFunctionDefinition {
    name: string;
    schema: string;
    parameters: IRParameter[];
    returnType: IRDataType;
    body: string;
    language?: string;
    immutable?: boolean;
}

export interface IRTriggerDefinition {
    name: string;
    table: string;
    schema: string;
    timing: 'BEFORE' | 'AFTER' | 'INSTEAD_OF';
    events: ('INSERT' | 'UPDATE' | 'DELETE')[];
    body: string;
    condition?: IRExpression;
}

export interface IRSequenceDefinition {
    name: string;
    schema: string;
    start: number;
    increment: number;
    minValue?: number;
    maxValue?: number;
    cycle?: boolean;
}

export interface IRParameter {
    name: string;
    dataType: IRDataType;
    mode?: 'IN' | 'OUT' | 'INOUT';
    defaultValue?: IRExpression;
}

// Serialization utilities
export class IRSerializer {
    static serialize(node: IRNode): string {
        return JSON.stringify(node, null, 2);
    }

    static deserialize<T extends IRNode>(json: string): T {
        return JSON.parse(json) as T;
    }

    static serializeSnapshot(snapshot: IRSchemaSnapshot): string {
        return JSON.stringify(snapshot, null, 2);
    }

    static deserializeSnapshot(json: string): IRSchemaSnapshot {
        return JSON.parse(json) as IRSchemaSnapshot;
    }
}

// Visitor pattern for IR traversal
export abstract class IRVisitor<T = void> {
    abstract visitCreateTable(node: IRCreateTable): T;
    abstract visitDropTable(node: IRDropTable): T;
    abstract visitAlterTable(node: IRAlterTable): T;
    abstract visitInsert(node: IRInsert): T;
    abstract visitUpdate(node: IRUpdate): T;
    abstract visitDelete(node: IRDelete): T;
    abstract visitSelect(node: IRSelect): T;

    visit(node: IRNode): T {
        switch (node.type) {
            case 'CREATE_TABLE': return this.visitCreateTable(node as IRCreateTable);
            case 'DROP_TABLE': return this.visitDropTable(node as IRDropTable);
            case 'ALTER_TABLE': return this.visitAlterTable(node as IRAlterTable);
            case 'INSERT': return this.visitInsert(node as IRInsert);
            case 'UPDATE': return this.visitUpdate(node as IRUpdate);
            case 'DELETE': return this.visitDelete(node as IRDelete);
            case 'SELECT': return this.visitSelect(node as IRSelect);
            default:
                throw new Error(`Unknown IR node type: ${node.type}`);
        }
    }
}

// Utility functions
export function createTableFromDefinition(def: IRTableDefinition): IRCreateTable {
    return {
        type: 'CREATE_TABLE',
        name: def.name,
        schema: def.schema,
        columns: def.columns,
        constraints: def.constraints,
        options: def.options
    };
}

export function createColumnReference(table: string, column: string): IRExpression {
    return {
        type: 'COLUMN',
        table,
        column
    };
}

export function createLiteral(value: unknown): IRExpression {
    return {
        type: 'LITERAL',
        value
    };
}

export function createParameter(index: number): IRExpression {
    return {
        type: 'PARAMETER',
        parameterIndex: index
    };
}
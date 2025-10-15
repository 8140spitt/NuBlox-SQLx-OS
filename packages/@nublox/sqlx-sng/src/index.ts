import type { IRSchemaSnapshot, IRTableDefinition, IRColumn } from '@nublox/sqlx-ir';

// Schema Neural Graph representation for embeddings and topology
export interface SchemaGraph {
    nodes: SchemaNode[];
    edges: SchemaEdge[];
    embeddings: NodeEmbedding[];
    metadata: GraphMetadata;
}

export interface SchemaNode {
    id: string;
    type: 'table' | 'column' | 'index' | 'constraint' | 'view' | 'procedure' | 'function';
    name: string;
    schema: string;
    properties: Record<string, unknown>;
    semanticTags: string[];
    statistics?: NodeStatistics;
}

export interface SchemaEdge {
    id: string;
    sourceId: string;
    targetId: string;
    type: 'foreign_key' | 'belongs_to' | 'indexes' | 'references' | 'depends_on';
    weight: number;
    properties: Record<string, unknown>;
}

export interface NodeEmbedding {
    nodeId: string;
    vector: number[];
    model: string;
    version: string;
    computedAt: string;
}

export interface GraphMetadata {
    version: string;
    createdAt: string;
    sourceSnapshot: string;
    nodeCount: number;
    edgeCount: number;
    embeddingModel: string;
}

export interface NodeStatistics {
    rowCount?: number;
    sizeBytes?: number;
    cardinality?: number;
    nullRate?: number;
    uniqueRate?: number;
    accessFrequency?: number;
}

// PII Detection and Semantic Analysis
export interface PIIClassification {
    columnId: string;
    confidence: number;
    type: 'email' | 'phone' | 'ssn' | 'credit_card' | 'ip_address' | 'name' | 'address' | 'date_of_birth';
    patterns: string[];
    reasoning: string;
}

export interface SemanticAnalysis {
    columnId: string;
    semanticType: string;
    businessConcept: string;
    dataQuality: DataQualityMetrics;
    relationships: ColumnRelationship[];
}

export interface DataQualityMetrics {
    completeness: number;
    uniqueness: number;
    validity: number;
    consistency: number;
    accuracy?: number;
}

export interface ColumnRelationship {
    targetColumnId: string;
    relationship: 'similar' | 'derived' | 'correlated' | 'duplicate';
    strength: number;
    evidence: string[];
}

// Workload Analysis
export interface WorkloadFingerprint {
    queryPatterns: QueryPattern[];
    accessPatterns: AccessPattern[];
    temporalPatterns: TemporalPattern[];
    joinPatterns: JoinPattern[];
}

export interface QueryPattern {
    id: string;
    template: string;
    frequency: number;
    avgLatency: number;
    tables: string[];
    columns: string[];
    operations: string[];
}

export interface AccessPattern {
    tableId: string;
    readFrequency: number;
    writeFrequency: number;
    hotColumns: string[];
    indexUsage: IndexUsage[];
}

export interface IndexUsage {
    indexId: string;
    usageCount: number;
    selectivity: number;
    effectiveness: number;
}

export interface TemporalPattern {
    tableId: string;
    timeColumn?: string;
    accessTiming: TimingDistribution;
    retention?: RetentionPattern;
}

export interface TimingDistribution {
    hourly: number[];
    daily: number[];
    weekly: number[];
}

export interface RetentionPattern {
    oldestRecord: string;
    newestRecord: string;
    growthRate: number;
    lifecycle: 'active' | 'archival' | 'historical';
}

export interface JoinPattern {
    tables: string[];
    frequency: number;
    avgLatency: number;
    joinConditions: string[];
    cardinality: 'one_to_one' | 'one_to_many' | 'many_to_many';
}

// Schema Neural Graph Builder
export class SchemaGraphBuilder {
    private nodes: Map<string, SchemaNode> = new Map();
    private edges: SchemaEdge[] = [];
    private embeddings: NodeEmbedding[] = [];

    static fromSnapshot(snapshot: IRSchemaSnapshot): SchemaGraphBuilder {
        const builder = new SchemaGraphBuilder();
        builder.buildFromSnapshot(snapshot);
        return builder;
    }

    private buildFromSnapshot(snapshot: IRSchemaSnapshot): void {
        // Build table nodes
        for (const table of snapshot.tables) {
            this.addTableNode(table);

            // Build column nodes and edges
            for (const column of table.columns) {
                this.addColumnNode(table, column);
                this.addBelongsToEdge(this.getColumnId(table.name, column.name), this.getTableId(table.name));
            }

            // Build constraint edges
            for (const constraint of table.constraints) {
                if (constraint.type === 'FOREIGN_KEY' && constraint.referencedTable) {
                    this.addForeignKeyEdge(
                        this.getTableId(table.name),
                        this.getTableId(constraint.referencedTable),
                        constraint
                    );
                }
            }

            // Build index nodes and edges
            for (const index of table.indexes) {
                this.addIndexNode(table, index);
                this.addIndexesEdge(this.getIndexId(index.name), this.getTableId(table.name));
            }
        }

        // Build view nodes
        for (const view of snapshot.views) {
            this.addViewNode(view);
        }
    }

    private addTableNode(table: IRTableDefinition): void {
        const id = this.getTableId(table.name);
        this.nodes.set(id, {
            id,
            type: 'table',
            name: table.name,
            schema: table.schema,
            properties: {
                rowCount: table.rowCount,
                sizeBytes: table.sizeBytes,
                columnCount: table.columns.length,
                hasIndexes: table.indexes.length > 0,
                engine: table.options.engine,
                charset: table.options.charset
            },
            semanticTags: this.inferTableSemanticTags(table),
            statistics: {
                rowCount: table.rowCount,
                sizeBytes: table.sizeBytes
            }
        });
    }

    private addColumnNode(table: IRTableDefinition, column: IRColumn): void {
        const id = this.getColumnId(table.name, column.name);
        this.nodes.set(id, {
            id,
            type: 'column',
            name: column.name,
            schema: table.schema,
            properties: {
                dataType: column.dataType.type,
                nullable: column.nullable,
                autoIncrement: column.autoIncrement,
                hasDefault: !!column.defaultValue,
                isPrimaryKey: this.isColumnPrimaryKey(table, column.name),
                isForeignKey: this.isColumnForeignKey(table, column.name)
            },
            semanticTags: this.inferColumnSemanticTags(column)
        });
    }

    private addIndexNode(table: IRTableDefinition, index: any): void {
        const id = this.getIndexId(index.name);
        this.nodes.set(id, {
            id,
            type: 'index',
            name: index.name,
            schema: table.schema,
            properties: {
                unique: index.unique,
                type: index.type,
                columnCount: index.columns.length,
                concurrent: index.concurrent
            },
            semanticTags: []
        });
    }

    private addViewNode(view: any): void {
        const id = this.getViewId(view.name);
        this.nodes.set(id, {
            id,
            type: 'view',
            name: view.name,
            schema: view.schema,
            properties: {
                materialized: view.materialized,
                columnCount: view.columns.length
            },
            semanticTags: []
        });
    }

    private addBelongsToEdge(sourceId: string, targetId: string): void {
        this.edges.push({
            id: `${sourceId}-belongs_to-${targetId}`,
            sourceId,
            targetId,
            type: 'belongs_to',
            weight: 1.0,
            properties: {}
        });
    }

    private addForeignKeyEdge(sourceId: string, targetId: string, constraint: any): void {
        this.edges.push({
            id: `${sourceId}-fk-${targetId}`,
            sourceId,
            targetId,
            type: 'foreign_key',
            weight: 0.8,
            properties: {
                constraintName: constraint.name,
                onDelete: constraint.onDelete,
                onUpdate: constraint.onUpdate,
                columns: constraint.columns,
                referencedColumns: constraint.referencedColumns
            }
        });
    }

    private addIndexesEdge(sourceId: string, targetId: string): void {
        this.edges.push({
            id: `${sourceId}-indexes-${targetId}`,
            sourceId,
            targetId,
            type: 'indexes',
            weight: 0.6,
            properties: {}
        });
    }

    private getTableId(name: string): string {
        return `table:${name}`;
    }

    private getColumnId(tableName: string, columnName: string): string {
        return `column:${tableName}.${columnName}`;
    }

    private getIndexId(name: string): string {
        return `index:${name}`;
    }

    private getViewId(name: string): string {
        return `view:${name}`;
    }

    private isColumnPrimaryKey(table: IRTableDefinition, columnName: string): boolean {
        return table.constraints.some(c =>
            c.type === 'PRIMARY_KEY' && c.columns.includes(columnName)
        );
    }

    private isColumnForeignKey(table: IRTableDefinition, columnName: string): boolean {
        return table.constraints.some(c =>
            c.type === 'FOREIGN_KEY' && c.columns.includes(columnName)
        );
    }

    private inferTableSemanticTags(table: IRTableDefinition): string[] {
        const tags: string[] = [];
        const name = table.name.toLowerCase();

        // Common table patterns
        if (name.includes('user') || name.includes('account')) tags.push('user_data');
        if (name.includes('order') || name.includes('transaction')) tags.push('transactional');
        if (name.includes('log') || name.includes('audit')) tags.push('audit_trail');
        if (name.includes('config') || name.includes('setting')) tags.push('configuration');
        if (name.includes('cache') || name.includes('temp')) tags.push('temporary');

        // Size-based tags
        if (table.rowCount && table.rowCount > 1000000) tags.push('large_table');
        if (table.rowCount && table.rowCount < 1000) tags.push('small_table');

        return tags;
    }

    private inferColumnSemanticTags(column: IRColumn): string[] {
        const tags: string[] = [];
        const name = column.name.toLowerCase();

        // PII patterns
        if (name.includes('email')) tags.push('pii:email');
        if (name.includes('phone')) tags.push('pii:phone');
        if (name.includes('ssn') || name.includes('social')) tags.push('pii:ssn');
        if (name.includes('name') && !name.includes('filename')) tags.push('pii:name');
        if (name.includes('address')) tags.push('pii:address');
        if (name.includes('credit') || name.includes('card')) tags.push('pii:credit_card');

        // Temporal patterns
        if (name.includes('created') || name.includes('updated') || name.includes('modified')) {
            tags.push('temporal');
        }
        if (column.dataType.type === 'TIMESTAMP') tags.push('timestamp');

        // Identity patterns
        if (name.endsWith('_id') || name === 'id') tags.push('identifier');
        if (column.autoIncrement) tags.push('auto_increment');

        // JSON/structured data
        if (column.dataType.type === 'JSON') tags.push('structured_data');

        return tags;
    }

    build(): SchemaGraph {
        return {
            nodes: Array.from(this.nodes.values()),
            edges: this.edges,
            embeddings: this.embeddings,
            metadata: {
                version: '1.0',
                createdAt: new Date().toISOString(),
                sourceSnapshot: 'generated',
                nodeCount: this.nodes.size,
                edgeCount: this.edges.length,
                embeddingModel: 'none'
            }
        };
    }
}

// PII Classifier
export class PIIClassifier {
    private static readonly EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
    private static readonly PHONE_PATTERN = /(\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/;
    private static readonly SSN_PATTERN = /\b\d{3}-?\d{2}-?\d{4}\b/;
    private static readonly CREDIT_CARD_PATTERN = /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/;
    private static readonly IP_PATTERN = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/;

    static classifyColumn(node: SchemaNode, sampleData?: string[]): PIIClassification[] {
        const classifications: PIIClassification[] = [];
        const name = node.name.toLowerCase();

        // Name-based classification
        if (name.includes('email')) {
            classifications.push({
                columnId: node.id,
                confidence: 0.9,
                type: 'email',
                patterns: ['column_name'],
                reasoning: 'Column name contains "email"'
            });
        }

        if (name.includes('phone')) {
            classifications.push({
                columnId: node.id,
                confidence: 0.8,
                type: 'phone',
                patterns: ['column_name'],
                reasoning: 'Column name contains "phone"'
            });
        }

        // Sample data classification
        if (sampleData) {
            const emailMatches = sampleData.filter(val => this.EMAIL_PATTERN.test(val)).length;
            if (emailMatches / sampleData.length > 0.7) {
                classifications.push({
                    columnId: node.id,
                    confidence: 0.95,
                    type: 'email',
                    patterns: ['data_pattern'],
                    reasoning: `${Math.round(emailMatches / sampleData.length * 100)}% of samples match email pattern`
                });
            }

            const phoneMatches = sampleData.filter(val => this.PHONE_PATTERN.test(val)).length;
            if (phoneMatches / sampleData.length > 0.7) {
                classifications.push({
                    columnId: node.id,
                    confidence: 0.9,
                    type: 'phone',
                    patterns: ['data_pattern'],
                    reasoning: `${Math.round(phoneMatches / sampleData.length * 100)}% of samples match phone pattern`
                });
            }
        }

        return classifications;
    }
}

// Workload Analyzer
export class WorkloadAnalyzer {
    static analyzeQueries(queries: string[]): QueryPattern[] {
        const patterns: Map<string, QueryPattern> = new Map();

        for (const query of queries) {
            const template = this.normalizeQuery(query);
            const existing = patterns.get(template);

            if (existing) {
                existing.frequency++;
            } else {
                patterns.set(template, {
                    id: crypto.randomUUID(),
                    template,
                    frequency: 1,
                    avgLatency: 0, // Would need actual execution data
                    tables: this.extractTables(query),
                    columns: this.extractColumns(query),
                    operations: this.extractOperations(query)
                });
            }
        }

        return Array.from(patterns.values());
    }

    private static normalizeQuery(query: string): string {
        return query
            .replace(/\b\d+\b/g, '?') // Replace numbers with placeholders
            .replace(/'[^']*'/g, '?')  // Replace string literals
            .replace(/\s+/g, ' ')      // Normalize whitespace
            .trim()
            .toLowerCase();
    }

    private static extractTables(query: string): string[] {
        const tables: string[] = [];
        const fromMatch = query.match(/from\s+(\w+)/gi);
        const joinMatch = query.match(/join\s+(\w+)/gi);

        if (fromMatch) {
            tables.push(...fromMatch.map(m => m.split(/\s+/)[1]));
        }
        if (joinMatch) {
            tables.push(...joinMatch.map(m => m.split(/\s+/)[1]));
        }

        return [...new Set(tables)];
    }

    private static extractColumns(query: string): string[] {
        const columns: string[] = [];
        // Simplified column extraction - would need proper SQL parser for production
        const selectMatch = query.match(/select\s+(.*?)\s+from/i);
        if (selectMatch) {
            const columnPart = selectMatch[1];
            if (columnPart !== '*') {
                columns.push(...columnPart.split(',').map(c => c.trim()));
            }
        }
        return columns;
    }

    private static extractOperations(query: string): string[] {
        const operations: string[] = [];
        if (query.match(/\bselect\b/i)) operations.push('SELECT');
        if (query.match(/\binsert\b/i)) operations.push('INSERT');
        if (query.match(/\bupdate\b/i)) operations.push('UPDATE');
        if (query.match(/\bdelete\b/i)) operations.push('DELETE');
        if (query.match(/\bjoin\b/i)) operations.push('JOIN');
        if (query.match(/\bgroup\s+by\b/i)) operations.push('GROUP_BY');
        if (query.match(/\border\s+by\b/i)) operations.push('ORDER_BY');
        return operations;
    }
}

export { SchemaGraphBuilder as default };
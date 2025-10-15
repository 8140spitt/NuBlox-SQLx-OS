// Observability package for metrics, traces, and structured logging

// Metrics
export interface Metric {
    name: string;
    type: 'counter' | 'gauge' | 'histogram' | 'summary';
    value: number;
    labels: Record<string, string>;
    timestamp: number;
    help?: string;
}

export interface Counter extends Metric {
    type: 'counter';
    inc(value?: number, labels?: Record<string, string>): void;
}

export interface Gauge extends Metric {
    type: 'gauge';
    set(value: number, labels?: Record<string, string>): void;
    inc(value?: number, labels?: Record<string, string>): void;
    dec(value?: number, labels?: Record<string, string>): void;
}

export interface Histogram extends Metric {
    type: 'histogram';
    buckets: number[];
    observe(value: number, labels?: Record<string, string>): void;
    getSummary(): HistogramSummary;
}

export interface HistogramSummary {
    count: number;
    sum: number;
    buckets: { le: number; count: number }[];
}

// Tracing
export interface Span {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    operationName: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    status: 'ok' | 'error' | 'timeout';
    tags: Record<string, unknown>;
    logs: SpanLog[];
}

export interface SpanLog {
    timestamp: number;
    level: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    fields?: Record<string, unknown>;
}

export interface TraceContext {
    traceId: string;
    spanId: string;
    flags: number;
}

// Logging
export interface LogEntry {
    timestamp: string;
    level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    message: string;
    logger: string;
    traceId?: string;
    spanId?: string;
    fields?: Record<string, unknown>;
    redacted?: string[];
}

// Observable operation context
export interface OperationContext {
    operationId: string;
    operationType: 'connect' | 'exec' | 'plan' | 'apply' | 'learn' | 'snapshot';
    startTime: number;
    sessionId?: string;
    userId?: string;
    databaseUrl?: string;
    sql?: string;
    params?: unknown[];
    metadata?: Record<string, unknown>;
}

// Metrics Registry
export class MetricsRegistry {
    private metrics: Map<string, Metric> = new Map();
    private static instance: MetricsRegistry;

    static getInstance(): MetricsRegistry {
        if (!this.instance) {
            this.instance = new MetricsRegistry();
        }
        return this.instance;
    }

    createCounter(name: string, help?: string, labels?: Record<string, string>): Counter {
        if (this.metrics.has(name)) {
            const existing = this.metrics.get(name);
            if (existing?.type !== 'counter') {
                throw new Error(`Metric ${name} already exists with different type`);
            }
            return existing as Counter;
        }

        const counter: Counter = {
            name,
            type: 'counter',
            value: 0,
            labels: labels || {},
            timestamp: Date.now(),
            help,
            inc(value = 1, labels = {}) {
                this.value += value;
                this.labels = { ...this.labels, ...labels };
                this.timestamp = Date.now();
            }
        };

        this.metrics.set(name, counter);
        return counter;
    }

    createGauge(name: string, help?: string, labels?: Record<string, string>): Gauge {
        if (this.metrics.has(name)) {
            const existing = this.metrics.get(name);
            if (existing?.type !== 'gauge') {
                throw new Error(`Metric ${name} already exists with different type`);
            }
            return existing as Gauge;
        }

        const gauge: Gauge = {
            name,
            type: 'gauge',
            value: 0,
            labels: labels || {},
            timestamp: Date.now(),
            help,
            set(value: number, labels = {}) {
                this.value = value;
                this.labels = { ...this.labels, ...labels };
                this.timestamp = Date.now();
            },
            inc(value = 1, labels = {}) {
                this.value += value;
                this.labels = { ...this.labels, ...labels };
                this.timestamp = Date.now();
            },
            dec(value = 1, labels = {}) {
                this.value -= value;
                this.labels = { ...this.labels, ...labels };
                this.timestamp = Date.now();
            }
        };

        this.metrics.set(name, gauge);
        return gauge;
    }

    createHistogram(name: string, buckets: number[], help?: string, labels?: Record<string, string>): Histogram {
        if (this.metrics.has(name)) {
            const existing = this.metrics.get(name);
            if (existing?.type !== 'histogram') {
                throw new Error(`Metric ${name} already exists with different type`);
            }
            return existing as Histogram;
        }

        const bucketCounts = new Map(buckets.map(b => [b, 0]));
        let count = 0;
        let sum = 0;

        const histogram: Histogram = {
            name,
            type: 'histogram',
            value: 0,
            labels: labels || {},
            timestamp: Date.now(),
            help,
            buckets,
            observe(value: number, labels = {}) {
                count++;
                sum += value;

                for (const bucket of buckets) {
                    if (value <= bucket) {
                        bucketCounts.set(bucket, (bucketCounts.get(bucket) || 0) + 1);
                    }
                }

                this.labels = { ...this.labels, ...labels };
                this.timestamp = Date.now();
            },
            getSummary(): HistogramSummary {
                return {
                    count,
                    sum,
                    buckets: Array.from(bucketCounts.entries()).map(([le, count]) => ({ le, count }))
                };
            }
        };

        this.metrics.set(name, histogram);
        return histogram;
    }

    getMetric(name: string): Metric | undefined {
        return this.metrics.get(name);
    }

    getAllMetrics(): Metric[] {
        return Array.from(this.metrics.values());
    }

    clear(): void {
        this.metrics.clear();
    }
}

// Tracer
export class Tracer {
    private spans: Map<string, Span> = new Map();
    private activeSpans: Map<string, string> = new Map(); // traceId -> spanId
    private static instance: Tracer;

    static getInstance(): Tracer {
        if (!this.instance) {
            this.instance = new Tracer();
        }
        return this.instance;
    }

    startSpan(operationName: string, parentContext?: TraceContext): Span {
        const traceId = parentContext?.traceId || this.generateTraceId();
        const spanId = this.generateSpanId();

        const span: Span = {
            traceId,
            spanId,
            parentSpanId: parentContext?.spanId,
            operationName,
            startTime: Date.now(),
            status: 'ok',
            tags: {},
            logs: []
        };

        this.spans.set(spanId, span);
        this.activeSpans.set(traceId, spanId);

        return span;
    }

    finishSpan(spanId: string, status: 'ok' | 'error' | 'timeout' = 'ok'): void {
        const span = this.spans.get(spanId);
        if (span) {
            span.endTime = Date.now();
            span.duration = span.endTime - span.startTime;
            span.status = status;

            // Remove from active spans if it was active
            for (const [traceId, activeSpanId] of this.activeSpans.entries()) {
                if (activeSpanId === spanId) {
                    this.activeSpans.delete(traceId);
                    break;
                }
            }
        }
    }

    addSpanTag(spanId: string, key: string, value: unknown): void {
        const span = this.spans.get(spanId);
        if (span) {
            span.tags[key] = value;
        }
    }

    addSpanLog(spanId: string, level: 'debug' | 'info' | 'warn' | 'error', message: string, fields?: Record<string, unknown>): void {
        const span = this.spans.get(spanId);
        if (span) {
            span.logs.push({
                timestamp: Date.now(),
                level,
                message,
                fields
            });
        }
    }

    getSpan(spanId: string): Span | undefined {
        return this.spans.get(spanId);
    }

    getActiveSpan(traceId: string): Span | undefined {
        const spanId = this.activeSpans.get(traceId);
        return spanId ? this.spans.get(spanId) : undefined;
    }

    getAllSpans(): Span[] {
        return Array.from(this.spans.values());
    }

    private generateTraceId(): string {
        return crypto.randomUUID().replace(/-/g, '');
    }

    private generateSpanId(): string {
        return crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    }
}

// Logger
export class Logger {
    private logs: LogEntry[] = [];
    private static instance: Logger;
    private redactPatterns: RegExp[] = [
        /password['":\s]*['"]\w+['"]/gi,
        /token['":\s]*['"]\w+['"]/gi,
        /secret['":\s]*['"]\w+['"]/gi,
        /key['":\s]*['"]\w+['"]/gi,
    ];

    static getInstance(): Logger {
        if (!this.instance) {
            this.instance = new Logger();
        }
        return this.instance;
    }

    private log(level: 'debug' | 'info' | 'warn' | 'error' | 'fatal', message: string, fields?: Record<string, unknown>, context?: TraceContext): void {
        const redacted = this.redactSensitiveData(JSON.stringify(fields || {}));
        const redactedFields = JSON.parse(redacted);

        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            logger: 'sqlx',
            traceId: context?.traceId,
            spanId: context?.spanId,
            fields: redactedFields,
            redacted: redacted !== JSON.stringify(fields || {}) ? ['fields'] : undefined
        };

        this.logs.push(entry);

        // Also output to console in development
        if (process.env.NODE_ENV !== 'production') {
            console.log(JSON.stringify(entry, null, 2));
        }
    }

    debug(message: string, fields?: Record<string, unknown>, context?: TraceContext): void {
        this.log('debug', message, fields, context);
    }

    info(message: string, fields?: Record<string, unknown>, context?: TraceContext): void {
        this.log('info', message, fields, context);
    }

    warn(message: string, fields?: Record<string, unknown>, context?: TraceContext): void {
        this.log('warn', message, fields, context);
    }

    error(message: string, fields?: Record<string, unknown>, context?: TraceContext): void {
        this.log('error', message, fields, context);
    }

    fatal(message: string, fields?: Record<string, unknown>, context?: TraceContext): void {
        this.log('fatal', message, fields, context);
    }

    getLogs(): LogEntry[] {
        return [...this.logs];
    }

    clear(): void {
        this.logs = [];
    }

    private redactSensitiveData(data: string): string {
        let redacted = data;
        for (const pattern of this.redactPatterns) {
            redacted = redacted.replace(pattern, '"[REDACTED]"');
        }
        return redacted;
    }
}

// Observable operation wrapper
export class OperationObserver {
    private static tracer = Tracer.getInstance();
    private static metrics = MetricsRegistry.getInstance();
    private static logger = Logger.getInstance();

    static async observeOperation<T>(
        context: OperationContext,
        operation: () => Promise<T>
    ): Promise<T> {
        const span = this.tracer.startSpan(context.operationType);
        const startTime = Date.now();

        // Add operation context to span
        this.tracer.addSpanTag(span.spanId, 'operation.type', context.operationType);
        this.tracer.addSpanTag(span.spanId, 'operation.id', context.operationId);
        if (context.sessionId) this.tracer.addSpanTag(span.spanId, 'session.id', context.sessionId);
        if (context.sql) this.tracer.addSpanTag(span.spanId, 'sql.query', context.sql);

        // Create metrics
        const operationCounter = this.metrics.createCounter(
            'sqlx_operations_total',
            'Total number of SQLx operations'
        );
        const operationDuration = this.metrics.createHistogram(
            'sqlx_operation_duration_ms',
            [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
            'Operation duration in milliseconds'
        );

        this.logger.info('Operation started', {
            operationId: context.operationId,
            operationType: context.operationType,
            sessionId: context.sessionId
        }, { traceId: span.traceId, spanId: span.spanId, flags: 0 });

        try {
            const result = await operation();

            const duration = Date.now() - startTime;

            // Update metrics
            operationCounter.inc(1, {
                operation: context.operationType,
                status: 'success'
            });
            operationDuration.observe(duration, {
                operation: context.operationType,
                status: 'success'
            });

            // Finish span
            this.tracer.addSpanTag(span.spanId, 'operation.duration_ms', duration);
            this.tracer.finishSpan(span.spanId, 'ok');

            this.logger.info('Operation completed', {
                operationId: context.operationId,
                operationType: context.operationType,
                duration,
                status: 'success'
            }, { traceId: span.traceId, spanId: span.spanId, flags: 0 });

            return result;
        } catch (error) {
            const duration = Date.now() - startTime;

            // Update metrics
            operationCounter.inc(1, {
                operation: context.operationType,
                status: 'error'
            });
            operationDuration.observe(duration, {
                operation: context.operationType,
                status: 'error'
            });

            // Add error to span
            this.tracer.addSpanTag(span.spanId, 'error', true);
            this.tracer.addSpanTag(span.spanId, 'error.message', (error as Error).message);
            this.tracer.finishSpan(span.spanId, 'error');

            this.logger.error('Operation failed', {
                operationId: context.operationId,
                operationType: context.operationType,
                duration,
                error: (error as Error).message,
                stack: (error as Error).stack
            }, { traceId: span.traceId, spanId: span.spanId, flags: 0 });

            throw error;
        }
    }
}

// OTLP Exporter (stub)
export class OTLPExporter {
    constructor(private endpoint: string) { }

    async exportMetrics(metrics: Metric[]): Promise<void> {
        // TODO: Implement OTLP metrics export
        console.log(`Exporting ${metrics.length} metrics to ${this.endpoint}`);
    }

    async exportTraces(spans: Span[]): Promise<void> {
        // TODO: Implement OTLP traces export
        console.log(`Exporting ${spans.length} spans to ${this.endpoint}`);
    }

    async exportLogs(logs: LogEntry[]): Promise<void> {
        // TODO: Implement OTLP logs export
        console.log(`Exporting ${logs.length} logs to ${this.endpoint}`);
    }
}

// Prometheus Exporter (stub)
export class PrometheusExporter {
    exportMetrics(metrics: Metric[]): string {
        const lines: string[] = [];

        for (const metric of metrics) {
            if (metric.help) {
                lines.push(`# HELP ${metric.name} ${metric.help}`);
            }
            lines.push(`# TYPE ${metric.name} ${metric.type}`);

            const labelStr = Object.entries(metric.labels)
                .map(([k, v]) => `${k}="${v}"`)
                .join(',');

            if (metric.type === 'histogram') {
                const hist = metric as Histogram;
                const summary = hist.getSummary();

                for (const bucket of summary.buckets) {
                    lines.push(`${metric.name}_bucket{${labelStr},le="${bucket.le}"} ${bucket.count}`);
                }
                lines.push(`${metric.name}_count{${labelStr}} ${summary.count}`);
                lines.push(`${metric.name}_sum{${labelStr}} ${summary.sum}`);
            } else {
                lines.push(`${metric.name}{${labelStr}} ${metric.value}`);
            }
        }

        return lines.join('\n');
    }
}

// Pre-defined metrics
export const METRICS = {
    CONNECTIONS_TOTAL: 'sqlx_connections_total',
    CONNECTIONS_ACTIVE: 'sqlx_connections_active',
    EXEC_DURATION_MS: 'sqlx_exec_duration_ms',
    EXEC_TOTAL: 'sqlx_exec_total',
    ROWS_READ: 'sqlx_rows_read',
    ROWS_WRITTEN: 'sqlx_rows_written',
    CACHE_HITS: 'sqlx_cache_hits',
    CACHE_MISSES: 'sqlx_cache_misses',
    ERRORS_TOTAL: 'sqlx_errors_total',
    PLAN_DURATION_MS: 'sqlx_plan_duration_ms',
    APPLY_DURATION_MS: 'sqlx_apply_duration_ms'
};

// Initialize default metrics
const registry = MetricsRegistry.getInstance();
registry.createCounter(METRICS.CONNECTIONS_TOTAL, 'Total database connections');
registry.createGauge(METRICS.CONNECTIONS_ACTIVE, 'Active database connections');
registry.createHistogram(METRICS.EXEC_DURATION_MS, [1, 5, 10, 25, 50, 100, 250, 500, 1000], 'Execution duration');
registry.createCounter(METRICS.EXEC_TOTAL, 'Total executions');
registry.createCounter(METRICS.ROWS_READ, 'Total rows read');
registry.createCounter(METRICS.ROWS_WRITTEN, 'Total rows written');
registry.createCounter(METRICS.CACHE_HITS, 'Cache hits');
registry.createCounter(METRICS.CACHE_MISSES, 'Cache misses');
registry.createCounter(METRICS.ERRORS_TOTAL, 'Total errors');
registry.createHistogram(METRICS.PLAN_DURATION_MS, [10, 50, 100, 500, 1000, 5000], 'Plan duration');
registry.createHistogram(METRICS.APPLY_DURATION_MS, [100, 500, 1000, 5000, 10000, 30000], 'Apply duration');
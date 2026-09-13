import { createId } from './id';

/**
 * Structured diagnostic logger (BACK02).
 *
 * Level-filtered console output plus an in-memory ring buffer that can be
 * exported as a diagnostics blob for bug reports. Replaces ad-hoc
 * console.warn/console.log calls across engine, persistence, and workers.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogRecord {
  seq: number;
  atIso: string;
  level: LogLevel;
  scope: string;
  message: string;
  data?: unknown;
  /** Session correlation id (iteration 3, BACK10). */
  session: string;
}

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MAX_RECORDS = 512;

class Logger {
  private records: LogRecord[] = [];
  private seq = 0;
  private readonly sessionId: string = createId('session');
  public minLevel: LogLevel = 'debug';

  /** Stable id correlating every record and export from this page load. */
  public getSessionId(): string {
    return this.sessionId;
  }

  private emit(level: LogLevel, scope: string, message: string, data?: unknown): void {
    const record: LogRecord = {
      seq: ++this.seq,
      atIso: new Date().toISOString(),
      level,
      scope,
      message,
      data,
      session: this.sessionId,
    };
    this.records.push(record);
    if (this.records.length > MAX_RECORDS) {
      this.records.splice(0, this.records.length - MAX_RECORDS);
    }
    if (LEVEL_RANK[level] < LEVEL_RANK[this.minLevel]) return;
    const prefix = `[${scope}] ${message}`;
    if (level === 'error') console.error(prefix, data ?? '');
    else if (level === 'warn') console.warn(prefix, data ?? '');
    else if (level === 'debug') console.debug(prefix, data ?? '');
    else console.log(prefix, data ?? '');
  }

  public debug(scope: string, message: string, data?: unknown): void {
    this.emit('debug', scope, message, data);
  }
  public info(scope: string, message: string, data?: unknown): void {
    this.emit('info', scope, message, data);
  }
  public warn(scope: string, message: string, data?: unknown): void {
    this.emit('warn', scope, message, data);
  }
  public error(scope: string, message: string, data?: unknown): void {
    this.emit('error', scope, message, data);
  }

  /** Snapshot the buffered records (oldest first). */
  public drain(): LogRecord[] {
    return [...this.records];
  }

  /** Export diagnostics as downloadable JSON text. */
  public exportDiagnostics(extra?: Record<string, unknown>): string {
    return JSON.stringify(
      {
        exportedAtIso: new Date().toISOString(),
        sessionId: this.sessionId,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        ...extra,
        records: this.records,
      },
      null,
      2
    );
  }

  public clear(): void {
    this.records = [];
  }
}

export const logger = new Logger();

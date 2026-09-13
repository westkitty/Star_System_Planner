/**
 * Structured error taxonomy (BACK07).
 *
 * Every recoverable failure carries a stable machine code plus a
 * human-safe message. The root error boundary renders the code so bug
 * reports can pinpoint the failing subsystem without a stack trace.
 */

export type PlannerErrorCode =
  | 'PERSIST_READ'
  | 'PERSIST_WRITE'
  | 'PERSIST_MIGRATE'
  | 'PERSIST_VALIDATE'
  | 'IMPORT_PARSE'
  | 'IMPORT_SCHEMA'
  | 'RENDER_INIT'
  | 'RENDER_FRAME'
  | 'PHYSICS_NAN'
  | 'FORECAST_WORKER'
  | 'AUDIO_INIT'
  | 'UNKNOWN';

export class PlannerError extends Error {
  public readonly code: PlannerErrorCode;
  public readonly userMessage: string;
  public readonly detail?: string;

  constructor(code: PlannerErrorCode, userMessage: string, detail?: string) {
    super(`[${code}] ${userMessage}${detail ? ` — ${detail}` : ''}`);
    this.name = 'PlannerError';
    this.code = code;
    this.userMessage = userMessage;
    this.detail = detail;
  }
}

/** Extract a safe display message from anything thrown. */
export function toUserMessage(err: unknown): string {
  if (err instanceof PlannerError) return err.userMessage;
  if (err instanceof Error) return err.message || 'Unexpected error';
  return 'Unexpected error';
}

/** Extract the subsystem code from anything thrown. */
export function toErrorCode(err: unknown): PlannerErrorCode {
  if (err instanceof PlannerError) return err.code;
  return 'UNKNOWN';
}

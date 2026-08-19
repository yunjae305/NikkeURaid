export type ErrorCode =
  | "bad_request"
  | "method_not_allowed"
  | "internal_unauthorized"
  | "configuration_error"
  | "rate_limited"
  | "sync_not_claimed"
  | "upstream_auth_required"
  | "upstream_permission_denied"
  | "upstream_timeout"
  | "upstream_http_error"
  | "upstream_invalid_json"
  | "upstream_schema_changed"
  | "database_error"
  | "internal_invoke_failed"
  | "internal_error";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly authRequired: boolean;
  readonly safeContext: string | null;

  constructor(options: {
    code: ErrorCode;
    message: string;
    httpStatus?: number;
    retryable?: boolean;
    authRequired?: boolean;
    safeContext?: string | null;
  }) {
    super(options.message);
    this.name = "AppError";
    this.code = options.code;
    this.httpStatus = options.httpStatus ?? 500;
    this.retryable = options.retryable ?? false;
    this.authRequired = options.authRequired ?? false;
    this.safeContext = options.safeContext ?? null;
  }
}

export class SchemaError extends AppError {
  constructor(path: string) {
    super({
      code: "upstream_schema_changed",
      message: "BlablaLink response schema is not supported",
      httpStatus: 502,
      retryable: false,
      safeContext: normalizePath(path),
    });
    this.name = "SchemaError";
  }
}

export function badRequest(message = "Invalid request"): AppError {
  return new AppError({ code: "bad_request", message, httpStatus: 400 });
}

export function configurationError(variable: string): AppError {
  return new AppError({
    code: "configuration_error",
    message: "Server collection configuration is incomplete",
    httpStatus: 503,
    safeContext: normalizeEnvironmentName(variable),
  });
}

export function databaseError(operation: string): AppError {
  return new AppError({
    code: "database_error",
    message: "The collection database operation failed",
    httpStatus: 503,
    retryable: true,
    safeContext: normalizeOperation(operation),
  });
}

export function syncNotClaimed(): AppError {
  return new AppError({
    code: "sync_not_claimed",
    message:
      "This guild is already being collected or is not currently eligible",
    httpStatus: 409,
    retryable: true,
  });
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof TypeError) return badRequest();
  return new AppError({
    code: "internal_error",
    message: "An unexpected server error occurred",
    httpStatus: 500,
    retryable: true,
  });
}

export function safeFailureNote(error: AppError): string {
  const suffix = error.safeContext ? `:${error.safeContext}` : "";
  return `${error.code}${suffix}`
    .replace(/[^A-Za-z0-9_./: -]/g, "_")
    .slice(0, 240);
}

export function safeErrorBody(
  error: AppError,
  requestId: string,
): Record<string, unknown> {
  return {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      request_id: requestId,
    },
  };
}

function normalizePath(path: string): string {
  const safe = path.replace(/[^a-zA-Z0-9_.\[\]-]/g, "");
  return safe.slice(0, 160) || "response";
}

function normalizeEnvironmentName(name: string): string {
  const allowed = new Set([
    "BLABLA_COOKIE",
    "INTERNAL_SYNC_SECRET",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_ANON_KEY",
  ]);
  return allowed.has(name) ? name : "environment";
}

function normalizeOperation(operation: string): string {
  const safe = operation.replace(/[^a-z0-9_]/gi, "");
  return safe.slice(0, 80) || "operation";
}

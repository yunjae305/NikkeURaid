import {
  AppError,
  badRequest,
  configurationError,
  safeErrorBody,
  toAppError,
} from "./errors.ts";
import { requiredEnvironment } from "./runtime.ts";

const JSON_HEADERS = {
  "access-control-allow-headers":
    "authorization, apikey, content-type, x-client-info, x-internal-sync-secret, x-collect-wait, x-sync-trigger",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-origin": "*",
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export function optionsResponse(): Response {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

export function requirePost(request: Request): void {
  if (request.method !== "POST") {
    throw new AppError({
      code: "method_not_allowed",
      message: "Only POST is supported",
      httpStatus: 405,
    });
  }
}

export async function readJsonBody(
  request: Request,
  allowEmpty = false,
): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > 8_192) {
    throw badRequest("Request body is too large");
  }
  let text: string;
  try {
    text = await request.text();
  } catch {
    throw badRequest("Request body could not be read");
  }
  if (text.length > 8_192) throw badRequest("Request body is too large");
  if (!text.trim()) {
    if (allowEmpty) return {};
    throw badRequest("Request body must be JSON");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
}

export function requireInternalAuthorization(request: Request): void {
  const expected = requiredEnvironment("INTERNAL_SYNC_SECRET");
  const supplied = request.headers.get("x-internal-sync-secret") ?? "";
  if (!constantTimeEqual(supplied, expected)) {
    throw new AppError({
      code: "internal_unauthorized",
      message: "Internal authorization failed",
      httpStatus: 401,
    });
  }
}

export function requireServiceRoleAuthorization(request: Request): void {
  const expected = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  const header = request.headers.get("authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!constantTimeEqual(supplied, expected)) {
    throw new AppError({
      code: "internal_unauthorized",
      message: "Server authorization failed",
      httpStatus: 401,
    });
  }
}

export function errorResponse(error: unknown, requestId: string): Response {
  const appError = toAppError(error);
  logSafeError(appError, requestId);
  return jsonResponse(safeErrorBody(appError, requestId), appError.httpStatus);
}

export function logSafeError(error: AppError, requestId: string): void {
  console.error(JSON.stringify({
    event: "edge_function_error",
    request_id: requestId,
    code: error.code,
    context: error.safeContext,
  }));
}

export function createRequestId(): string {
  return crypto.randomUUID();
}

export function ensureConfiguredUrl(value: string, variable: string): string {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" && url.hostname !== "127.0.0.1" &&
      url.hostname !== "localhost"
    ) {
      throw new TypeError("unsupported protocol");
    }
    return url.origin;
  } catch {
    throw configurationError(variable);
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^
      (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

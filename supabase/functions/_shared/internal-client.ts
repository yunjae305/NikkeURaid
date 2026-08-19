import type { CollectRequest, SyncTrigger } from "./contracts.ts";
import { AppError } from "./errors.ts";
import { ensureConfiguredUrl } from "./http.ts";

interface InternalClientOptions {
  supabaseUrl: string;
  anonKey: string;
  internalSecret: string;
  fetchImpl?: typeof fetch;
}

export interface InternalInvokeResult {
  status: number;
  accepted: boolean;
  alreadyClaimed: boolean;
  errorCode: "upstream_auth_required" | "upstream_permission_denied" | null;
}

export function collectInvocationError(
  result: InternalInvokeResult,
): AppError | null {
  if (result.accepted || result.alreadyClaimed) return null;

  if (result.errorCode === "upstream_auth_required") {
    return new AppError({
      code: "upstream_auth_required",
      message: "The BlablaLink session must be refreshed",
      httpStatus: 503,
      retryable: true,
      authRequired: true,
      safeContext: "guild_collection",
    });
  }

  if (
    result.errorCode === "upstream_permission_denied" || result.status === 403
  ) {
    return new AppError({
      code: "upstream_permission_denied",
      message: "BlablaLink denied access to this guild",
      httpStatus: 403,
      retryable: false,
      safeContext: "guild_collection",
    });
  }

  return new AppError({
    code: "internal_invoke_failed",
    message: "The collector could not be started",
    httpStatus: 503,
    retryable: true,
    safeContext: `collect_status_${result.status}`,
  });
}

export class InternalFunctionClient {
  readonly #baseUrl: string;
  readonly #anonKey: string;
  readonly #internalSecret: string;
  readonly #fetch: typeof fetch;

  constructor(options: InternalClientOptions) {
    this.#baseUrl = ensureConfiguredUrl(options.supabaseUrl, "SUPABASE_URL");
    this.#anonKey = options.anonKey;
    this.#internalSecret = options.internalSecret;
    this.#fetch = options.fetchImpl ?? fetch;
  }

  async invokeCollect(
    request: CollectRequest,
    waitForCompletion: boolean,
    trigger: SyncTrigger,
  ): Promise<InternalInvokeResult> {
    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}/functions/v1/collect`, {
        method: "POST",
        headers: {
          apikey: this.#anonKey,
          authorization: `Bearer ${this.#anonKey}`,
          "content-type": "application/json",
          "x-collect-wait": waitForCompletion ? "1" : "0",
          "x-internal-sync-secret": this.#internalSecret,
          "x-sync-trigger": trigger,
        },
        body: JSON.stringify(request),
      });
    } catch {
      throw new AppError({
        code: "internal_invoke_failed",
        message: "The collector could not be started",
        httpStatus: 503,
        retryable: true,
        safeContext: "collect_network",
      });
    }
    const accepted = response.status === 200 || response.status === 202;
    const alreadyClaimed = response.status === 409;
    const errorCode = accepted || alreadyClaimed
      ? null
      : await readForwardableErrorCode(response);

    return {
      status: response.status,
      accepted,
      alreadyClaimed,
      errorCode,
    };
  }
}

async function readForwardableErrorCode(
  response: Response,
): Promise<InternalInvokeResult["errorCode"]> {
  try {
    const text = await response.text();
    if (text.length > 8_192) return null;
    const body = JSON.parse(text) as unknown;
    if (!body || typeof body !== "object" || !("error" in body)) return null;
    const error = body.error;
    if (!error || typeof error !== "object" || !("code" in error)) return null;
    return error.code === "upstream_auth_required" ||
        error.code === "upstream_permission_denied"
      ? error.code
      : null;
  } catch {
    return null;
  }
}

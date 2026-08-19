import { BlablaApiClient } from "../_shared/api-client.ts";
import { collectGuild } from "../_shared/collect-service.ts";
import { parseCollectRequest, type SyncTrigger } from "../_shared/contracts.ts";
import { createSyncDatabase, type SyncDatabase } from "../_shared/db.ts";
import { AppError, toAppError } from "../_shared/errors.ts";
import {
  createRequestId,
  errorResponse,
  jsonResponse,
  logSafeError,
  optionsResponse,
  readJsonBody,
  requireInternalAuthorization,
  requirePost,
} from "../_shared/http.ts";
import { defer, requiredEnvironment, serve } from "../_shared/runtime.ts";

let cachedDatabase: SyncDatabase | undefined;
let cachedApi: BlablaApiClient | undefined;

serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse();
  const requestId = createRequestId();
  try {
    requirePost(request);
    requireInternalAuthorization(request);
    const input = parseCollectRequest(await readJsonBody(request));
    const trigger = parseTrigger(request.headers.get("x-sync-trigger"));
    const database = cachedDatabase ??= createSyncDatabase();
    const claimed = await database.claimGuildSync(
      input.area_id,
      input.guild_id,
      input.claim_token,
      trigger,
    );
    if (!claimed) {
      throw new AppError({
        code: "sync_not_claimed",
        message:
          "This guild is already being collected or is not currently eligible",
        httpStatus: 409,
        retryable: true,
      });
    }

    let api: BlablaApiClient;
    try {
      api = cachedApi ??= new BlablaApiClient({
        cookie: requiredEnvironment("BLABLA_COOKIE"),
      });
    } catch {
      const authError = new AppError({
        code: "upstream_auth_required",
        message: "BlablaLink session must be refreshed",
        httpStatus: 503,
        authRequired: true,
        safeContext: "cookie_missing",
      });
      try {
        await database.failGuildSync({
          areaId: input.area_id,
          guildId: input.guild_id,
          claimToken: input.claim_token,
          errorCode: authError.code,
          safeNote: "upstream_auth_required:cookie_missing",
          durationMs: 0,
          authRequired: true,
        });
      } catch {
        // The database adapter emits only its fixed operation name on failure.
      }
      throw authError;
    }
    const work = collectGuild({
      database,
      api,
      target: {
        areaId: input.area_id,
        guildId: input.guild_id,
        claimToken: input.claim_token,
      },
      alreadyClaimed: true,
    });

    const waitForCompletion = request.headers.get("x-collect-wait") === "1";
    if (!waitForCompletion) {
      const background = work.then(() => undefined).catch((error: unknown) => {
        logSafeError(toAppError(error), requestId);
      });
      if (defer(background)) {
        return jsonResponse({
          ok: true,
          sync_state: "syncing",
          request_id: requestId,
        }, 202);
      }
    }

    const result = await work;
    return jsonResponse({
      ok: result.applied,
      sync_state: result.applied ? "ok" : "syncing",
      current_season: result.currentSeason,
      live_attack_count: result.liveAttackCount,
      settled_attack_count: result.settledAttackCount,
      roster_state: result.rosterState,
      member_count: result.memberCount,
      duration_ms: result.durationMs,
      request_id: requestId,
    }, result.applied ? 200 : 409);
  } catch (error) {
    return errorResponse(error, requestId);
  }
});

function parseTrigger(value: string | null): SyncTrigger {
  if (value === "on_demand" || value === "cron") return value;
  throw new TypeError("x-sync-trigger must be on_demand or cron");
}

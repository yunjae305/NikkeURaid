import { parseSyncRequest } from "../_shared/contracts.ts";
import { createSyncDatabase } from "../_shared/db.ts";
import { AppError } from "../_shared/errors.ts";
import {
  createRequestId,
  errorResponse,
  jsonResponse,
  optionsResponse,
  readJsonBody,
  requirePost,
  requireServiceRoleAuthorization,
} from "../_shared/http.ts";
import {
  collectInvocationError,
  InternalFunctionClient,
} from "../_shared/internal-client.ts";
import { requiredEnvironment, serve } from "../_shared/runtime.ts";

serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse();
  const requestId = createRequestId();
  try {
    requirePost(request);
    // The public browser calls the same-origin Next.js route. Only that server,
    // using its service role, may enqueue collection work here.
    requireServiceRoleAuthorization(request);
    const input = parseSyncRequest(await readJsonBody(request));
    const database = createSyncDatabase();
    const registered = await database.registerOrTouchGuild(
      input.area_id,
      input.guild_id,
    );
    if (registered.rate_limited) {
      throw new AppError({
        code: "rate_limited",
        message: "Too many new guilds were requested. Please try again later",
        httpStatus: 429,
        retryable: true,
        safeContext: "new_guild_registration",
      });
    }

    let syncState = registered.sync_state;
    let started = false;
    if (registered.should_collect) {
      const internal = new InternalFunctionClient({
        supabaseUrl: requiredEnvironment("SUPABASE_URL"),
        anonKey: requiredEnvironment("SUPABASE_ANON_KEY"),
        internalSecret: requiredEnvironment("INTERNAL_SYNC_SECRET"),
      });
      const invoked = await internal.invokeCollect(
        {
          area_id: input.area_id,
          guild_id: input.guild_id,
          claim_token: crypto.randomUUID(),
        },
        true,
        "on_demand",
      );
      const invocationError = collectInvocationError(invoked);
      if (invocationError) throw invocationError;
      started = invoked.accepted;
      syncState = invoked.status === 200 ? "ok" : "syncing";
    }

    const queued = syncState === "pending" || syncState === "syncing";
    return jsonResponse({
      ok: true,
      sync_state: syncState,
      roster_state: registered.roster_state,
      collection_started: started,
      request_id: requestId,
    }, queued ? 202 : 200);
  } catch (error) {
    return errorResponse(error, requestId);
  }
});

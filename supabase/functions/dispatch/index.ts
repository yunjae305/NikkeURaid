import { parseDispatchRequest } from "../_shared/contracts.ts";
import { createSyncDatabase } from "../_shared/db.ts";
import {
  createRequestId,
  errorResponse,
  jsonResponse,
  optionsResponse,
  readJsonBody,
  requireInternalAuthorization,
  requirePost,
} from "../_shared/http.ts";
import { InternalFunctionClient } from "../_shared/internal-client.ts";
import { requiredEnvironment, serve } from "../_shared/runtime.ts";

serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse();
  const requestId = createRequestId();
  try {
    requirePost(request);
    requireInternalAuthorization(request);
    const input = parseDispatchRequest(await readJsonBody(request, true));
    const database = createSyncDatabase();
    const candidates = await database.nextSyncBatch(input.limit);
    const internal = new InternalFunctionClient({
      supabaseUrl: requiredEnvironment("SUPABASE_URL"),
      anonKey: requiredEnvironment("SUPABASE_ANON_KEY"),
      internalSecret: requiredEnvironment("INTERNAL_SYNC_SECRET"),
    });

    let completed = 0;
    let skipped = 0;
    let failed = 0;
    // Keep calls sequential. The account is shared, so a burst of concurrent
    // BlablaLink requests is both unnecessary and more likely to be throttled.
    for (const candidate of candidates) {
      try {
        const result = await internal.invokeCollect(
          {
            area_id: candidate.area_id,
            guild_id: candidate.guild_id,
            claim_token: crypto.randomUUID(),
          },
          true,
          "cron",
        );
        if (result.accepted) completed += 1;
        else if (result.alreadyClaimed) skipped += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }

    return jsonResponse({
      ok: failed === 0,
      candidates: candidates.length,
      completed,
      skipped,
      failed,
      request_id: requestId,
    }, failed === 0 ? 200 : 207);
  } catch (error) {
    return errorResponse(error, requestId);
  }
});

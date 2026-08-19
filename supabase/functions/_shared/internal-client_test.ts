import { AppError } from "./errors.ts";
import {
  collectInvocationError,
  InternalFunctionClient,
} from "./internal-client.ts";
import { assert, assertEquals, test } from "./test-utils.ts";

function createClient(response: Response): InternalFunctionClient {
  return new InternalFunctionClient({
    supabaseUrl: "https://example.supabase.co",
    anonKey: "anon-test-key",
    internalSecret: "internal-test-secret",
    fetchImpl: () => Promise.resolve(response),
  });
}

test("preserves a safe collector auth-required code", async () => {
  const client = createClient(
    new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: "upstream_auth_required",
          message: "ignored raw message",
        },
      }),
      { status: 503 },
    ),
  );

  const result = await client.invokeCollect(
    { area_id: 83, guild_id: "28517", claim_token: crypto.randomUUID() },
    true,
    "on_demand",
  );
  const error = collectInvocationError(result);

  assertEquals(result.errorCode, "upstream_auth_required");
  assert(error instanceof AppError);
  assertEquals(error?.code, "upstream_auth_required");
  assertEquals(error?.httpStatus, 503);
  assertEquals(error?.authRequired, true);
});

test("maps a collector permission failure without trusting its message", async () => {
  const client = createClient(
    new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: "upstream_permission_denied",
          message: "private upstream body",
        },
      }),
      { status: 403 },
    ),
  );

  const result = await client.invokeCollect(
    { area_id: 83, guild_id: "99999", claim_token: crypto.randomUUID() },
    true,
    "on_demand",
  );
  const error = collectInvocationError(result);

  assertEquals(result.errorCode, "upstream_permission_denied");
  assert(error instanceof AppError);
  assertEquals(error?.code, "upstream_permission_denied");
  assertEquals(error?.httpStatus, 403);
  assertEquals(error?.message, "BlablaLink denied access to this guild");
});

test("ignores unknown collector error bodies", async () => {
  const client = createClient(
    new Response(
      JSON.stringify({
        error: { code: "unexpected_private_code", message: "must not escape" },
      }),
      { status: 418 },
    ),
  );

  const result = await client.invokeCollect(
    { area_id: 83, guild_id: "28517", claim_token: crypto.randomUUID() },
    true,
    "on_demand",
  );
  const error = collectInvocationError(result);

  assertEquals(result.errorCode, null);
  assertEquals(error?.code, "internal_invoke_failed");
  assertEquals(error?.safeContext, "collect_status_418");
});

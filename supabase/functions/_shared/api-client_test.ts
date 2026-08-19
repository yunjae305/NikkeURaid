import { BlablaApiClient } from "./api-client.ts";
import { AppError, safeErrorBody } from "./errors.ts";
import { assert, assertEquals, assertRejects, test } from "./test-utils.ts";

test("sends the service cookie only to the fixed BlablaLink origin and caches intl_openid", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = new BlablaApiClient({
    cookie: "session=private",
    minIntervalMs: 0,
    now: () => 100,
    fetchImpl: async (input, init) => {
      calls.push({ url: String(input), init });
      return Response.json({
        code: 0,
        data: { info: { intl_openid: "29080-open_1" } },
      });
    },
  });
  assertEquals(await client.getIntlOpenId(), "open_1");
  assertEquals(await client.getIntlOpenId(), "open_1");
  assertEquals(calls.length, 1);
  assert(calls[0].url.startsWith("https://api.blablalink.com/"));
  assertEquals(
    new Headers(calls[0].init?.headers).get("cookie"),
    "session=private",
  );
});

test("maps confirmed foreign-guild API codes to a permission error", async () => {
  const client = new BlablaApiClient({
    cookie: "session=private",
    minIntervalMs: 0,
    fetchImpl: async () =>
      Response.json({ code: 1303027, message: "raw message" }),
  });
  await assertRejects(
    () => client.getGuildMembers(83, "123"),
    (error) =>
      error instanceof AppError && error.code === "upstream_permission_denied",
  );
});

test("maps API code 300001 to immediate session refresh on every endpoint", async () => {
  const client = new BlablaApiClient({
    cookie: "game_token=invalid",
    minIntervalMs: 0,
    fetchImpl: async () => Response.json({ code: 300001 }),
  });
  await assertRejects(
    () => client.getGuildMembers(83, "28517"),
    (error) =>
      error instanceof AppError &&
      error.code === "upstream_auth_required" &&
      error.authRequired,
  );
});

test("never includes a thrown transport body or cookie in its safe error", async () => {
  const cookie = "session=DO_NOT_LEAK";
  const client = new BlablaApiClient({
    cookie,
    minIntervalMs: 0,
    fetchImpl: async () => {
      throw new Error(`transport included ${cookie}`);
    },
  });
  await assertRejects(
    () => client.getGuildMembers(83, "28517"),
    (error) => {
      assert(error instanceof AppError);
      const serialized = JSON.stringify(safeErrorBody(error, "request-id"));
      return !serialized.includes("DO_NOT_LEAK") &&
        error.code === "upstream_http_error";
    },
  );
});

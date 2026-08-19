import {
  parseCollectRequest,
  parseDispatchRequest,
  parseSyncRequest,
} from "./contracts.ts";
import { assertEquals, assertRejects, test } from "./test-utils.ts";

test("parses supported sync and collect requests", () => {
  assertEquals(parseSyncRequest({ area_id: 83, guild_id: "28517" }), {
    area_id: 83,
    guild_id: "28517",
  });
  assertEquals(
    parseCollectRequest({
      area_id: 83,
      guild_id: "28517",
      claim_token: "7aa31c35-71b6-4c89-a785-5ece79d08f91",
    }),
    {
      area_id: 83,
      guild_id: "28517",
      claim_token: "7aa31c35-71b6-4c89-a785-5ece79d08f91",
    },
  );
});

test("rejects unknown request keys and out-of-range dispatch limits", async () => {
  await assertRejects(
    () =>
      parseSyncRequest({ area_id: 83, guild_id: "28517", cookie: "secret" }),
    (error) => error instanceof TypeError,
  );
  await assertRejects(
    () => parseDispatchRequest({ limit: 21 }),
    (error) => error instanceof TypeError,
  );
  assertEquals(parseDispatchRequest({}), { limit: 20 });
});

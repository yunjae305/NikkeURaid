import { describe, expect, it, vi } from "vitest";

import {
  GuildLookupRequestError,
  requestGuildLookup,
} from "./guild-lookup-client";

describe("requestGuildLookup", () => {
  it("posts the request-sync contract and keeps navigation same-origin", async () => {
    const fetcher = vi.fn(
      async (
        input: Parameters<typeof globalThis.fetch>[0],
        init?: Parameters<typeof globalThis.fetch>[1],
      ) => {
        void input;
        void init;
        return Response.json(
          {
            href: "https://attacker.invalid/redirect",
            syncState: "pending",
          },
          { status: 202 },
        );
      },
    );

    await expect(
      requestGuildLookup(83, "28517", fetcher as typeof globalThis.fetch),
    ).resolves.toEqual({
      href: "/u/83/28517",
      syncState: "pending",
    });

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("/api/guilds/lookup");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      area_id: 83,
      guild_id: "28517",
    });
  });

  it("surfaces a safe API error message", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ error: "요청이 너무 많습니다." }, { status: 429 }),
    );

    await expect(
      requestGuildLookup(83, "28517", fetcher as typeof globalThis.fetch),
    ).rejects.toEqual(
      new GuildLookupRequestError("요청이 너무 많습니다."),
    );
  });

  it("rejects a malformed success response", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ accepted: true }, { status: 202 }),
    );

    await expect(
      requestGuildLookup(83, "28517", fetcher as typeof globalThis.fetch),
    ).rejects.toBeInstanceOf(GuildLookupRequestError);
  });
});

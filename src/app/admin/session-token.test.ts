import { describe, expect, it } from "vitest";

import {
  ADMIN_SESSION_TTL_SECONDS,
  createAdminSessionToken,
  verifyAdminSessionToken,
} from "./session-token";

const SECRET = "test-secret-that-is-longer-than-thirty-two-characters";
const NOW = 1_800_000_000_000;
const NONCE = "abcdefghijklmnopqrstuv";

describe("admin session token", () => {
  it("accepts a signed token during its lifetime", () => {
    const token = createAdminSessionToken(SECRET, NOW, NONCE);

    expect(verifyAdminSessionToken(token, SECRET, NOW + 1_000)).toBe(true);
  });

  it("rejects a token after its eight-hour lifetime", () => {
    const token = createAdminSessionToken(SECRET, NOW, NONCE);
    const expiredAt = NOW + ADMIN_SESSION_TTL_SECONDS * 1_000;

    expect(verifyAdminSessionToken(token, SECRET, expiredAt)).toBe(false);
  });

  it("rejects a token whose payload was changed", () => {
    const token = createAdminSessionToken(SECRET, NOW, NONCE);
    const tampered = token.replace(NONCE, "vvvvvvvvvvvvvvvvvvvvvv");

    expect(verifyAdminSessionToken(tampered, SECRET, NOW + 1_000)).toBe(false);
  });

  it("rejects a token signed with another secret", () => {
    const token = createAdminSessionToken(SECRET, NOW, NONCE);

    expect(
      verifyAdminSessionToken(
        token,
        "different-secret-that-is-also-long-enough-for-testing",
        NOW + 1_000,
      ),
    ).toBe(false);
  });
});

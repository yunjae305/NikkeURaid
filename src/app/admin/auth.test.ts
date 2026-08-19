import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAdminSessionToken } from "./session-token";

const cookieStore = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore),
}));

import {
  ADMIN_COOKIE_NAME,
  getAdminConfiguration,
  hasValidAdminSession,
  setAdminSession,
  verifyAdminPassword,
} from "./auth";

const PASSWORD = "correct-horse-battery-staple";
const SECRET = "admin-test-secret-with-more-than-thirty-two-bytes";

function readyConfiguration() {
  vi.stubEnv("ADMIN_PASSWORD", PASSWORD);
  vi.stubEnv("ADMIN_SESSION_SECRET", SECRET);
  const configuration = getAdminConfiguration();
  if (configuration.state !== "ready") throw new Error("test configuration failed");
  return configuration;
}

describe("admin authentication", () => {
  beforeEach(() => {
    cookieStore.get.mockReset();
    cookieStore.set.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps the login closed when server secrets are missing", () => {
    vi.stubEnv("ADMIN_PASSWORD", "");
    vi.stubEnv("ADMIN_SESSION_SECRET", "");

    const configuration = getAdminConfiguration();

    expect(configuration.state).toBe("invalid");
    if (configuration.state === "invalid") {
      expect(configuration.issues).toHaveLength(2);
    }
  });

  it("compares the configured password without accepting a near match", () => {
    const configuration = readyConfiguration();

    expect(verifyAdminPassword(PASSWORD, configuration)).toBe(true);
    expect(verifyAdminPassword(`${PASSWORD}!`, configuration)).toBe(false);
  });

  it("accepts only a cookie signed by the configured secret", async () => {
    const configuration = readyConfiguration();
    cookieStore.get.mockReturnValue({
      value: createAdminSessionToken(configuration.secret),
    });

    await expect(hasValidAdminSession(configuration)).resolves.toBe(true);

    cookieStore.get.mockReturnValue({
      value: createAdminSessionToken("another-secret-long-enough-for-the-token"),
    });
    await expect(hasValidAdminSession(configuration)).resolves.toBe(false);
  });

  it("sets an HttpOnly cookie scoped to the admin route", async () => {
    const configuration = readyConfiguration();

    await setAdminSession(configuration);

    expect(cookieStore.set).toHaveBeenCalledWith(
      expect.objectContaining({
        name: ADMIN_COOKIE_NAME,
        httpOnly: true,
        maxAge: 28_800,
        path: "/admin",
        sameSite: "strict",
      }),
    );
    expect(cookieStore.set.mock.calls[0]?.[0].value).not.toContain(PASSWORD);
  });
});

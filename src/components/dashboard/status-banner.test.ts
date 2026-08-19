import { describe, expect, it } from "vitest";

import { getStatusBannerKind } from "./status-banner";

describe("dashboard status banner priority", () => {
  it("shows collection state ahead of the mock-data notice", () => {
    expect(getStatusBannerKind({ source: "mock", status: "syncing" })).toBe("syncing");
  });

  it("shows authentication and dead-state warnings ahead of the mock notice", () => {
    expect(getStatusBannerKind({ source: "mock", status: "auth-required" })).toBe("warning");
    expect(getStatusBannerKind({ source: "mock", status: "dead" })).toBe("warning");
  });

  it("shows the preview notice only for a ready mock dashboard", () => {
    expect(getStatusBannerKind({ source: "mock", status: "ready" })).toBe("preview");
    expect(getStatusBannerKind({ source: "supabase", status: "ready" })).toBe("none");
  });
});

import { describe, expect, it } from "vitest";

import {
  buildContentSecurityPolicy,
  createSecurityHeaders,
} from "./security-headers";

describe("security headers", () => {
  it("allows only the configured Supabase and asset origins in production", () => {
    const policy = buildContentSecurityPolicy({
      assetBaseUrl: "https://cdn.jsdelivr.net/gh/example/assets",
      isDevelopment: false,
      supabaseUrl: "https://example.supabase.co/rest/v1",
    });

    expect(policy).toContain("connect-src 'self' https://example.supabase.co");
    expect(policy).toContain(
      "img-src 'self' data: blob: https://cdn.jsdelivr.net",
    );
    expect(policy).toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).toContain("upgrade-insecure-requests");
  });

  it("keeps local hot reload support out of the production policy", () => {
    const development = buildContentSecurityPolicy({
      isDevelopment: true,
    });

    expect(development).toContain("'unsafe-eval'");
    expect(development).toContain("connect-src 'self' ws: wss:");
    expect(development).not.toContain("upgrade-insecure-requests");
  });

  it("does not reflect malformed or non-http origins", () => {
    const policy = buildContentSecurityPolicy({
      assetBaseUrl: "javascript:alert(1)",
      isDevelopment: false,
      supabaseUrl: "not a url; script-src *",
    });

    expect(policy).not.toContain("javascript:");
    expect(policy).not.toContain("script-src *");
    expect(policy).toContain("https://cdn.jsdelivr.net");
  });

  it("sets the browser hardening headers on every route", () => {
    const headers = new Map(
      createSecurityHeaders({ isDevelopment: false }).map((header) => [
        header.key,
        header.value,
      ]),
    );

    expect(headers.get("Content-Security-Policy")).toBeTruthy();
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
  });
});

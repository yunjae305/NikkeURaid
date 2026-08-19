import { afterEach, describe, expect, it } from "vitest";

import { assetUrl } from "./assets";

const originalBase = process.env.NEXT_PUBLIC_ASSET_BASE_URL;

afterEach(() => {
  if (originalBase === undefined) {
    delete process.env.NEXT_PUBLIC_ASSET_BASE_URL;
  } else {
    process.env.NEXT_PUBLIC_ASSET_BASE_URL = originalBase;
  }
});

describe("assetUrl", () => {
  it("uses the pinned repository asset path by default", () => {
    delete process.env.NEXT_PUBLIC_ASSET_BASE_URL;
    expect(assetUrl("nikke/si_c082_00_s.png")).toBe(
      "https://cdn.jsdelivr.net/gh/yunjae305/NikkeURaid@main/assets/nikke/si_c082_00_s.png",
    );
  });

  it("escapes percent signs that are part of stored filenames", () => {
    expect(assetUrl("boss/Enemy_Kraken_%28D.M.T.R.%29.webp")).toContain(
      "Enemy_Kraken_%2528D.M.T.R.%2529.webp",
    );
  });

  it("normalizes a custom base URL", () => {
    process.env.NEXT_PUBLIC_ASSET_BASE_URL = "https://assets.example.test/base/";
    expect(assetUrl("/boss/example image.webp")).toBe(
      "https://assets.example.test/base/boss/example%20image.webp",
    );
  });
});

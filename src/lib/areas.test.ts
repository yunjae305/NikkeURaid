import { describe, expect, it } from "vitest";

import { AREAS, getArea, isAreaId } from "./areas";

describe("areas", () => {
  it("supports the five documented regions", () => {
    expect(AREAS.map((area) => area.id).sort()).toEqual([81, 82, 83, 84, 85]);
    expect(getArea(83).name).toBe("한국");
  });

  it("validates both route strings and numeric identifiers", () => {
    expect(isAreaId("83")).toBe(true);
    expect(isAreaId(81)).toBe(true);
    expect(isAreaId("  ")).toBe(false);
    expect(isAreaId("86")).toBe(false);
    expect(isAreaId(83.5)).toBe(false);
  });
});

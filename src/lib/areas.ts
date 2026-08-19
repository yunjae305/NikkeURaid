import { AREA_IDS, type Area, type AreaId } from "./types";

export const AREAS: readonly Area[] = [
  { id: 83, name: "한국", shortName: "KR" },
  { id: 81, name: "일본", shortName: "JP" },
  { id: 82, name: "북미", shortName: "NA" },
  { id: 84, name: "글로벌", shortName: "GL" },
  { id: 85, name: "동남아", shortName: "SEA" },
] as const;

export function isAreaId(value: unknown): value is AreaId {
  const numberValue =
    typeof value === "string" && value.trim() !== "" ? Number(value) : value;

  return (
    typeof numberValue === "number" &&
    Number.isInteger(numberValue) &&
    AREA_IDS.some((areaId) => areaId === numberValue)
  );
}

export function getArea(areaId: AreaId): Area {
  const area = AREAS.find((candidate) => candidate.id === areaId);

  if (!area) {
    throw new RangeError(`지원하지 않는 서버 코드입니다: ${areaId}`);
  }

  return area;
}

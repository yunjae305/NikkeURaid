import { ImageResponse } from "next/og";

export const alt = "NikkeURaid 유니온 레이드 기록";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ area: string; guild: string }>;
}) {
  const { area, guild } = await params;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          color: "#f7f8fb",
          background: "linear-gradient(135deg, #0b0d12 0%, #171b25 62%, #ca3654 160%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px", fontSize: 34, fontWeight: 800 }}>
          <div style={{ width: 52, height: 52, display: "flex", alignItems: "center", justifyContent: "center", background: "#ca3654", borderRadius: 14 }}>N</div>
          NikkeURaid
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ color: "#f0a2b1", fontSize: 24, letterSpacing: "0.16em", fontWeight: 700 }}>UNION RAID ARCHIVE</div>
          <div style={{ fontSize: 66, lineHeight: 1.15, fontWeight: 850 }}>유니온의 기록과 성장을 한눈에.</div>
          <div style={{ color: "#adb4c3", fontSize: 28 }}>{`서버 ${area} · 유니온 ID ${guild}`}</div>
        </div>
        <div style={{ display: "flex", gap: "18px", color: "#d7dbe4", fontSize: 24 }}>
          <span>딜 순위</span><span>·</span><span>미참여</span><span>·</span><span>조합 분석</span><span>·</span><span>시즌 추이</span>
        </div>
      </div>
    ),
    size,
  );
}

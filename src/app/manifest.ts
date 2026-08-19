import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NikkeURaid",
    short_name: "NikkeURaid",
    description: "니케 유니온 레이드 기록 대시보드",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0d12",
    theme_color: "#bd2443",
    lang: "ko",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}

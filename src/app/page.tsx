import Link from "next/link";

import { GuildSearch } from "@/components/landing/guild-search";
import { BrandMark } from "@/components/shared/brand-mark";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { getConfiguredDataSource } from "@/lib/data";

export default function HomePage() {
  const liveData = getConfiguredDataSource() === "supabase";

  return (
    <div className="landing-page">
      <header className="site-header landing-header">
        <Link className="brand-link" href="/" aria-label="NikkeURaid 홈">
          <BrandMark />
          <span>NikkeURaid</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="landing-main">
        <section className="landing-copy" aria-labelledby="landing-title">
          <p className="eyebrow">UNION RAID ARCHIVE</p>
          <h1 id="landing-title">유니온의 오늘과 성장을 한눈에.</h1>
          <p className="landing-description">
            서버와 유니온 ID만 입력하세요. 딜 순위, 남은 티켓, 보스별 조합과 시즌 추이를 한곳에서 봅니다.
          </p>
          <div className="feature-list" aria-label="핵심 기능" role="list">
            <span role="listitem">미참여 확인</span>
            <span role="listitem">조합 분석</span>
            <span role="listitem">시즌 비교</span>
          </div>
        </section>

        <GuildSearch />

        <aside className="preview-note" aria-label="조회 안내">
          <div>
            <strong>
              {liveData
                ? "처음 찾는 유니온은 기록을 모으는 시간이 필요합니다."
                : "현재는 샘플 데이터 미리보기입니다."}
            </strong>
            <p>
              {liveData
                ? "조회 요청 후 이 화면을 닫아도 수집은 계속되며, 같은 주소에서 결과를 확인할 수 있습니다."
                : "Supabase와 실제 수집기가 연결되기 전까지 샘플 길드 데이터를 표시합니다."}
            </p>
          </div>
          {!liveData ? (
            <Link href="/u/83/28517?season=43&day=2">샘플 대시보드 보기</Link>
          ) : null}
        </aside>
      </main>
    </div>
  );
}

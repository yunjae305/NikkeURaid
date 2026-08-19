import { AlertTriangleIcon, UsersIcon } from "@/components/shared/icons";
import { formatDamage, formatPercent } from "@/lib/format";
import type { DashboardModel } from "@/lib/types";

function AssetPortrait({
  image,
  label,
  className = "",
}: {
  image: string | null;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={`asset-portrait ${className}`}
      aria-hidden="true"
      style={image ? { backgroundImage: `url(${JSON.stringify(image).slice(1, -1)})` } : undefined}
      title={label}
    >
      {!image ? label.slice(0, 1) : null}
    </span>
  );
}

export function OverviewPanel({ model }: { model: DashboardModel }) {
  const { overview } = model;
  const incomplete = overview.participation.filter((member) => member.remaining > 0);
  const rosterReady =
    model.guild.rosterState === "complete" &&
    overview.participation.length >= overview.totalMembers;
  const maxDamage = Math.max(...overview.ranking.map((member) => member.damage), 1);

  const participationTitle = !rosterReady
    ? model.guild.rosterState === "limited"
      ? incomplete.length > 0
        ? `확인된 명단에서 ${incomplete.length}명이 티켓을 남겼어요`
        : "미참여 인원을 모두 확인할 수 없어요"
      : "길드원 명단을 확인하는 중이에요"
    : incomplete.length > 0
      ? `${incomplete.length}명이 티켓을 남겼어요`
      : "전원이 티켓을 사용했어요";

  return (
    <div className="panel-stack">
      <section className="participation-card" aria-labelledby="participation-title">
        <div className="participation-heading">
          <span className="warning-icon-box">
            <AlertTriangleIcon aria-hidden="true" />
          </span>
          <div>
            <p className="card-kicker">티켓 확인</p>
            <h2 id="participation-title">{participationTitle}</h2>
          </div>
          <span className="ticket-total">
            {overview.usedTickets}/{overview.totalTickets}
          </span>
        </div>

        {!rosterReady ? (
          <p className="roster-note" role="status">
            {model.guild.rosterState === "limited"
              ? "명단 조회가 제한되어 공격 기록에 등장한 인원만 확인합니다. 표시되지 않은 미참여자가 있을 수 있습니다."
              : "명단과 오늘의 참여 집계가 준비되기 전에는 미참여 여부를 확정하지 않습니다."}
          </p>
        ) : null}

        {incomplete.length > 0 ? (
          <ul className="participation-list">
            {incomplete.map((member) => (
              <li key={member.openid}>
                <span className="member-avatar">{member.displayName.slice(0, 1)}</span>
                <span className="member-name">{member.displayName}</span>
                <span className={`ticket-pill ${member.status}`}>
                  {member.tries}/3
                </span>
              </li>
            ))}
          </ul>
        ) : rosterReady ? (
          <p className="empty-inline">오늘의 3회 공격을 모두 마쳤습니다.</p>
        ) : null}
      </section>

      <section className="metric-grid" aria-label="레이드 요약">
        <article className="metric-card accent">
          <p>유니온 총딜</p>
          <strong>{formatDamage(overview.totalDamage)}</strong>
          <span>선택한 Day 기준</span>
        </article>
        <article className="metric-card">
          <p>참여 인원</p>
          <strong>
            {overview.participants}<small>/{overview.totalMembers}</small>
          </strong>
          <span>{formatPercent((overview.participants / Math.max(overview.totalMembers, 1)) * 100, 0)} 참여</span>
        </article>
        <article className="metric-card">
          <p>남은 티켓</p>
          <strong>{overview.remainingTickets}</strong>
          <span>전체 {overview.totalTickets}장 중</span>
        </article>
        <article className="metric-card">
          <p>막타</p>
          <strong>{overview.finalHits}</strong>
          <span>보스 처치 공격</span>
        </article>
      </section>

      <section className="content-card" aria-labelledby="boss-progress-title">
        <header className="section-heading">
          <div>
            <p className="card-kicker">RAID PROGRESS</p>
            <h2 id="boss-progress-title">보스 진행</h2>
          </div>
          <span>{model.selectedPeriod.label}</span>
        </header>
        <div className="boss-grid">
          {overview.bosses.map((boss) => (
            <article className="boss-card" key={`${boss.step}-${boss.difficulty}`}>
              <AssetPortrait image={boss.image} label={boss.name} className="boss-portrait" />
              <div className="boss-copy">
                <div className="boss-title-row">
                  <div>
                    <span>STEP {boss.step} · LV.{boss.level}</span>
                    <h3>{boss.name}</h3>
                  </div>
                  <strong>{boss.defeated ? "격파" : boss.progressPct === null ? "집계 중" : formatPercent(boss.progressPct, 0)}</strong>
                </div>
                <p>{boss.weak} 약점 · {boss.attacks}회 공격</p>
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label={`${boss.name} 진행률`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(boss.progressPct ?? 0)}
                  aria-valuetext={boss.progressPct === null ? "집계 중" : formatPercent(boss.progressPct, 0)}
                >
                  <span style={{ width: `${Math.min(Math.max(boss.progressPct ?? 0, 0), 100)}%` }} />
                </div>
                <div className="boss-values">
                  <span>{formatDamage(boss.damage)} 누적</span>
                  <span>
                    {boss.currentHp === null || boss.maxHp === null
                      ? "HP 정보 없음"
                      : `${formatDamage(boss.currentHp)} / ${formatDamage(boss.maxHp)} HP`}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="content-card" aria-labelledby="ranking-title">
        <header className="section-heading">
          <div>
            <p className="card-kicker">MEMBER RANKING</p>
            <h2 id="ranking-title">딜 순위</h2>
          </div>
          <span>{overview.ranking.length}명 참여</span>
        </header>
        <ol className="ranking-list">
          {overview.ranking.map((member) => (
            <li key={member.openid}>
              <span className="rank-number">{member.rank}</span>
              <div className="rank-member">
                <strong>{member.displayName}</strong>
                <span>
                  {member.tries}/3회 · 기여 {formatPercent(member.contributionPct)}
                </span>
              </div>
              <div className="rank-damage">
                <strong>{formatDamage(member.damage)}</strong>
                <span>최고 {formatDamage(member.bestHit)}</span>
              </div>
              <span
                className="rank-bar"
                aria-hidden="true"
                style={{ width: `${Math.max((member.damage / maxDamage) * 100, 1)}%` }}
              />
            </li>
          ))}
        </ol>
        {overview.ranking.length === 0 ? (
          <div className="empty-state">
            <UsersIcon aria-hidden="true" />
            <p>아직 집계된 공격이 없습니다.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

import { formatDamage, formatPercent } from "@/lib/format";
import type { DashboardTrend } from "@/lib/types";

export function TrendPanel({ trend }: { trend: DashboardTrend }) {
  const seasons = [...trend.seasons].sort((a, b) => a.season - b.season);
  const values = seasons.map((item) => item.damage);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const points = seasons.map((item, index) => {
    const x = seasons.length === 1 ? 320 : 58 + (index / (seasons.length - 1)) * 562;
    const y = 224 - ((item.damage - min) / Math.max(max - min, 1)) * 174;
    return { ...item, x, y };
  });

  return (
    <div className="panel-stack">
      <section className="content-card chart-card" aria-labelledby="season-trend-title">
        <header className="section-heading">
          <div><p className="card-kicker">SEASON HISTORY</p><h2 id="season-trend-title">차수별 유니온 총딜</h2></div>
          <span>{seasons.length}개 차수</span>
        </header>
        {seasons.length > 0 ? (
          <div className="chart-shell">
            <svg className="line-chart" viewBox="0 0 640 280" role="img" aria-labelledby="trend-svg-title trend-svg-desc">
              <title id="trend-svg-title">차수별 유니온 총 피해량 추이</title>
              <desc id="trend-svg-desc">왼쪽에서 오른쪽으로 오래된 차수부터 최신 차수까지 표시합니다.</desc>
              {[0, 1, 2, 3, 4].map((line) => <line key={line} x1="58" x2="620" y1={34 + line * 48} y2={34 + line * 48} className="chart-grid-line" />)}
              <polyline points={points.map((point) => `${point.x},${point.y}`).join(" ")} className="trend-line" />
              {points.map((point) => (
                <g key={point.season}>
                  <circle cx={point.x} cy={point.y} r="6" className="trend-point"><title>{`${point.season}차 · ${formatDamage(point.damage)} · ${formatPercent(point.changePct)}`}</title></circle>
                  <text x={point.x} y="262" textAnchor="middle" className="chart-label">{point.season}차</text>
                </g>
              ))}
            </svg>
          </div>
        ) : <div className="empty-state"><p>비교할 과거 기록이 없습니다.</p></div>}
        <details className="data-details">
          <summary>표로 보기</summary>
          <div className="table-scroll">
            <table><thead><tr><th>차수</th><th>총딜</th><th>증감</th><th>참여</th></tr></thead>
              <tbody>{seasons.map((season) => <tr key={season.season}><td>{season.season}차</td><td>{formatDamage(season.damage)}</td><td>{formatPercent(season.changePct)}</td><td>{season.participants}명</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="content-card" aria-labelledby="growth-title">
        <header className="section-heading">
          <div><p className="card-kicker">MEMBER GROWTH</p><h2 id="growth-title">개인 성장</h2></div>
          <span>직전 차수 대비</span>
        </header>
        <ol className="growth-list">
          {trend.growth.map((member, index) => (
            <li key={member.openid}>
              <span className="rank-number">{index + 1}</span>
              <div><strong>{member.displayName}</strong><span>싱크로 LV.{member.syncLevel ?? "—"}</span></div>
              <div className="growth-value"><strong>{formatDamage(member.damage)}</strong><span className={(member.changePct ?? 0) >= 0 ? "positive" : "negative"}>{member.changePct === null ? "첫 기록" : formatPercent(member.changePct)}</span></div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

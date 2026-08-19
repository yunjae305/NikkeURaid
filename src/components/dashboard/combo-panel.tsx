"use client";

import { useMemo, useState } from "react";

import { formatDamage } from "@/lib/format";
import type { DashboardCombos } from "@/lib/types";

type ComboPanelProps = {
  combos: DashboardCombos;
};

export function ComboPanel({ combos }: ComboPanelProps) {
  const [boss, setBoss] = useState(combos.bosses[0] ?? "all");
  const [nikke, setNikke] = useState("all");
  const nikkeOptions = useMemo(
    () => Array.from(new Set(combos.rows.flatMap((row) => row.nikkeNames))).sort(),
    [combos.rows],
  );
  const rows = combos.rows.filter(
    (row) =>
      (boss === "all" || row.boss === boss) &&
      (nikke === "all" || row.nikkeNames.includes(nikke)),
  );
  const maxDamage = Math.max(...rows.map((row) => row.avgDamage), 1);
  const syncValues = rows.map((row) => row.avgSyncLevel ?? 0);
  const minSync = rows.length > 0 ? Math.max(0, Math.min(...syncValues) - 2) : 0;
  const maxSync = rows.length > 0 ? Math.max(...syncValues) + 2 : 1;

  return (
    <div className="panel-stack">
      <section className="content-card" aria-labelledby="combo-filter-title">
        <header className="section-heading">
          <div>
            <p className="card-kicker">COMPOSITION LAB</p>
            <h2 id="combo-filter-title">조합 필터</h2>
          </div>
          <span>{rows.length}개 조합</span>
        </header>
        <div className="filter-grid">
          <label>
            보스
            <select value={boss} onChange={(event) => setBoss(event.target.value)}>
              <option value="all">전체 보스</option>
              {combos.bosses.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
          <label>
            니케
            <select value={nikke} onChange={(event) => setNikke(event.target.value)}>
              <option value="all">전체 니케</option>
              {nikkeOptions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="content-card chart-card" aria-labelledby="scatter-title">
        <header className="section-heading">
          <div>
            <p className="card-kicker">SYNC LEVEL × DAMAGE</p>
            <h2 id="scatter-title">싱크로 레벨별 평균 딜</h2>
          </div>
        </header>
        {rows.length > 0 ? (
          <div className="chart-shell">
            <svg className="scatter-chart" viewBox="0 0 640 280" role="img" aria-labelledby="scatter-svg-title scatter-svg-desc">
              <title id="scatter-svg-title">조합별 싱크로 레벨과 평균 피해량 산점도</title>
              <desc id="scatter-svg-desc">오른쪽일수록 싱크로 레벨이 높고, 위쪽일수록 평균 피해량이 높습니다.</desc>
              {[0, 1, 2, 3, 4].map((line) => (
                <line key={line} x1="58" x2="620" y1={34 + line * 50} y2={34 + line * 50} className="chart-grid-line" />
              ))}
              <line x1="58" x2="58" y1="24" y2="240" className="chart-axis" />
              <line x1="58" x2="620" y1="240" y2="240" className="chart-axis" />
              {rows.map((row) => {
                const x = 70 + (((row.avgSyncLevel ?? minSync) - minSync) / Math.max(maxSync - minSync, 1)) * 532;
                const y = 230 - (row.avgDamage / maxDamage) * 186;
                return (
                  <g key={`${row.boss}-${row.rank}-${row.nikkeNames.join("-")}`}>
                    <circle cx={x} cy={y} r={Math.min(7 + row.uses, 15)} className="scatter-point">
                      <title>{`${row.boss} · ${row.nikkeNames.join(", ")} · 평균 ${formatDamage(row.avgDamage)} · ${row.uses}회`}</title>
                    </circle>
                  </g>
                );
              })}
              <text x="58" y="264" className="chart-label">LV.{minSync}</text>
              <text x="620" y="264" textAnchor="end" className="chart-label">LV.{maxSync}</text>
              <text x="16" y="38" className="chart-label">딜 ↑</text>
            </svg>
          </div>
        ) : (
          <div className="empty-state"><p>선택한 조건의 조합이 없습니다.</p></div>
        )}
        <details className="data-details">
          <summary>표로 보기</summary>
          <div className="table-scroll">
            <table>
              <thead><tr><th>보스</th><th>싱크로</th><th>평균 딜</th><th>사용</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`table-${row.boss}-${row.rank}-${row.nikkeNames.join("-")}`}>
                    <td>{row.boss}</td><td>{row.avgSyncLevel ?? "—"}</td><td>{formatDamage(row.avgDamage)}</td><td>{row.uses}회</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="content-card" aria-labelledby="combo-ranking-title">
        <header className="section-heading">
          <div>
            <p className="card-kicker">TOP COMPOSITIONS</p>
            <h2 id="combo-ranking-title">조합 랭킹</h2>
          </div>
          <span>3회 이상 권장</span>
        </header>
        <ol className="combo-list">
          {rows.map((row, index) => (
            <li key={`${row.boss}-${row.rank}-${row.nikkeNames.join("-")}`}>
              <span className="rank-number">{index + 1}</span>
              <div className="combo-copy">
                <strong>{row.nikkeNames.join(" · ")}</strong>
                <span>{row.boss} · {row.uses}회 · 최고 {formatDamage(row.maxDamage)}</span>
              </div>
              <strong className="combo-average">{formatDamage(row.avgDamage)}</strong>
            </li>
          ))}
        </ol>
      </section>

      <section className="content-card" aria-labelledby="usage-title">
        <header className="section-heading">
          <div><p className="card-kicker">PICK RATE</p><h2 id="usage-title">자주 쓴 니케</h2></div>
        </header>
        <div className="usage-grid">
          {combos.usage.map((item) => (
            <article key={item.name}>
              <span className="usage-avatar" style={item.image ? { backgroundImage: `url(${JSON.stringify(item.image).slice(1, -1)})` } : undefined} aria-hidden="true">{item.image ? null : item.name.slice(0, 1)}</span>
              <div><strong>{item.name}</strong><span>{item.picks}회 출전</span></div>
              <strong>{formatDamage(item.avgDamage)}</strong>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

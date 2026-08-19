export default function GuildDashboardLoading() {
  return (
    <div className="dashboard-page" aria-busy="true" aria-label="유니온 기록 불러오는 중">
      <div className="loading-topbar"><span className="skeleton skeleton-logo" /><span className="skeleton skeleton-button" /></div>
      <main className="dashboard-main loading-main">
        <section className="loading-hero"><span className="skeleton skeleton-label" /><span className="skeleton skeleton-title" /><span className="skeleton skeleton-copy" /></section>
        <div className="skeleton skeleton-banner" />
        <div className="loading-tabs"><span /><span /><span /></div>
        <section className="loading-card"><span className="skeleton skeleton-copy" /><span className="skeleton skeleton-title" /><div className="loading-rows"><span /><span /><span /><span /></div></section>
      </main>
      <span className="sr-only">잠시만 기다려 주세요.</span>
    </div>
  );
}

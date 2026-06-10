type ReportsProps = {
  reports: string[];
};

export function Reports({ reports }: ReportsProps) {
  return (
    <section className="route-stack">
      <div>
        <div className="section-kicker">Reports</div>
        <h1>Reports</h1>
        <p className="muted">Phase 1 report surfaces summarize local session activity and approved projections.</p>
      </div>
      <div className="report-list">
        {reports.map((report) => (
          <article className="report-item" key={report}>
            <h2>{report}</h2>
            <p>Placeholder report panel wired for generated contract data.</p>
          </article>
        ))}
      </div>
    </section>
  );
}

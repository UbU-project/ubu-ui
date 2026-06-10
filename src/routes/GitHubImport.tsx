type GitHubImportProps = {
  importSummary: {
    repositories: string[];
    issueCount: number;
    pullRequestCount: number;
  };
  onImportComplete: () => void;
};

export function GitHubImport({ importSummary, onImportComplete }: GitHubImportProps) {
  return (
    <section className="route-stack">
      <div>
        <div className="section-kicker">Import preview</div>
        <h1>GitHub import</h1>
        <p className="muted">The UI previews repository context through the orchestrator. It does not mutate GitHub directly.</p>
      </div>
      <div className="summary-grid">
        <div>
          <span className="metric">{importSummary.repositories.length}</span>
          <span className="metric-label">Repositories</span>
        </div>
        <div>
          <span className="metric">{importSummary.issueCount}</span>
          <span className="metric-label">Issues</span>
        </div>
        <div>
          <span className="metric">{importSummary.pullRequestCount}</span>
          <span className="metric-label">Pull requests</span>
        </div>
      </div>
      <div className="repository-list">
        {importSummary.repositories.map((repo) => (
          <span key={repo}>{repo}</span>
        ))}
      </div>
      <button type="button" className="primary-action fit" onClick={onImportComplete}>
        Accept import and open Next Task
      </button>
    </section>
  );
}

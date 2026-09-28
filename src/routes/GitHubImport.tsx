import type { BootstrapSelectedRepo, ImportResponse } from "../api/client";

type GitHubImportProps = {
  selectedRepo: BootstrapSelectedRepo | null;
  // What the orchestrator reported when the workspace was seeded; null until then.
  imported: ImportResponse | null;
};

export function GitHubImport({ selectedRepo, imported }: GitHubImportProps) {
  return (
    <div>
      <h3>GitHub import</h3>
      <p className="muted">The orchestrator imports repository context when the workspace is seeded. The UI does not call GitHub directly.</p>
      {!imported && <p className="muted">Nothing has been imported in this window.</p>}
      {imported && (
        <>
          <div className="summary-grid">
            <div>
              <span className="metric">{imported.imported}</span>
              <span className="metric-label">Imported</span>
            </div>
            <div>
              <span className="metric">{imported.admitted_to_store}</span>
              <span className="metric-label">Admitted</span>
            </div>
            <div>
              <span className="metric">{imported.candidates.length}</span>
              <span className="metric-label">Candidates</span>
            </div>
          </div>
          {selectedRepo && (
            <div className="repository-list">
              <span>
                {selectedRepo.owner}/{selectedRepo.repo}
              </span>
            </div>
          )}
          {imported.candidates.length > 0 && (
            <ul>
              {imported.candidates.map((candidate) => (
                <li key={candidate.task_id}>
                  {candidate.title} <span className="muted">({candidate.source})</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

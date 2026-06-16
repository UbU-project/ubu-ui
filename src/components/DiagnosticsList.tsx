import type { BootstrapDiagnostic } from "../api/client";

type DiagnosticsListProps = {
  diagnostics: BootstrapDiagnostic[];
};

export function DiagnosticsList({ diagnostics }: DiagnosticsListProps) {
  if (diagnostics.length === 0) {
    return null;
  }

  return (
    <div className="diagnostics-list" role="alert">
      {diagnostics.map((diagnostic) => (
        <div className="diagnostic-item" key={`${diagnostic.code}:${diagnostic.message}`}>
          <strong>{diagnostic.code}</strong>
          <span>{diagnostic.message}</span>
        </div>
      ))}
    </div>
  );
}

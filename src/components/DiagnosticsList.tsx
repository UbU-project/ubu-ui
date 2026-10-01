import type { BootstrapDiagnostic } from "../api/client";

/**
 * Where a diagnostic came from decides how it reads.
 *
 * `failure`: it came with a request that failed, or with a result whose own
 * status says it did not succeed. It is an alert.
 * `info`: it came with a result that succeeded. Something happened and the
 * operator should know; nothing went wrong. It is a status, and it is quiet.
 *
 * The default is `failure`, so a call site that says nothing keeps the meaning
 * it always had.
 */
export type DiagnosticTone = "failure" | "info";

type DiagnosticsListProps = {
  diagnostics: BootstrapDiagnostic[];
  tone?: DiagnosticTone;
};

export function DiagnosticsList({ diagnostics, tone = "failure" }: DiagnosticsListProps) {
  if (diagnostics.length === 0) {
    return null;
  }

  const info = tone === "info";
  return (
    <div className={info ? "diagnostics-list diagnostics-info" : "diagnostics-list"} role={info ? "status" : "alert"}>
      {diagnostics.map((diagnostic) => (
        <div className="diagnostic-item" key={`${diagnostic.code}:${diagnostic.message}`}>
          {/* The sentence leads. The code is what the operator quotes in a report: small, after it, and selectable. */}
          <span className="diagnostic-message">{diagnostic.message}</span>
          <code className="diagnostic-code">{diagnostic.code}</code>
        </div>
      ))}
    </div>
  );
}

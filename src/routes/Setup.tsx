import { FormEvent, useEffect, useState } from "react";

import {
  getOrchestratorBaseUrl,
  orchestratorClient,
  OrchestratorError,
  type BootstrapDiagnostic,
  type BootstrapSeedResponse,
  type BootstrapSelectedRepo,
  type HealthResponse
} from "../api/client";
import { DEFAULT_ORCHESTRATOR_PORT } from "../api/endpoints";
import { DiagnosticsList } from "../components/DiagnosticsList";
import { StatusBadge } from "../components/StatusBadge";
import { Bootstrap } from "./Bootstrap";
import { GitHubImport } from "./GitHubImport";
import { Onboarding } from "./Onboarding";

type HealthState =
  | { state: "checking" }
  | { state: "answered"; health: HealthResponse }
  | { state: "unreachable"; reason: string };

function OrchestratorCard() {
  const baseUrl = getOrchestratorBaseUrl();
  const [health, setHealth] = useState<HealthState>({ state: "checking" });

  async function checkHealth() {
    setHealth({ state: "checking" });
    try {
      const response = await orchestratorClient.health();
      setHealth({ state: "answered", health: response.data });
    } catch (error) {
      setHealth({ state: "unreachable", reason: error instanceof Error ? error.message : String(error) });
    }
  }

  useEffect(() => {
    void checkHealth();
  }, []);

  return (
    <div className="settings-panel">
      <div className="title-row">
        <h2>Orchestrator</h2>
        {health.state === "checking" && <StatusBadge label="checking" />}
        {health.state === "answered" && <StatusBadge label={`health: ${health.health.status}`} tone="success" />}
        {health.state === "unreachable" && <StatusBadge label="no answer" tone="danger" />}
      </div>
      <dl className="task-meta">
        <div>
          <dt>Base URL</dt>
          <dd>
            <code>{baseUrl}</code>
          </dd>
        </div>
        {health.state === "answered" && (
          <>
            <div>
              <dt>Version</dt>
              <dd>{health.health.version}</dd>
            </div>
            <div>
              <dt>Bind policy</dt>
              <dd>{health.health.bind_policy}</dd>
            </div>
          </>
        )}
      </dl>
      {health.state === "unreachable" && (
        <>
          <span className="error-text">
            No answer from {baseUrl}/health: {health.reason}
          </span>
          <p className="muted">
            The app is calling the address above. The orchestrator listens on port {DEFAULT_ORCHESTRATOR_PORT} unless <code>UBU_ORCHESTRATOR_PORT</code>{" "}
            says otherwise; if one side is overridden, the other must match.
          </p>
        </>
      )}
      <button type="button" className="secondary-action fit" disabled={health.state === "checking"} onClick={() => void checkHealth()}>
        Check again
      </button>
    </div>
  );
}

type DesktopSessionCardProps = {
  sessionReady: boolean;
  onSessionReady: (ready: boolean) => void;
};

function DesktopSessionCard({ sessionReady, onSessionReady }: DesktopSessionCardProps) {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [formError, setFormError] = useState("");
  const [diagnostics, setDiagnostics] = useState<BootstrapDiagnostic[]>([]);

  async function submitToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setDiagnostics([]);

    const tokenForSubmit = token.trim();
    if (!tokenForSubmit) {
      setFormError("Paste a GitHub token for this desktop session.");
      return;
    }

    setStatus("submitting");
    try {
      const result = await orchestratorClient.submitSessionToken({ token: tokenForSubmit });
      if (!result.data.accepted || !result.data.token_available) {
        setFormError("The local orchestrator did not accept the token.");
        return;
      }
      onSessionReady(true);
    } catch (error) {
      if (error instanceof OrchestratorError) {
        setDiagnostics(error.diagnostics);
        setFormError(error.message);
      } else {
        setFormError("Could not send token to the local orchestrator.");
      }
    } finally {
      setToken("");
      setStatus("idle");
    }
  }

  return (
    <div className="settings-panel">
      <div className="title-row">
        <h2>Desktop session</h2>
        <StatusBadge label={sessionReady ? "session ready" : "not connected"} tone={sessionReady ? "success" : "neutral"} />
      </div>
      <p>
        Paste a PAT only to start an orchestrator-managed in-memory session over loopback. The UI clears the field after submit,
        does not persist the token, and must not log it. Developer mode may use <code>GITHUB_TOKEN</code> in the orchestrator.
      </p>
      <form className="token-form" onSubmit={submitToken}>
        <label htmlFor="github-token">GitHub personal access token</label>
        <input
          id="github-token"
          autoComplete="off"
          spellCheck={false}
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="Paste token for this session"
        />
        <button type="submit" className="primary-action fit" disabled={status === "submitting"}>
          {status === "submitting" ? "Sending to orchestrator" : "Send to orchestrator"}
        </button>
      </form>
      {formError && <span className="error-text">{formError}</span>}
      <DiagnosticsList diagnostics={diagnostics} />
    </div>
  );
}

export function Setup() {
  const [sessionReady, setSessionReady] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<BootstrapSelectedRepo | null>(null);
  const [seeded, setSeeded] = useState<BootstrapSeedResponse | null>(null);

  function selectRepo(repo: BootstrapSelectedRepo) {
    setSelectedRepo(repo);
    setSeeded(null);
  }

  return (
    <section className="route-stack">
      <div>
        <div className="section-kicker">Setup</div>
        <h1>Setup</h1>
        <p className="muted">
          Where the app is pointing, the desktop session and the GitHub import. Nothing here is needed before planning the day.
        </p>
      </div>
      <OrchestratorCard />
      <DesktopSessionCard sessionReady={sessionReady} onSessionReady={setSessionReady} />
      <div className="settings-panel">
        <div className="title-row">
          <h2>GitHub</h2>
          <StatusBadge
            label={selectedRepo ? `${selectedRepo.owner}/${selectedRepo.repo}` : "no repository"}
            tone={selectedRepo ? "success" : "neutral"}
          />
        </div>
        <Onboarding sessionReady={sessionReady} onComplete={selectRepo} />
        {selectedRepo ? (
          <Bootstrap key={`${selectedRepo.owner}/${selectedRepo.repo}`} selectedRepo={selectedRepo} onComplete={setSeeded} />
        ) : (
          <p className="muted">Choose a repository before seeding the workspace.</p>
        )}
        <GitHubImport selectedRepo={selectedRepo} imported={seeded?.imported_tasks ?? null} />
      </div>
    </section>
  );
}

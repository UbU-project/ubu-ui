import { FormEvent, useState } from "react";

import { getOrchestratorBaseUrl, orchestratorClient, OrchestratorError, type BootstrapDiagnostic } from "../api/client";
import { DiagnosticsList } from "../components/DiagnosticsList";
import { StatusBadge } from "../components/StatusBadge";

type SelectedRepo = {
  owner: string;
  repo: string;
};

type OnboardingProps = {
  sessionReady: boolean;
  onComplete: (repo: SelectedRepo) => void;
};

function parseRepo(value: string): SelectedRepo | null {
  const [owner, repo, ...rest] = value.trim().split("/");

  if (!owner || !repo || rest.length > 0) {
    return null;
  }

  return { owner, repo };
}

export function Onboarding({ sessionReady, onComplete }: OnboardingProps) {
  const [token, setToken] = useState("");
  const [repoInput, setRepoInput] = useState("UbU-project/ubu-ui");
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [formError, setFormError] = useState("");
  const [diagnostics, setDiagnostics] = useState<BootstrapDiagnostic[]>([]);

  async function submitOnboarding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setDiagnostics([]);

    const selectedRepo = parseRepo(repoInput);
    if (!selectedRepo) {
      setFormError("Enter the repository as owner/repo.");
      return;
    }

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
      onComplete(selectedRepo);
    } catch (error) {
      if (error instanceof OrchestratorError) {
        setDiagnostics(error.diagnostics);
        setFormError(error.message);
      } else {
        setFormError("Could not reach the local orchestrator.");
      }
    } finally {
      setToken("");
      setStatus("idle");
    }
  }

  return (
    <section className="route-stack">
      <div>
        <div className="section-kicker">Onboarding</div>
        <h1>Connect desktop session</h1>
        <p className="muted">Orchestrator target: {getOrchestratorBaseUrl()}</p>
      </div>
      <div className="settings-panel">
        <div className="title-row">
          <h2>GitHub token and repository</h2>
          <StatusBadge label={sessionReady ? "session ready" : "not connected"} tone={sessionReady ? "success" : "neutral"} />
        </div>
        <form className="token-form" onSubmit={submitOnboarding}>
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
          <label htmlFor="selected-repo">Repository</label>
          <input
            id="selected-repo"
            autoComplete="off"
            spellCheck={false}
            type="text"
            value={repoInput}
            onChange={(event) => setRepoInput(event.target.value)}
            placeholder="owner/repo"
          />
          <button type="submit" className="primary-action fit" disabled={status === "submitting"}>
            {status === "submitting" ? "Sending to orchestrator" : "Continue to bootstrap"}
          </button>
        </form>
        {formError && <span className="error-text">{formError}</span>}
        <DiagnosticsList diagnostics={diagnostics} />
      </div>
    </section>
  );
}

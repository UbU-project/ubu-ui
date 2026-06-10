import { FormEvent, useState } from "react";

import { getOrchestratorBaseUrl, orchestratorClient } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";

type SettingsProps = {
  sessionReady: boolean;
  onSessionReady: (ready: boolean) => void;
};

export function Settings({ sessionReady, onSessionReady }: SettingsProps) {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "failed">("idle");

  async function submitToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token.trim()) {
      return;
    }

    setStatus("submitting");
    try {
      await orchestratorClient.submitSessionToken({ token });
      setToken("");
      onSessionReady(true);
      setStatus("idle");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <section className="route-stack">
      <div>
        <div className="section-kicker">Settings</div>
        <h1>Desktop session</h1>
        <p className="muted">Orchestrator target: {getOrchestratorBaseUrl()}</p>
      </div>
      <div className="settings-panel">
        <div className="title-row">
          <h2>GitHub token handoff</h2>
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
        {status === "failed" && <span className="error-text">Could not send token to the local orchestrator.</span>}
      </div>
    </section>
  );
}

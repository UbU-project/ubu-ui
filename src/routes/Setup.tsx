import { FormEvent, useEffect, useState } from "react";

import {
  getOrchestratorBaseUrl,
  orchestratorClient,
  OrchestratorError,
  type BootstrapDiagnostic,
  type BootstrapSeedResponse,
  type BootstrapSelectedRepo,
  type GoogleCalendarSessionResponse,
  type SettingsResponse,
  type HealthResponse
} from "../api/client";
import { DEFAULT_ORCHESTRATOR_PORT } from "../api/endpoints";
import { AdvisorySettings } from "../components/AdvisorySettings";
import { DiagnosticsList } from "../components/DiagnosticsList";
import { SelfCheck } from "../components/SelfCheck";
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

type GoogleCalendarSessionCardProps = {
  enabled: boolean;
  onEnabled: (enabled: boolean) => void;
};

function GoogleCalendarSessionCard({ enabled, onEnabled }: GoogleCalendarSessionCardProps) {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<GoogleCalendarSessionResponse | null>(null);
  const [unconfigured, setUnconfigured] = useState(false);
  const [formError, setFormError] = useState("");
  const [diagnostics, setDiagnostics] = useState<BootstrapDiagnostic[]>([]);

  async function enable() {
    setSubmitting(true);
    setResult(null);
    setUnconfigured(false);
    setFormError("");
    setDiagnostics([]);
    try {
      const response = await orchestratorClient.enableGoogleCalendarSession();
      setResult(response.data);
      onEnabled(response.data.accepted && response.data.enabled);
    } catch (error) {
      onEnabled(false);
      if (error instanceof OrchestratorError && error.status === 503) {
        setUnconfigured(true);
      } else if (error instanceof OrchestratorError) {
        setFormError(error.message);
        setDiagnostics(error.diagnostics);
      } else {
        setFormError("Could not enable the Google Calendar session through the local orchestrator.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="settings-panel">
    <div className="title-row">
      <h2>Google Calendar session</h2>
      <StatusBadge label={enabled ? "enabled" : "not enabled"} tone={enabled ? "success" : "neutral"} />
    </div>
    <p>Enable Calendar access for this orchestrator process using its configured credential paths. The app does not take or store Google credentials. Approving an export remains a separate action on Calendar.</p>
    <button type="button" className="primary-action fit" disabled={submitting} onClick={() => void enable()}>Enable Google Calendar session</button>
    {result && <dl className="task-meta">
      <div><dt>accepted</dt><dd>{String(result.accepted)}</dd></div>
      <div><dt>enabled</dt><dd>{String(result.enabled)}</dd></div>
    </dl>}
    {unconfigured && <div role="status">
      <h3>Configure Google Calendar credential paths</h3>
      <p>The credential paths are not configured. Set <code>UBU_GOOGLE_CREDENTIALS_PATH</code> and <code>UBU_GOOGLE_TOKEN_CACHE_PATH</code> in the orchestrator environment, then restart the orchestrator and enable this session again. Set <code>UBU_GOOGLE_CALENDAR_ID</code> to choose the intended calendar; otherwise it uses primary.</p>
    </div>}
    {formError && <p className="error-text" role="alert">{formError}</p>}
    <DiagnosticsList diagnostics={diagnostics} />
  </div>;
}

// Google Calendar event colour IDs; labels remain readable without colour vision.
const calendarSwatches: Record<string, string> = {
  "1": "#a4bdfc", "2": "#7ae7bf", "3": "#dbadff", "4": "#ff887c",
  "5": "#fbd75b", "6": "#ffb878", "7": "#46d6db", "8": "#e1e1e1",
  "9": "#5484ed", "10": "#51b749", "11": "#dc2127"
};

function ColourSwatch({ colorId }: { colorId: string }) {
  return <span role="img" aria-label={`Colour ${colorId}`} style={{ display: "inline-block", width: "1.25rem", height: "1.25rem", border: "1px solid currentColor", borderRadius: "0.25rem", backgroundColor: calendarSwatches[colorId] }} />;
}

function ColoursCard({ onSettingsLoaded }: { onSettingsLoaded: (settings: SettingsResponse) => void }) {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [diagnostics, setDiagnostics] = useState<BootstrapDiagnostic[]>([]);

  async function load() {
    const response = await orchestratorClient.listSettings();
    setSettings(response.data);
    onSettingsLoaded(response.data);
    setDrafts(Object.fromEntries(response.data.palette.map((entry) => [entry.category, entry.color_id])));
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setFormError("");
    setDiagnostics([]);
    try {
      await action();
    } catch (error) {
      if (error instanceof OrchestratorError) {
        setFormError(error.message);
        setDiagnostics(error.diagnostics);
      } else {
        setFormError("Could not read or change the Colours settings through the local orchestrator.");
      }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void run(load); }, []);

  return <section className="settings-panel" aria-labelledby="colours-heading">
    <h2 id="colours-heading">Colours</h2>
    <p>Changes take effect on the next Calendar preview and the next capture, with no restart. Check the inverse mapping before bootstrapping from your calendar.</p>
    <button type="button" className="secondary-action fit" disabled={busy} onClick={() => void run(load)}>Reload colours</button>
    {formError && <p className="error-text" role="alert">{formError}</p>}
    <DiagnosticsList diagnostics={diagnostics} />
    {!settings && busy && <p role="status">Loading colours</p>}
    {settings && <>
      <h3>Category colours</h3>
      <div style={{ overflowX: "auto" }}>
        <table aria-label="Effective category palette">
          <thead><tr><th>Category</th><th>Colour</th><th>Colour id</th><th>Origin</th><th>Edit or revert</th></tr></thead>
          <tbody>{settings.palette.map((entry) => <tr key={entry.category} aria-label={`Category ${entry.category}`}>
            <th scope="row">{entry.category}</th>
            <td><ColourSwatch colorId={entry.color_id} /></td>
            <td>{entry.color_id}</td>
            <td>{entry.origin}</td>
            <td>
              <form className="actions-row" onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  await orchestratorClient.putSetting(`calendar.color.${entry.category}`, drafts[entry.category]);
                  await load();
                });
              }}>
                <input aria-label={`Colour id for ${entry.category}`} type="text" inputMode="numeric" value={drafts[entry.category] ?? entry.color_id} disabled={busy} onChange={(event) => setDrafts((current) => ({ ...current, [entry.category]: event.target.value }))} style={{ width: "4rem" }} />
                <button type="submit" className="primary-action" disabled={busy} aria-label={`Save ${entry.category} colour`}>Save</button>
                <button type="button" className="secondary-action" disabled={busy || entry.origin !== "setting"} aria-label={`Revert ${entry.category} colour`} onClick={() => void run(async () => {
                  await orchestratorClient.deleteSetting(`calendar.color.${entry.category}`);
                  await load();
                })}>Revert</button>
              </form>
            </td>
          </tr>)}</tbody>
        </table>
      </div>
      <h3>Colour to category at capture</h3>
      <p>Each allowed colour is shown. A collision or unmapped colour produces no category; capture reports a diagnostic.</p>
      <p>An event with no colour is not a row here. Capture takes it as work for UbU to schedule, with no category, and that is not a fault. Only an event with a colour is taken as a commitment at its own time.</p>
      <div style={{ overflowX: "auto" }}>
        <table aria-label="Inverse colour mapping">
          <thead><tr><th>Colour</th><th>Colour id</th><th>Category at capture</th></tr></thead>
          <tbody>{settings.inverse.map((entry) => <tr key={entry.color_id} aria-label={`Inverse colour ${entry.color_id}`}>
            <td><ColourSwatch colorId={entry.color_id} /></td><td>{entry.color_id}</td>
            <td>{entry.status === "collision" ? <strong>Collision: {entry.categories.join(", ")} — no category assigned.</strong> : entry.status === "unmapped" ? <strong>Unmapped — no category assigned.</strong> : entry.categories.join(", ")}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </>}
  </section>;
}

type SetupProps = {
  googleCalendarEnabled: boolean;
  onGoogleCalendarEnabled: (enabled: boolean) => void;
};

export function Setup({ googleCalendarEnabled, onGoogleCalendarEnabled }: SetupProps) {
  const [configuration, setConfiguration] = useState<SettingsResponse | null>(null);
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
          Where the app is pointing, the desktop and Google Calendar sessions, and the GitHub import. Nothing here is needed before planning the day.
        </p>
      </div>
      <OrchestratorCard />
      <SelfCheck />
      <DesktopSessionCard sessionReady={sessionReady} onSessionReady={setSessionReady} />
      <GoogleCalendarSessionCard enabled={googleCalendarEnabled} onEnabled={onGoogleCalendarEnabled} />
      <ColoursCard onSettingsLoaded={setConfiguration} />
      <AdvisorySettings settings={configuration} />
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

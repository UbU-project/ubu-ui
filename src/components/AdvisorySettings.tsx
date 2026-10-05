import { useEffect, useState } from "react";
import { orchestratorClient, OrchestratorError, type SettingsResponse, type AdvisorySettingEntry, type BootstrapDiagnostic } from "../api/client";
import { DiagnosticsList } from "./DiagnosticsList";

const TIMEOUT = "advisory.timeout_ms";
const DEFAULT_TIMEOUT_MS = "120000";
const dayDefaults: Record<string, string> = {"advisory.review_seed_days":"7", "advisory.review_ceiling_days":"365"};
const names = ["advisory.model", "advisory.endpoint", TIMEOUT, ...Object.keys(dayDefaults)];

// The budget is stored and sent in milliseconds, and shown and entered in seconds.
function seconds(milliseconds: string | null) {
  const value = Number(milliseconds);
  return milliseconds && Number.isFinite(value) ? String(value / 1000) : "";
}
function shown(entry: AdvisorySettingEntry) {
  if (entry.name in dayDefaults) return `${entry.value} days`;
  if (entry.name !== TIMEOUT) return entry.value ?? "Not configured";
  return `${seconds(entry.value)} seconds (${entry.value} ms)`;
}
export function AdvisorySettings({ settings }: { settings: SettingsResponse | null }) {
  const [entries, setEntries] = useState<AdvisorySettingEntry[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [diagnostics, setDiagnostics] = useState<BootstrapDiagnostic[]>([]);
  function accept(data: SettingsResponse) {
    // An orchestrator that does not report an entry is read from the Settings themselves.
    const rows: AdvisorySettingEntry[] = names.map((name) => {
      const reported = data.advisory?.find((entry) => entry.name === name);
      if (reported) return reported;
      const setting = data.settings.find((item) => item.name === name);
      if (name in dayDefaults) return {name, value: setting ? String(setting.value) : dayDefaults[name], origin: setting ? "setting" : "default"};
      if (name === TIMEOUT) return { name, value: setting ? String(setting.value) : DEFAULT_TIMEOUT_MS, origin: setting ? "setting" : "default" };
      return { name, value: setting ? String(setting.value) : null, origin: setting ? "setting" : "unconfigured" };
    });
    setEntries(rows); setDrafts(Object.fromEntries(rows.map(({ name, value }) => [name, name === TIMEOUT ? seconds(value) : value ?? ""])));
  }
  async function load() { accept((await orchestratorClient.listSettings()).data); }
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setDiagnostics([]);
    try { await action(); }
    catch (error) {
      if (error instanceof OrchestratorError) { setError(error.message); setDiagnostics(error.diagnostics); }
      else setError("Could not read or change advisory Settings through the local orchestrator.");
    } finally { setBusy(false); }
  }
  function save(name: string) {
    const draft = (drafts[name] ?? "").trim();
    if (name in dayDefaults) {
      if (!draft || !Number.isInteger(Number(draft)) || Number(draft) < 1 || Number(draft) > 365) { setError("Enter a whole number of days from 1 to 365."); return; }
      void run(async () => { await orchestratorClient.putSetting(name, Number(draft)); await load(); }); return;
    }
    if (name !== TIMEOUT) { void run(async () => { await orchestratorClient.putSetting(name, drafts[name]); await load(); }); return; }
    const value = Number(draft);
    if (!draft || !Number.isFinite(value)) { setDiagnostics([]); setError("Enter the timeout as a number of seconds."); return; }
    // Rounded only to undo floating-point error in the conversion; the orchestrator decides what is in range.
    void run(async () => { await orchestratorClient.putSetting(name, Number((value * 1000).toFixed(3))); await load(); });
  }
  useEffect(() => { if (settings) accept(settings); }, [settings]);
  const timeoutRefused = diagnostics.some(({ code }) => code === "setting_invalid_advisory_timeout");
  return <section className="settings-panel" aria-labelledby="advisory-settings-heading">
    <h2 id="advisory-settings-heading">Advisory configuration</h2>
    <p>Set a local model and its endpoint before running SuggestTags in Review. There is no default endpoint. Use http://127.0.0.1:&lt;port&gt; with no path.</p>
    <p>The timeout is the budget for one whole run, entered in seconds. It is 120 seconds unless set. A capable model on a slow machine can need minutes before its first token.</p>
    <p>Review snoozes start at 7 days and double after each dismissal, up to 365 days. Set the seed and ceiling in days. A requirement blocking work now caps a snooze at the seed.</p>
    {error && <p className="error-text" role="alert">{error}</p>}
    <DiagnosticsList diagnostics={diagnostics} />
    {timeoutRefused && <p>The timeout must be a whole number of milliseconds from 5 to 3600 seconds (5000 to 3600000 ms). Nothing was changed.</p>}
    <button type="button" className="secondary-action fit" disabled={busy} onClick={() => void run(load)}>Reload advisory configuration</button>
    <table aria-label="Advisory Settings"><thead><tr><th>Name</th><th>Value</th><th>Origin</th><th>Edit or revert</th></tr></thead>
      <tbody>{entries.map((entry) => <tr key={entry.name} aria-label={entry.name}>
        <th scope="row">{entry.name}</th><td>{shown(entry)}</td><td>{entry.origin}</td><td>
          <form className="actions-row" onSubmit={(event) => { event.preventDefault(); save(entry.name); }}>
            <input aria-label={entry.name === TIMEOUT ? `Value for ${entry.name}, in seconds` : `Value for ${entry.name}`} inputMode={entry.name === TIMEOUT ? "decimal" : undefined} value={drafts[entry.name] ?? ""} disabled={busy} onChange={(event) => setDrafts((values) => ({ ...values, [entry.name]: event.target.value }))} />
            <button type="submit" className="primary-action" disabled={busy} aria-label={`Save ${entry.name}`}>Save</button>
            <button type="button" className="secondary-action" disabled={busy || entry.origin !== "setting"} aria-label={`Revert ${entry.name}`} onClick={() => void run(async () => { await orchestratorClient.deleteSetting(entry.name); await load(); })}>Revert</button>
          </form>
        </td>
      </tr>)}</tbody>
    </table>
  </section>;
}

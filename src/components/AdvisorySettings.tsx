import { useEffect, useState } from "react";
import { orchestratorClient, OrchestratorError, type SettingsResponse, type AdvisorySettingEntry, type BootstrapDiagnostic } from "../api/client";
import { DiagnosticsList } from "./DiagnosticsList";

const names = ["advisory.model", "advisory.endpoint"];
export function AdvisorySettings({ settings }: { settings: SettingsResponse | null }) {
  const [entries, setEntries] = useState<AdvisorySettingEntry[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [diagnostics, setDiagnostics] = useState<BootstrapDiagnostic[]>([]);
  function accept(data: SettingsResponse) {
    const rows: AdvisorySettingEntry[] = data.advisory ?? names.map((name) => {
      const setting = data.settings.find((item) => item.name === name);
      return { name, value: setting ? String(setting.value) : null, origin: setting ? "setting" : "unconfigured" };
    });
    setEntries(rows); setDrafts(Object.fromEntries(rows.map(({ name, value }) => [name, value ?? ""])));
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
  useEffect(() => { if (settings) accept(settings); }, [settings]);
  return <section className="settings-panel" aria-labelledby="advisory-settings-heading">
    <h2 id="advisory-settings-heading">Advisory configuration</h2>
    <p>Set a local model and its endpoint before running SuggestTags in Review. There is no default endpoint. Use http://127.0.0.1:&lt;port&gt; with no path.</p>
    {error && <p className="error-text" role="alert">{error}</p>}
    <DiagnosticsList diagnostics={diagnostics} />
    <button type="button" className="secondary-action fit" disabled={busy} onClick={() => void run(load)}>Reload advisory configuration</button>
    <table aria-label="Advisory Settings"><thead><tr><th>Name</th><th>Value</th><th>Origin</th><th>Edit or revert</th></tr></thead>
      <tbody>{entries.map((entry) => <tr key={entry.name} aria-label={entry.name}>
        <th scope="row">{entry.name}</th><td>{entry.value ?? "Not configured"}</td><td>{entry.origin}</td><td>
          <form className="actions-row" onSubmit={(event) => { event.preventDefault(); void run(async () => { await orchestratorClient.putSetting(entry.name, drafts[entry.name]); await load(); }); }}>
            <input aria-label={`Value for ${entry.name}`} value={drafts[entry.name] ?? ""} disabled={busy} onChange={(event) => setDrafts((values) => ({ ...values, [entry.name]: event.target.value }))} />
            <button type="submit" className="primary-action" disabled={busy} aria-label={`Save ${entry.name}`}>Save</button>
            <button type="button" className="secondary-action" disabled={busy || entry.origin !== "setting"} aria-label={`Revert ${entry.name}`} onClick={() => void run(async () => { await orchestratorClient.deleteSetting(entry.name); await load(); })}>Revert</button>
          </form>
        </td>
      </tr>)}</tbody>
    </table>
  </section>;
}

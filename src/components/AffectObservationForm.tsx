import { useEffect, useState, type FormEvent } from "react";
import { orchestratorClient, OrchestratorError, type BootstrapDiagnostic } from "../api/client";
import { DiagnosticsList } from "./DiagnosticsList";

const dimensions = [
  { key: "energy", label: "Energy", meaning: "Higher energy is better." },
  { key: "stress", label: "Stress", meaning: "Lower stress is better." },
  { key: "mood_intensity", label: "Mood intensity", meaning: "Intensity is arousal or volatility, not whether your mood is good." }
] as const;

function localTime(value: string): string {
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(instant);
}

export function AffectObservationForm() {
  const [values, setValues] = useState({ energy: "", stress: "", mood_intensity: "" });
  const [recordedAt, setRecordedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<BootstrapDiagnostic[]>([]);

  useEffect(() => {
    let active = true;
    orchestratorClient.readAffectObservation().then(({ data }) => {
      if (active) setRecordedAt(data.observation?.source_kind === "live_observation" ? data.observation.observed_at : null);
    }).catch((cause: unknown) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : "The latest observation could not be read.");
      if (cause instanceof OrchestratorError) setDiagnostics(cause.diagnostics);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function record(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null); setDiagnostics([]);
    for (const { key, label } of dimensions) {
      const value = Number(values[key]);
      if (!values[key].trim() || !Number.isInteger(value) || value < 0 || value > 10) {
        setError(`${label} must be a whole number from 0 to 10.`);
        return;
      }
    }
    setSaving(true);
    try {
      const { data } = await orchestratorClient.recordAffectObservation({
        energy: Number(values.energy), stress: Number(values.stress), mood_intensity: Number(values.mood_intensity)
      });
      setRecordedAt(data.observed_at);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "The observation could not be recorded.");
      if (cause instanceof OrchestratorError) setDiagnostics(cause.diagnostics);
    } finally { setSaving(false); }
  }

  return (
    <section className="report-surface affect-observation" aria-labelledby="affect-observation-heading">
      <h3 id="affect-observation-heading">How are you feeling?</h3>
      <p role="status" aria-label="Affect observation">{loading ? "Reading latest observation…" : recordedAt ? `Recorded at ${localTime(recordedAt)}` : "Not recorded"}</p>
      <form onSubmit={record} noValidate>
        <div className="form-grid">
          {dimensions.map(({ key, label, meaning }) => (
            <div key={key}>
              <label htmlFor={`observation-${key}`}>{label}</label>
              <input id={`observation-${key}`} type="number" min="0" max="10" step="1" required
                aria-describedby={`observation-${key}-meaning`} value={values[key]}
                onChange={event => setValues(current => ({ ...current, [key]: event.target.value }))} />
              <p id={`observation-${key}-meaning`} className="muted">{meaning}</p>
            </div>
          ))}
        </div>
        <button className="primary-action" type="submit" disabled={loading || saving}>Record</button>
      </form>
      <p className="muted">The next “Generate Plan” uses this observation. Recording it does not recalculate the current Plan.</p>
      {error && <p className="error-text" role="alert">{error}</p>}
      <DiagnosticsList diagnostics={diagnostics} />
    </section>
  );
}

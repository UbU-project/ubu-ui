import { FormEvent, useState } from "react";

import {
  orchestratorClient,
  OrchestratorError,
  type BootstrapAnswers,
  type BootstrapDiagnostic,
  type BootstrapSeedResponse,
  type BootstrapSelectedRepo
} from "../api/client";
import { DiagnosticsList } from "../components/DiagnosticsList";

type BootstrapProps = {
  selectedRepo: BootstrapSelectedRepo;
  onComplete: () => void;
};

const defaultAnswers: BootstrapAnswers = {
  primary_objective: "Bootstrap UbU desktop workflow",
  work_style: "balanced",
  planning_horizon_days: 7,
  attention_preference: "mixed"
};

export function Bootstrap({ selectedRepo, onComplete }: BootstrapProps) {
  const [answers, setAnswers] = useState<BootstrapAnswers>(defaultAnswers);
  const [status, setStatus] = useState<"idle" | "submitting" | "complete">("idle");
  const [result, setResult] = useState<BootstrapSeedResponse | null>(null);
  const [formError, setFormError] = useState("");
  const [diagnostics, setDiagnostics] = useState<BootstrapDiagnostic[]>([]);

  async function submitBootstrap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setDiagnostics([]);

    if (!answers.primary_objective.trim()) {
      setFormError("Primary objective is required.");
      return;
    }

    setStatus("submitting");
    try {
      const response = await orchestratorClient.seedBootstrap({
        selected_repo: selectedRepo,
        answers: {
          ...answers,
          primary_objective: answers.primary_objective.trim()
        }
      });
      setResult(response.data);
      setDiagnostics(response.data.diagnostics);
      setStatus("complete");
      onComplete();
    } catch (error) {
      if (error instanceof OrchestratorError) {
        setDiagnostics(error.diagnostics);
        setFormError(error.message);
      } else {
        setFormError("Could not seed bootstrap state through the local orchestrator.");
      }
      setStatus("idle");
    }
  }

  return (
    <section className="route-stack">
      <div>
        <div className="section-kicker">Bootstrap</div>
        <h1>Bootstrap workspace</h1>
        <p className="muted">
          Seed the store-backed orchestrator for <code>{selectedRepo.owner}/{selectedRepo.repo}</code>.
        </p>
      </div>
      <form className="bootstrap-form" onSubmit={submitBootstrap}>
        <label htmlFor="primary-objective">Primary objective</label>
        <input
          id="primary-objective"
          type="text"
          value={answers.primary_objective}
          onChange={(event) => setAnswers((current) => ({ ...current, primary_objective: event.target.value }))}
        />
        <label htmlFor="work-style">Work style</label>
        <select
          id="work-style"
          value={answers.work_style}
          onChange={(event) => setAnswers((current) => ({ ...current, work_style: event.target.value as BootstrapAnswers["work_style"] }))}
        >
          <option value="focused">Focused</option>
          <option value="balanced">Balanced</option>
          <option value="responsive">Responsive</option>
        </select>
        <label htmlFor="planning-horizon">Planning horizon</label>
        <input
          id="planning-horizon"
          type="number"
          min={1}
          max={30}
          value={answers.planning_horizon_days}
          onChange={(event) =>
            setAnswers((current) => ({ ...current, planning_horizon_days: Number.parseInt(event.target.value, 10) || 1 }))
          }
        />
        <label htmlFor="attention-preference">Attention preference</label>
        <select
          id="attention-preference"
          value={answers.attention_preference}
          onChange={(event) =>
            setAnswers((current) => ({ ...current, attention_preference: event.target.value as BootstrapAnswers["attention_preference"] }))
          }
        >
          <option value="deep_work">Deep work</option>
          <option value="mixed">Mixed</option>
          <option value="quick_turnaround">Quick turnaround</option>
        </select>
        <button type="submit" className="primary-action fit" disabled={status === "submitting" || status === "complete"}>
          {status === "submitting" ? "Seeding workspace" : status === "complete" ? "Workspace seeded" : "Seed workspace"}
        </button>
      </form>
      {formError && <span className="error-text">{formError}</span>}
      <DiagnosticsList diagnostics={diagnostics} />
      {result && (
        <div className="summary-grid">
          <div>
            <span className="metric">{result.objective_ids.length}</span>
            <span className="metric-label">Objectives</span>
          </div>
          <div>
            <span className="metric">{result.preference_ids.length}</span>
            <span className="metric-label">Preferences</span>
          </div>
          <div>
            <span className="metric">{result.imported_tasks.admitted_to_store}</span>
            <span className="metric-label">Tasks</span>
          </div>
        </div>
      )}
    </section>
  );
}

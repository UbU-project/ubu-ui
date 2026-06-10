import type { BootstrapStep } from "../state/bootstrapState";
import { StatusBadge } from "../components/StatusBadge";

type BootstrapProps = {
  steps: BootstrapStep[];
  onContinue: () => void;
};

export function Bootstrap({ steps, onContinue }: BootstrapProps) {
  return (
    <section className="route-stack">
      <div>
        <div className="section-kicker">Startup</div>
        <h1>Bootstrap workspace</h1>
        <p className="muted">Connect the local orchestrator and confirm the desktop session inputs.</p>
      </div>
      <div className="step-list">
        {steps.map((step) => (
          <article className="step-item" key={step.id}>
            <div>
              <h2>{step.label}</h2>
              <p>{step.description}</p>
            </div>
            <StatusBadge label={step.status} tone={step.status === "complete" ? "success" : step.status === "current" ? "warning" : "neutral"} />
          </article>
        ))}
      </div>
      <button type="button" className="primary-action fit" onClick={onContinue}>
        Continue to GitHub import
      </button>
    </section>
  );
}

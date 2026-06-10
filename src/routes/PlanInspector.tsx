import type { PlanItem } from "../state/appState";
import { StatusBadge } from "../components/StatusBadge";

type PlanInspectorProps = {
  plan: PlanItem[];
};

export function PlanInspector({ plan }: PlanInspectorProps) {
  return (
    <section className="route-stack">
      <div>
        <div className="section-kicker">Full Plan</div>
        <h1>Plan inspector</h1>
        <p className="muted">The focus screen shows one next Task, while the full Plan stays available for inspection.</p>
      </div>
      <div className="plan-list">
        {plan.map((item) => (
          <article className="plan-item" key={item.id}>
            <div>
              <h2>{item.title}</h2>
              <p>{item.explanation}</p>
            </div>
            <StatusBadge label={item.status} tone={item.status === "done" ? "success" : item.status === "next" ? "warning" : "neutral"} />
          </article>
        ))}
      </div>
    </section>
  );
}

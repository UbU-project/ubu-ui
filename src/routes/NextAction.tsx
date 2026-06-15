import { ExplanationDrawer } from "../components/ExplanationDrawer";
import { HumanCompleteSummary } from "../components/HumanCompleteSummary";
import { NextTaskCard } from "../components/NextTaskCard";
import type { PlanItem, Task } from "../state/appState";

type NextActionProps = {
  task: Task;
  plan: PlanItem[];
  onInspectPlan: () => void;
};

export function NextAction({ task, plan, onInspectPlan }: NextActionProps) {
  const currentItem = plan.find((item) => item.status === "active") ?? plan[0];

  return (
    <section className="next-action-grid">
      <NextTaskCard task={task} onInspectPlan={onInspectPlan} />
      <div className="side-stack">
        <HumanCompleteSummary completed={1} pending={2} />
        <ExplanationDrawer item={currentItem} />
      </div>
    </section>
  );
}

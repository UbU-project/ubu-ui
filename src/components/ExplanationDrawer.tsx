import type { PlanItem } from "../state/appState";

type ExplanationDrawerProps = {
  item: PlanItem;
};

export function ExplanationDrawer({ item }: ExplanationDrawerProps) {
  return (
    <aside className="explanation-drawer" aria-label="Plan explanation">
      <div className="section-kicker">Why this matters</div>
      <h2>{item.title}</h2>
      <p>{item.explanation}</p>
    </aside>
  );
}

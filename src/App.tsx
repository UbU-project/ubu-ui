import { useMemo, useState } from "react";

import { Layout } from "./components/Layout";
import { bootstrapSteps, importSummary, initialAppState, navItems, projectionBatch } from "./state/appState";
import { Bootstrap } from "./routes/Bootstrap";
import { GitHubImport } from "./routes/GitHubImport";
import { CalendarPreview } from "./routes/CalendarPreview";
import { NextAction } from "./routes/NextAction";
import { PlanInspector } from "./routes/PlanInspector";
import { LogReview } from "./routes/LogReview";
import { ProjectionPreview } from "./routes/ProjectionPreview";
import { Reports } from "./routes/Reports";
import { Settings } from "./routes/Settings";

export type RouteId =
  | "bootstrap"
  | "github-import"
  | "calendar"
  | "next-action"
  | "plan"
  | "logs"
  | "projection"
  | "reports"
  | "settings";

function App() {
  const [route, setRoute] = useState<RouteId>("next-action");
  const [sessionReady, setSessionReady] = useState(false);

  const state = useMemo(
    () => ({
      ...initialAppState,
      bootstrapSteps,
      importSummary,
      projectionBatch,
      sessionReady
    }),
    [sessionReady]
  );

  return (
    <Layout activeRoute={route} navItems={navItems} onNavigate={setRoute}>
      {route === "bootstrap" && <Bootstrap steps={state.bootstrapSteps} onContinue={() => setRoute("github-import")} />}
      {route === "github-import" && (
        <GitHubImport
          importSummary={state.importSummary}
          onImportComplete={() => {
            setSessionReady(true);
            setRoute("next-action");
          }}
        />
      )}
      {route === "calendar" && <CalendarPreview events={state.calendarEvents} />}
      {route === "next-action" && <NextAction task={state.nextTask} plan={state.plan} onInspectPlan={() => setRoute("plan")} />}
      {route === "plan" && <PlanInspector plan={state.plan} />}
      {route === "logs" && <LogReview entries={state.logEntries} />}
      {route === "projection" && <ProjectionPreview batch={state.projectionBatch} />}
      {route === "reports" && <Reports reports={state.reports} />}
      {route === "settings" && <Settings sessionReady={state.sessionReady} onSessionReady={setSessionReady} />}
    </Layout>
  );
}

export default App;

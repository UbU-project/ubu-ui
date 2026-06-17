import { useState } from "react";

import { Layout } from "./components/Layout";
import { Bootstrap } from "./routes/Bootstrap";
import { CalendarPreview } from "./routes/CalendarPreview";
import { NextAction } from "./routes/NextAction";
import { Onboarding } from "./routes/Onboarding";
import { ProjectionPreview } from "./routes/ProjectionPreview";
import type { BootstrapSelectedRepo } from "./api/client";
import type { NavItem } from "./state/appState";

export type RouteId = "onboarding" | "bootstrap" | "next-task" | "calendar" | "projection";

const navItems: NavItem[] = [
  { id: "onboarding", label: "Onboarding" },
  { id: "bootstrap", label: "Bootstrap" },
  { id: "next-task", label: "Next Task" },
  { id: "calendar", label: "Calendar" },
  { id: "projection", label: "Projection" }
];

function App() {
  const [route, setRoute] = useState<RouteId>("onboarding");
  const [sessionReady, setSessionReady] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<BootstrapSelectedRepo | null>(null);

  function completeOnboarding(repo: BootstrapSelectedRepo) {
    setSelectedRepo(repo);
    setSessionReady(true);
    setRoute("bootstrap");
  }

  return (
    <Layout activeRoute={route} navItems={navItems} onNavigate={setRoute}>
      {route === "onboarding" && <Onboarding sessionReady={sessionReady} onComplete={completeOnboarding} />}
      {route === "bootstrap" && selectedRepo && <Bootstrap selectedRepo={selectedRepo} onComplete={() => setRoute("next-task")} />}
      {route === "bootstrap" && !selectedRepo && (
        <section className="route-stack">
          <div>
            <div className="section-kicker">Bootstrap</div>
            <h1>Connect desktop session first</h1>
            <p className="muted">Paste a GitHub token and choose a repository before seeding the workspace.</p>
          </div>
          <button type="button" className="primary-action fit" onClick={() => setRoute("onboarding")}>
            Back to onboarding
          </button>
        </section>
      )}
      {route === "next-task" && <NextAction />}
      {route === "calendar" && <CalendarPreview />}
      {route === "projection" && <ProjectionPreview selectedRepo={selectedRepo} />}
    </Layout>
  );
}

export default App;

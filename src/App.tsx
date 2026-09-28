import { useState } from "react";

import { Layout } from "./components/Layout";
import { Bootstrap } from "./routes/Bootstrap";
import { Calendar } from "./routes/Calendar";
import { NextAction } from "./routes/NextAction";
import { Onboarding } from "./routes/Onboarding";
import { Tasks } from "./routes/Tasks";
import { Today } from "./routes/Today";
import type { BootstrapSelectedRepo } from "./api/client";
import type { NavItem } from "./state/appState";

export type RouteId = "today" | "next-task" | "tasks" | "priorities" | "calendar" | "setup";

const navItems: NavItem[] = [
  { id: "today", label: "Today" },
  { id: "next-task", label: "Next Task" },
  { id: "tasks", label: "Tasks" },
  { id: "priorities", label: "Priorities" },
  { id: "calendar", label: "Calendar" },
  { id: "setup", label: "Setup" }
];

function App() {
  const [route, setRoute] = useState<RouteId>("today");
  const [sessionReady, setSessionReady] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<BootstrapSelectedRepo | null>(null);

  function completeOnboarding(repo: BootstrapSelectedRepo) {
    setSelectedRepo(repo);
    setSessionReady(true);
  }

  return (
    <Layout activeRoute={route} navItems={navItems} onNavigate={setRoute}>
      {route === "today" && <Today />}
      {route === "next-task" && <NextAction />}
      {route === "tasks" && <Tasks />}
      {route === "priorities" && (
        <section className="route-stack">
          <div>
            <div className="section-kicker">Priorities</div>
            <h1>Priorities</h1>
            <p className="muted">Pairwise Preferences between Tasks.</p>
          </div>
        </section>
      )}
      {route === "calendar" && <Calendar selectedRepo={selectedRepo} />}
      {route === "setup" && !selectedRepo && <Onboarding sessionReady={sessionReady} onComplete={completeOnboarding} />}
      {route === "setup" && selectedRepo && <Bootstrap selectedRepo={selectedRepo} onComplete={() => setRoute("next-task")} />}
    </Layout>
  );
}

export default App;

import { useState } from "react";

import { Layout } from "./components/Layout";
import { Bootstrap } from "./routes/Bootstrap";
import { Onboarding } from "./routes/Onboarding";
import type { BootstrapSelectedRepo } from "./api/client";
import type { NavItem } from "./state/appState";

export type RouteId = "onboarding" | "bootstrap";

const navItems: NavItem[] = [
  { id: "onboarding", label: "Onboarding" },
  { id: "bootstrap", label: "Bootstrap" }
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
      {route === "bootstrap" && selectedRepo && <Bootstrap selectedRepo={selectedRepo} />}
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
    </Layout>
  );
}

export default App;

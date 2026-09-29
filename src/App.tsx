import { useState } from "react";

import { Layout } from "./components/Layout";
import { Calendar } from "./routes/Calendar";
import { GitHub } from "./routes/GitHub";
import { NextAction } from "./routes/NextAction";
import { Priorities } from "./routes/Priorities";
import { Review } from "./routes/Review";
import { Routines } from "./routes/Routines";
import { Setup } from "./routes/Setup";
import { Tasks } from "./routes/Tasks";
import { Today } from "./routes/Today";
import type { NavItem } from "./state/appState";

export type RouteId = "today" | "next-task" | "tasks" | "priorities" | "routines" | "review" | "calendar" | "github" | "setup";

const navItems: NavItem[] = [
  { id: "today", label: "Today" },
  { id: "next-task", label: "Next Task" },
  { id: "tasks", label: "Tasks" },
  { id: "priorities", label: "Priorities" },
  { id: "routines", label: "Routines" },
  { id: "review", label: "Review" },
  { id: "calendar", label: "Calendar" },
  { id: "github", label: "GitHub" },
  { id: "setup", label: "Setup" }
];

function App() {
  const [route, setRoute] = useState<RouteId>("today");
  // Setup owns the desktop session and the selected repository. Once opened it
  // stays mounted, hidden, so leaving the screen does not forget them.
  const [googleCalendarEnabled, setGoogleCalendarEnabled] = useState(false);
  const [setupOpened, setSetupOpened] = useState(false);

  function navigate(next: RouteId) {
    if (next === "setup") {
      setSetupOpened(true);
    }
    setRoute(next);
  }

  return (
    <Layout activeRoute={route} navItems={navItems} onNavigate={navigate}>
      {route === "today" && <Today />}
      {route === "next-task" && <NextAction />}
      {route === "tasks" && <Tasks />}
      {route === "priorities" && <Priorities />}
      {route === "routines" && <Routines />}
      {route === "review" && <Review onOpenSetup={() => navigate("setup")} />}
      {route === "calendar" && <Calendar sessionEnabled={googleCalendarEnabled} onOpenSetup={() => navigate("setup")} onSessionDisabled={() => setGoogleCalendarEnabled(false)} />}
      {route === "github" && <GitHub selectedRepo={null} />}
      {setupOpened && (
        <div hidden={route !== "setup"}>
          <Setup googleCalendarEnabled={googleCalendarEnabled} onGoogleCalendarEnabled={setGoogleCalendarEnabled} />
        </div>
      )}
    </Layout>
  );
}

export default App;

import { useState } from "react";

import { getOrchestratorBaseUrl, orchestratorClient } from "../api/client";
import { CALENDAR_CURRENT_PATH, HEALTH_PATH, TASK_LIST_PATH } from "../api/endpoints";
import { StatusBadge } from "./StatusBadge";

type Outcome = { request: string; answered: boolean; detail: string };

// Three reads, and nothing else. Each leaves every table of the store as it was.
// The Calendar preview is deliberately not one of them: that GET stores a preview record.
const READS: Array<{ request: string; run: () => Promise<string> }> = [
  {
    request: `GET ${HEALTH_PATH}`,
    run: async () => {
      const { data } = await orchestratorClient.health();
      return `status ${data.status}, version ${data.version}, bind policy ${data.bind_policy}`;
    }
  },
  {
    request: `GET ${TASK_LIST_PATH}?status=active`,
    run: async () => {
      const { data } = await orchestratorClient.listTasks("active");
      return `${data.tasks.length} active ${data.tasks.length === 1 ? "Task" : "Tasks"}`;
    }
  },
  {
    request: `GET ${CALENDAR_CURRENT_PATH}`,
    run: async () => {
      const { data } = await orchestratorClient.currentCalendar();
      return data.plan_id ? `the current Plan has ${data.steps.length} ${data.steps.length === 1 ? "step" : "steps"}` : "there is no Plan yet";
    }
  }
];

// What this proves is the one layer the scenario runner cannot see: that a
// request made in the shell, through the Tauri transport and its capability
// scope, reaches a running orchestrator and its answer comes back.
export function SelfCheck() {
  const baseUrl = getOrchestratorBaseUrl();
  const [running, setRunning] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);

  async function run() {
    setRunning(true);
    setOutcomes(null);
    const results: Outcome[] = [];
    // One after another, and every one is attempted: a failure says which layer it was.
    for (const read of READS) {
      try {
        results.push({ request: read.request, answered: true, detail: await read.run() });
      } catch (error) {
        results.push({ request: read.request, answered: false, detail: error instanceof Error ? error.message : String(error) });
      }
    }
    setOutcomes(results);
    setRunning(false);
  }

  const answered = outcomes?.filter((outcome) => outcome.answered).length ?? 0;

  return (
    <section className="settings-panel" aria-labelledby="self-check-heading">
      <div className="title-row">
        <h2 id="self-check-heading">Self-check</h2>
        {outcomes && (
          <StatusBadge
            label={`${answered} of ${outcomes.length} reads answered`}
            tone={answered === outcomes.length ? "success" : "danger"}
          />
        )}
      </div>
      <p>
        Makes three read-only requests to <code>{baseUrl}</code> through the app's own transport. It writes nothing: no Task, Plan,
        Setting, preview or calendar is created or changed.
      </p>
      <button type="button" className="primary-action fit" disabled={running} onClick={() => void run()}>
        {running ? "Checking" : "Run self-check"}
      </button>
      {outcomes && (
        <ol aria-label="Self-check results">
          {outcomes.map((outcome) => (
            <li key={outcome.request}>
              <code>{outcome.request}</code>: {outcome.answered ? "answered" : "failed"}. {outcome.detail}
            </li>
          ))}
        </ol>
      )}
      {outcomes && <p>Three reads were attempted and nothing was written.</p>}
    </section>
  );
}

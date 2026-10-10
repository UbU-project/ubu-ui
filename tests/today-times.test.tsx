import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "../src/App";

// The client's only transport is the Tauri HTTP plugin, so that is what is mocked.
const pluginFetch = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: pluginFetch }));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Invented, and reading as invented. The numeric `start` and `end` are deliberately not the instants
// beside them: a screen that formats the number shows something other than what is asserted here.
const NIGHT = {
  index: 0, task_id: "task_018f3c8e9b2a7c4d8f1e2a3b4c5d6e70", summary: "Synthetic night", start: 111, end: 222,
  start_at: "2026-10-02T03:00:00Z", end_at: "2026-10-02T11:00:00Z", depends_on: [], static_anchor: true, placement_authority: "static_window", occupies_capacity: true
};
const FERN = {
  index: 1, task_id: "task_018f3c8e9b2a7c4d8f1e2a3b4c5d6e71", summary: "Synthetic: repot the plastic fern", start: 1_790_000_000, end: 1_790_001_200,
  start_at: "2026-10-02T13:15:00Z", end_at: "2026-10-02T13:45:00Z", depends_on: [], static_anchor: false, placement_authority: "planner", occupies_capacity: true
};
const RAGGED = { ...FERN, index: 2, task_id: "task_018f3c8e9b2a7c4d8f1e2a3b4c5d6e72", summary: "Synthetic: sort the button jar", start_at: "2026-10-02T13:45:00Z", end_at: "2026-10-02T14:07:41Z" };

function stub(steps: unknown[]) {
  pluginFetch.mockImplementation(async (input: RequestInfo | URL) => {
    const url = new URL(input.toString());
    expect(url.origin).toBe("http://127.0.0.1:7878");
    if (url.pathname === "/affect/observation") return json({ schema_version: "ubu.orchestrator.affect_observation.v1", observation: null });
    if (url.pathname === "/calendar/current") return json({ plan_id: null, steps: [], alternatives: [] });
    if (url.pathname === "/planning/generate") {
      return json({
        schema_version: "planning-kernel-contract/0.1", request_id: "synthetic-request", status: "ok",
        plan: { id: "plan_018f3c8e9b2a7c4d8f1e2a3b4c5d6e70", status: "admitted", steps, created_at: "2026-10-01T20:00:00Z" },
        alternatives: [], unplaced_tasks: [], diagnostics: []
      });
    }
    throw new Error(`unexpected request: ${url.pathname}`);
  });
}
async function generate(steps: unknown[], first: string) {
  stub(steps);
  render(<App />);
  await screen.findByRole("heading", { name: "No timed Plan available" });
  fireEvent.click(screen.getByRole("button", { name: "Generate Plan" }));
  await screen.findByRole("heading", { name: first });
}
function window(title: string) {
  const placement = screen.getByRole("heading", { name: title }).closest(".calendar-step") as HTMLElement;
  return Array.from(placement.querySelectorAll<HTMLTimeElement>(".calendar-step-time time")).map((time) => ({ text: time.textContent, dateTime: time.getAttribute("datetime") }));
}

describe("Today shows the real times", () => {
  const zone = process.env.TZ;
  beforeEach(() => {
    // The operator's timezone is the process's. Four hours behind UTC on these dates.
    process.env.TZ = "America/New_York";
  });
  afterEach(() => {
    pluginFetch.mockReset();
    if (zone === undefined) delete process.env.TZ;
    else process.env.TZ = zone;
  });

  it("109: a Dynamic placement renders its start_at and end_at as those instants in local time, and dateTime carries the ISO string", async () => {
    await generate([FERN], FERN.summary);
    expect(window(FERN.summary)).toEqual([
      { text: "Fri, Oct 2, 9:15 AM", dateTime: "2026-10-02T13:15:00Z" },
      { text: "Fri, Oct 2, 9:45 AM", dateTime: "2026-10-02T13:45:00Z" }
    ]);
    const placement = screen.getByRole("heading", { name: FERN.summary }).closest(".calendar-step") as HTMLElement;
    expect(within(placement).getByText("Skeleton")).toBeInTheDocument();
    expect(screen.getByText("Each placement shows when it starts and when it ends, in your timezone, America/New_York.")).toBeInTheDocument();
  });

  it("110: a Static anchor renders the same way, and a window that crosses midnight shows both days", async () => {
    await generate([NIGHT, FERN], NIGHT.summary);
    expect(window(NIGHT.summary)).toEqual([
      { text: "Thu, Oct 1, 11:00 PM", dateTime: "2026-10-02T03:00:00Z" },
      { text: "Fri, Oct 2, 7:00 AM", dateTime: "2026-10-02T11:00:00Z" }
    ]);
    const placement = screen.getByRole("heading", { name: NIGHT.summary }).closest(".calendar-step") as HTMLElement;
    expect(within(placement).getByText("Static anchor")).toBeInTheDocument();
  });

  it("111: the numeric start and end are never shown, whatever they are", async () => {
    await generate([NIGHT, FERN], NIGHT.summary);
    const calendar = document.querySelector(".compact-calendar") as HTMLElement;
    // Every time on the screen comes from the ISO strings. The numbers 111 and 222 would read as
    // `minute 111` under the formatter this screen used to have, and as January 1970 under any other.
    for (const time of Array.from(calendar.querySelectorAll("time"))) {
      expect(Date.parse(time.getAttribute("datetime") as string)).toBeGreaterThan(Date.parse("2026-10-01T00:00:00Z"));
    }
    expect(calendar).not.toHaveTextContent(/minute \d/);
    expect(calendar).not.toHaveTextContent(/Jan|1970|111|222|1790000000/);
    // And nothing in the screen's source formats a planner coordinate. The one use of `start` left is the sort.
    const source = readFileSync(resolve(__dirname, "../src/routes/Today.tsx"), "utf8");
    expect(source).not.toContain("formatMinuteTimestamp");
    expect(source).not.toContain("60_000");
    const numeric = source.split("\n").filter((line) => /\bstep\.(start|end)\b|\.(start|end)\b(?!_at)/.test(line));
    expect(numeric).toHaveLength(1);
    expect(numeric[0]).toContain("left.start - right.start");
  });

  it("112: the times are local, so the same instants read differently in another timezone", async () => {
    process.env.TZ = "Asia/Karachi";
    await generate([NIGHT], NIGHT.summary);
    expect(window(NIGHT.summary)).toEqual([
      { text: "Fri, Oct 2, 8:00 AM", dateTime: "2026-10-02T03:00:00Z" },
      { text: "Fri, Oct 2, 4:00 PM", dateTime: "2026-10-02T11:00:00Z" }
    ]);
    expect(screen.getByText("Each placement shows when it starts and when it ends, in your timezone, Asia/Karachi.")).toBeInTheDocument();
  });

  it("113: an instant that is not on a whole minute shows its seconds, and one that is does not", async () => {
    await generate([RAGGED], RAGGED.summary);
    expect(window(RAGGED.summary)).toEqual([
      { text: "Fri, Oct 2, 9:45 AM", dateTime: "2026-10-02T13:45:00Z" },
      { text: "Fri, Oct 2, 10:07:41 AM", dateTime: "2026-10-02T14:07:41Z" }
    ]);
  });
});


describe("P1B-62 the Plan counts its placements", () => {
  afterEach(() => pluginFetch.mockReset());
  for (const [name, steps, skeleton, anchors] of [
    ["mixed", [NIGHT, FERN, RAGGED], 2, 1],
    ["all Skeleton", [FERN, RAGGED], 2, 0],
    ["all Static", [NIGHT], 0, 1],
  ] as const) it(`counts ${name} placements and agrees with the actual badge oracle`, async () => {
    await generate([...steps], steps[0].summary);
    const summary=screen.getByLabelText("Placement counts");
    expect(summary).toHaveTextContent(`Placements: ${steps.length}. Skeleton ${skeleton}, Static anchor ${anchors}.`);
    const calendar=document.querySelector(".compact-calendar") as HTMLElement;
    const actualSkeleton=within(calendar).queryAllByText("Skeleton",{exact:true}).length;
    const actualAnchors=within(calendar).queryAllByText("Static anchor",{exact:true}).length;
    expect(actualSkeleton).toBe(skeleton);expect(actualAnchors).toBe(anchors);
    expect(actualSkeleton+actualAnchors).toBe(steps.length);
  });
  it("an empty Plan says so once without three zero counts", async () => {
    stub([]);render(<App />);await screen.findByRole("heading",{name:"No timed Plan available"});
    expect(screen.getAllByText("No timed Plan available")).toHaveLength(1);
    expect(screen.queryByLabelText("Placement counts")).not.toBeInTheDocument();
  });
});

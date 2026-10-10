import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../src/App";
import type { TimeByCategoryResponse } from "../src/api/client";
import { shares } from "../src/components/TimeByCategory";

// The client's only transport is the Tauri HTTP plugin, so that is what is mocked.
const pluginFetch = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: pluginFetch }));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const FROM = "2026-09-23T08:00:00Z";
const TO = "2026-09-30T08:00:00Z";

function report(fields: Partial<TimeByCategoryResponse> = {}): TimeByCategoryResponse {
  return {
    schema_version: "ubu.orchestrator.time_by_category.v1",
    generated_at: TO,
    from: FROM,
    to: TO,
    // The orchestrator's order: seconds descending, then category ascending. Not alphabetical.
    categories: [
      { category: "work", seconds: 9_000, static_seconds: 9_000, completed_seconds: 0, task_count: 2 },
      { category: "grocery", seconds: 3_600, static_seconds: 0, completed_seconds: 3_600, task_count: 2 },
      { category: "Uncategorized", seconds: 1_800, static_seconds: 1_800, completed_seconds: 0, task_count: 1 },
      { category: "personal", seconds: 1_800, static_seconds: 0, completed_seconds: 1_800, task_count: 1 }
    ],
    unmeasured: [],
    total_seconds: 16_200,
    ...fields
  };
}

// Every request is answered here; anything unexpected fails the test rather than reaching a network.
function stubOrchestrator(answer: () => TimeByCategoryResponse) {
  const urls: string[] = [];
  pluginFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString());
    expect(url.origin).toBe("http://127.0.0.1:7878");
    expect(init?.method ?? "GET").toBe("GET");
    urls.push(input.toString());
    if (url.pathname === "/affect/observation") return json({ schema_version: "ubu.orchestrator.affect_observation.v1", observation: null });
    if (url.pathname === "/calendar/current") return json({ plan_id: null, steps: [], alternatives: [] });
    if (url.pathname === "/reports/time-by-category") return json(answer());
    throw new Error(`unexpected request: ${url.pathname}`);
  });
  return urls;
}

async function openReport() {
  render(<App />);
  await screen.findByRole("heading", { name: "No timed Plan available" });
  const panel = screen.getByRole("heading", { name: "Time by category" }).closest("section") as HTMLElement;
  fireEvent.click(within(panel).getByRole("button", { name: "Show report" }));
  return panel;
}

function rows(panel: HTMLElement) {
  const table = within(panel).getByRole("table", { name: "Time by category" });
  return within(within(table).getAllByRole("rowgroup")[1])
    .getAllByRole("row")
    .map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent).concat(within(row).getByRole("rowheader").textContent));
}

describe("Time by category on Today", () => {
  afterEach(() => {
    pluginFetch.mockReset();
  });

  it("86: rows render in the orchestrator's order, with hours and minutes rather than seconds", async () => {
    stubOrchestrator(() => report());
    const panel = await openReport();
    await within(panel).findByRole("table", { name: "Time by category" });
    expect(rows(panel)).toEqual([
      ["2 h 30 min", "56%", "2", "work"],
      ["1 h", "22%", "2", "grocery"],
      ["30 min", "11%", "1", "Uncategorized"],
      ["30 min", "11%", "1", "personal"]
    ]);
    expect(panel).not.toHaveTextContent("9000");
    const foot = within(within(panel).getByRole("table")).getAllByRole("rowgroup")[2];
    expect(foot).toHaveTextContent("Total4 h 30 min100%6");
  });

  it("87: the shares sum to the whole", async () => {
    // 1/3 each would round to 33 three times; the largest remainders take the leftover point.
    const thirds = [
      { category: "a", seconds: 100, static_seconds: 100, completed_seconds: 0, task_count: 1 },
      { category: "b", seconds: 100, static_seconds: 100, completed_seconds: 0, task_count: 1 },
      { category: "c", seconds: 100, static_seconds: 100, completed_seconds: 0, task_count: 1 }
    ];
    stubOrchestrator(() => report({ categories: thirds, total_seconds: 300 }));
    const panel = await openReport();
    await within(panel).findByRole("table", { name: "Time by category" });
    const percentages = rows(panel).map((row) => Number(String(row[1]).replace("%", "")));
    expect(percentages.reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(percentages).toEqual([34, 33, 33]);
    // The rule itself, on the awkward cases.
    expect(shares([1, 1, 1]).reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(shares([7, 7, 7, 7, 7, 7, 7]).reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(shares([9_000, 3_600, 1_800, 1_800])).toEqual([56, 22, 11, 11]);
    expect(shares([0, 0])).toEqual([0, 0]);
    expect(shares([5])).toEqual([100]);
  });

  it("88: Uncategorized is a row like any other", async () => {
    stubOrchestrator(() => report());
    const panel = await openReport();
    await within(panel).findByRole("table", { name: "Time by category" });
    const row = within(panel).getByRole("rowheader", { name: "Uncategorized" }).closest("tr") as HTMLElement;
    expect(within(row).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["30 min", "11%", "1"]);
    // Between work and personal, where its seconds put it; not last, not hidden, not folded away.
    expect(rows(panel).map((row) => row[3])).toEqual(["work", "grocery", "Uncategorized", "personal"]);
  });

  it("89: unmeasured work is named, Task by Task, with the reason", async () => {
    const reason = "completed with no observed window and no duration estimate; the time it took is not recorded";
    stubOrchestrator(() =>
      report({
        unmeasured: [
          { task_id: "task_synthetic_a", title: "Synthetic phone call", reason },
          { task_id: "task_synthetic_b", title: "Synthetic errand", reason }
        ]
      })
    );
    const panel = await openReport();
    const list = await within(panel).findByRole("list", { name: "Unmeasured Tasks" });
    expect(within(panel).getByRole("heading", { name: "Happened, but could not be measured" })).toBeInTheDocument();
    const items = within(list).getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toEqual([
      `Synthetic phone call (task_synthetic_a): ${reason}`,
      `Synthetic errand (task_synthetic_b): ${reason}`
    ]);
    // Named, never counted.
    expect(panel).not.toHaveTextContent("2 unmeasured");
  });

  it("90: an empty range reads as empty, not as a failure", async () => {
    stubOrchestrator(() => report({ categories: [], unmeasured: [], total_seconds: 0 }));
    const panel = await openReport();
    expect(await within(panel).findByText(/^No recorded time between .* and .*: no Static window fell inside the range and no Dynamic Task was completed in it\.$/)).toBeInTheDocument();
    expect(within(panel).queryByRole("table")).not.toBeInTheDocument();
    expect(within(panel).queryByRole("alert")).not.toBeInTheDocument();
    expect(panel.querySelector(".error-text, .diagnostics-list")).toBeNull();
    expect(within(panel).getByRole("button", { name: "Reload report" })).toBeEnabled();
  });

  it("91: the default range is stated, sent as the orchestrator's default, and another span names its start", async () => {
    const urls = stubOrchestrator(() => report());
    render(<App />);
    await screen.findByRole("heading", { name: "No timed Plan available" });
    const panel = screen.getByRole("heading", { name: "Time by category" }).closest("section") as HTMLElement;
    // Nothing is asked for until the operator asks; the observation and current calendar are read on entry.
    expect([...urls].sort()).toEqual(["http://127.0.0.1:7878/affect/observation", "http://127.0.0.1:7878/calendar/current"]);
    expect(within(panel).getByText("Not loaded yet. The report covers the last 7 days ending now unless another span is entered.")).toBeInTheDocument();
    expect(within(panel).getByLabelText("Last")).toHaveValue(7);

    fireEvent.click(within(panel).getByRole("button", { name: "Show report" }));
    await within(panel).findByRole("table", { name: "Time by category" });
    // Seven days is the orchestrator's own default, so no bound is sent.
    expect(urls[2]).toBe("http://127.0.0.1:7878/reports/time-by-category?schema_version=ubu.orchestrator.time_by_category.v1");
    const stated = within(panel).getByText(/^Showing the last 7 days: .* to .*\.$/);
    expect(stated).toBeInTheDocument();

    fireEvent.change(within(panel).getByLabelText("Last"), { target: { value: "30" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Reload report" }));
    await within(panel).findByText(/^Showing the last 30 days: /);
    const sent = new URL(urls[3]);
    expect(sent.pathname).toBe("/reports/time-by-category");
    expect(sent.searchParams.get("to")).toBeNull();
    const from = new Date(sent.searchParams.get("from") as string).getTime();
    expect(Date.now() - from).toBeGreaterThan(30 * 86_400_000 - 60_000);
    expect(Date.now() - from).toBeLessThan(30 * 86_400_000 + 60_000);
  });
});

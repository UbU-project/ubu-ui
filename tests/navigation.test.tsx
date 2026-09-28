import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../src/App";
import { getOrchestratorBaseUrl } from "../src/api/endpoints";

// The client's only transport is the Tauri HTTP plugin, so that is what is mocked.
const pluginFetch = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: pluginFetch }));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function stubOrchestrator() {
  const urls: string[] = [];
  pluginFetch.mockImplementation(async (input: RequestInfo | URL) => {
    const url = new URL(input.toString());
    urls.push(input.toString());
    if (url.pathname === "/calendar/current") {
      return json({ plan_id: null, steps: [], alternatives: [] });
    }
    if (url.pathname === "/health") {
      return json({ status: "ok", version: "0.1.0", bind_policy: "127.0.0.1_only" });
    }
    throw new Error(`unexpected request: ${url.pathname}`);
  });
  return urls;
}

describe("front door", () => {
  afterEach(() => {
    pluginFetch.mockReset();
    vi.unstubAllEnvs();
  });

  it("renders Today by default and lists the seven screens in order", async () => {
    const urls = stubOrchestrator();

    render(<App />);

    expect(await screen.findByRole("heading", { name: "No timed Plan available" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Compact Calendar" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(nav).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Today",
      "Next Task",
      "Tasks",
      "Priorities",
      "Calendar",
      "GitHub",
      "Setup"
    ]);
    expect(within(nav).getByRole("button", { name: "Today" })).toHaveClass("active");
    // Nothing about GitHub is asked for, or requested, on the way in.
    expect(screen.queryByLabelText("GitHub personal access token")).not.toBeInTheDocument();
    expect(urls).toEqual(["http://127.0.0.1:7878/calendar/current"]);
  });

  it("resolves the orchestrator's own default port when nothing overrides it", () => {
    vi.stubEnv("VITE_UBU_ORCHESTRATOR_URL", undefined);
    vi.stubEnv("VITE_UBU_ORCHESTRATOR_PORT", undefined);

    expect(getOrchestratorBaseUrl()).toBe("http://127.0.0.1:7878");
  });

  it("shows the resolved base URL and the health status in Setup", async () => {
    const urls = stubOrchestrator();

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Setup" }));

    const card = (await screen.findByRole("heading", { name: "Orchestrator" })).closest(".settings-panel") as HTMLElement;
    expect(within(card).getByText("http://127.0.0.1:7878")).toBeInTheDocument();
    expect(await within(card).findByText("health: ok")).toBeInTheDocument();
    expect(within(card).getByText("0.1.0")).toBeInTheDocument();
    expect(within(card).getByText("127.0.0.1_only")).toBeInTheDocument();
    expect(urls).toContain("http://127.0.0.1:7878/health");
  });
});

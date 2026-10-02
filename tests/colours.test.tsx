import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { settingsFixture } from "./fixtures/settings";
import type { SettingsResponse } from "../src/api/client";

const pluginFetch = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: pluginFetch }));
type Recorded = { method: string; path: string; body: unknown };
let unexpected: Recorded[] = [];
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
function stub(list: () => SettingsResponse, write?: (request: Recorded) => Response) {
  const requests: Recorded[] = [];
  unexpected = [];
  pluginFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString());
    expect(url.origin).toBe("http://127.0.0.1:7878");
    const request = { method: init?.method ?? "GET", path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : null };
    requests.push(request);
    if (request.method === "GET" && request.path === "/calendar/current") return json({ plan_id: null, steps: [], alternatives: [] });
    if (request.method === "GET" && request.path === "/health") return json({ status: "ok", version: "synthetic", bind_policy: "127.0.0.1_only" });
    if (request.method === "GET" && request.path === "/settings") return json(list());
    if (request.path === "/setting/calendar.color.work" && write) return write(request);
    unexpected.push(request);
    throw new Error(`Unexpected synthetic request: ${request.method} ${request.path}`);
  });
  return requests;
}
async function openColours() {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Setup" }));
  return await screen.findByRole("table", { name: "Effective category palette" });
}

describe("Colours settings", () => {
  afterEach(() => {
    expect(unexpected).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    pluginFetch.mockReset();
  });

  it("31: renders every category with a swatch, colour id and effective origin", async () => {
    const body = settingsFixture({ work: { color_id: "6", origin: "file" }, personal: { color_id: "3", origin: "setting" } });
    stub(() => body);
    const table = await openColours();
    expect(within(table).getAllByRole("row")).toHaveLength(12);
    for (const entry of body.palette) {
      const row = within(table).getByRole("row", { name: `Category ${entry.category}` });
      expect(within(row).getByRole("rowheader")).toHaveTextContent(entry.category);
      expect(within(row).getByRole("img", { name: `Colour ${entry.color_id}` })).toBeInTheDocument();
      expect(within(row).getByText(entry.color_id, { selector: "td" })).toBeInTheDocument();
      expect(within(row).getByText(entry.origin)).toBeInTheDocument();
    }
    expect(screen.getByText("Changes take effect on the next Calendar preview and the next capture, with no restart. Check the inverse mapping before bootstrapping from your calendar.")).toBeInTheDocument();
  });

  it("32: PUTs a colour, reloads its origin, and displays the allowed ids on rejection", async () => {
    let body = settingsFixture();
    const reason = "Colour must be a string with one of the allowed ids: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11";
    const requests = stub(() => body, (request) => {
      if ((request.body as { value: string }).value === "6") {
        body = settingsFixture({ work: { color_id: "6", origin: "setting" } });
        return json({ schema_version: "ubu.orchestrator.setting.v1", setting_id: "setting_synthetic_work", version: 1 });
      }
      return json({ error: reason, diagnostics: [{ code: "setting_invalid_color", message: reason }] }, 400);
    });
    await openColours();
    fireEvent.change(screen.getByLabelText("Colour id for work"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Save work colour" }));
    await waitFor(() => expect(within(screen.getByRole("row", { name: "Category work" })).getByText("setting")).toBeInTheDocument());
    expect(requests.find((request) => request.method === "PUT")).toEqual({ method: "PUT", path: "/setting/calendar.color.work", body: { schema_version: "ubu.orchestrator.setting.v1", value: "6" } });
    expect(requests.filter((request) => request.path === "/settings")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Colour id for work"), { target: { value: "99" } });
    fireEvent.click(screen.getByRole("button", { name: "Save work colour" }));
    expect(await screen.findByText("setting_invalid_color")).toBeInTheDocument();
    expect(screen.getAllByText(reason)).toHaveLength(2);
    expect(requests.at(-1)?.body).toEqual({ schema_version: "ubu.orchestrator.setting.v1", value: "99" });
    expect(screen.getByLabelText("Colour id for work")).toHaveValue("99");
    expect(within(screen.getByRole("row", { name: "Category work" })).getByText("6", { selector: "td" })).toBeInTheDocument();
  });

  it("33: DELETEs the override then shows the fallback value and origin", async () => {
    let body = settingsFixture({ work: { color_id: "1", origin: "setting" } });
    const requests = stub(() => body, () => {
      body = settingsFixture({ work: { color_id: "6", origin: "file" } });
      return new Response(null, { status: 204 });
    });
    await openColours();
    fireEvent.click(screen.getByRole("button", { name: "Revert work colour" }));
    await waitFor(() => expect(within(screen.getByRole("row", { name: "Category work" })).getByText("file")).toBeInTheDocument());
    expect(screen.getByLabelText("Colour id for work")).toHaveValue("6");
    expect(screen.getByRole("button", { name: "Revert work colour" })).toBeDisabled();
    expect(requests.find((request) => request.method === "DELETE")).toEqual({ method: "DELETE", path: "/setting/calendar.color.work", body: null });
    expect(requests.filter((request) => request.path === "/settings")).toHaveLength(2);
  });

  it("34: makes an inverse collision explicit and names both categories", async () => {
    stub(() => settingsFixture({ work: { color_id: "1", origin: "setting" } }));
    await openColours();
    const inverse = screen.getByRole("table", { name: "Inverse colour mapping" });
    expect(within(inverse).getAllByRole("row")).toHaveLength(12);
    const row = within(inverse).getByRole("row", { name: "Inverse colour 1" });
    expect(within(row).getByText("Collision: entertainment, work — no category assigned.")).toBeInTheDocument();
  });

  it("35: shows every allowed unmapped colour instead of omitting it", async () => {
    stub(() => settingsFixture({ work: { color_id: "1", origin: "setting" } }));
    await openColours();
    const inverse = screen.getByRole("table", { name: "Inverse colour mapping" });
    const row = within(inverse).getByRole("row", { name: "Inverse colour 9" });
    expect(within(row).getByText("Unmapped — no category assigned.")).toBeInTheDocument();
    expect(within(row).getByText("9", { selector: "td" })).toBeInTheDocument();
    for (let id = 1; id <= 11; id += 1) expect(within(inverse).getByRole("row", { name: `Inverse colour ${id}` })).toBeInTheDocument();
  });

  it("118: the default palette has a sleep row in Graphite and no location row, and colour 8 maps to sleep alone", async () => {
    stub(() => settingsFixture());
    const table = await openColours();
    const row = within(table).getByRole("row", { name: "Category sleep" });
    expect(within(row).getByRole("img", { name: "Colour 8" })).toBeInTheDocument();
    expect(within(row).getByText("default")).toBeInTheDocument();
    expect(within(table).queryByRole("row", { name: "Category location" })).not.toBeInTheDocument();
    const inverse = screen.getByRole("table", { name: "Inverse colour mapping" });
    const graphite = within(inverse).getByRole("row", { name: "Inverse colour 8" });
    expect(graphite).toHaveTextContent("sleep");
    expect(graphite).not.toHaveTextContent("Collision");
    expect(inverse).not.toHaveTextContent("Collision");
  });
});

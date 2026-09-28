import { afterEach, describe, expect, it, vi } from "vitest";

// A mock factory runs only when something in the module graph imports the mocked
// module, so which factories ran is a record of what the graph pulled in.
const loaded = vi.hoisted(() => [] as string[]);
vi.mock("@tauri-apps/plugin-http", () => {
  loaded.push("@tauri-apps/plugin-http");
  return { fetch: vi.fn() };
});
vi.mock("@tauri-apps/api/core", () => {
  loaded.push("@tauri-apps/api/core");
  return { isTauri: () => false };
});

describe("orchestrator endpoints", () => {
  afterEach(() => {
    loaded.length = 0;
    vi.resetModules();
  });

  it("imports no Tauri module, while the client that re-exports it does", async () => {
    vi.resetModules();

    const endpoints = await import("../src/api/endpoints");
    expect(endpoints.HEALTH_PATH).toBe("/health");
    expect(loaded).toEqual([]);

    // The control: the same probe does see the plugin when the transport is imported.
    const client = await import("../src/api/client");
    expect(loaded).toContain("@tauri-apps/plugin-http");
    expect(client.getOrchestratorBaseUrl).toBe(endpoints.getOrchestratorBaseUrl);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import { orchestratorClient, OrchestratorError, TRANSPORT_UNAVAILABLE_MESSAGE } from "../src/api/client";

const pluginFetch = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: pluginFetch }));

describe("orchestrator transport", () => {
  afterEach(() => {
    pluginFetch.mockReset();
  });

  it("sends a client request through the plugin fetch and never the global fetch", async () => {
    pluginFetch.mockResolvedValue(
      new Response(JSON.stringify({ schema_version: "ubu.orchestrator.task_capture.v1", task_id: "task-new", version: 1 }), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      })
    );

    const result = await orchestratorClient.captureTask({ title: "Oil the gate latch", category_tag: "home", tags: ["home"] });

    expect(result).toEqual({
      status: 201,
      data: { schema_version: "ubu.orchestrator.task_capture.v1", task_id: "task-new", version: 1 }
    });
    expect(pluginFetch).toHaveBeenCalledTimes(1);
    const [url, init] = pluginFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:7878/task");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      schema_version: "ubu.orchestrator.task_capture.v1",
      title: "Oil the gate latch",
      category_tag: "home",
      tags: ["home"]
    });
    expect(init.headers).toEqual({ Accept: "application/json", "Content-Type": "application/json" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("throws the tauri:dev error when the plugin is unavailable, without falling back", async () => {
    // What the plugin does when no Tauri runtime is behind it.
    pluginFetch.mockImplementation(async () => {
      throw new TypeError("Cannot read properties of undefined (reading 'invoke')");
    });

    const failure = await orchestratorClient.listTasks().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(OrchestratorError);
    expect((failure as OrchestratorError).message).toBe(TRANSPORT_UNAVAILABLE_MESSAGE);
    expect((failure as OrchestratorError).message).toContain("npm run tauri:dev");
    expect(pluginFetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();

    // The same holds for the real module: outside the shell it has nothing to invoke.
    const actual = await vi.importActual<typeof import("@tauri-apps/plugin-http")>("@tauri-apps/plugin-http");
    pluginFetch.mockImplementation(actual.fetch);

    await expect(orchestratorClient.health()).rejects.toThrow(TRANSPORT_UNAVAILABLE_MESSAGE);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

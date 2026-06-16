import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../src/App";

describe("UbU UI scaffold", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts on the onboarding surface for the Tauri bootstrap slice", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Connect desktop session" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Onboarding" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bootstrap" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next Task" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Calendar" })).not.toBeInTheDocument();
  });

  it("submits token intake and bootstrap seed over loopback", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        requests.push({
          url,
          body: init?.body ? JSON.parse(init.body.toString()) : null
        });

        if (url.endsWith("/desktop/session/github-token")) {
          return new Response(
            JSON.stringify({
              schema_version: "ubu.orchestrator.desktop_session.v1",
              accepted: true,
              token_available: true
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        if (url.endsWith("/bootstrap/seed")) {
          return new Response(
            JSON.stringify({
              schema_version: "ubu.orchestrator.bootstrap.v1",
              objective_ids: ["objective_1"],
              preference_ids: ["preference_1", "preference_2", "preference_3"],
              imported_tasks: {
                imported: 2,
                admitted_to_store: 2,
                candidates: []
              },
              diagnostics: [{ code: "bootstrap_seeded", message: "bootstrap state admitted through the store" }]
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        return new Response(JSON.stringify({ status: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } });
      })
    );

    render(<App />);

    fireEvent.change(screen.getByLabelText("GitHub personal access token"), { target: { value: "test-token" } });
    fireEvent.change(screen.getByLabelText("Repository"), { target: { value: "UbU-project/ubu-orchestrator" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue to bootstrap" }));

    expect(await screen.findByRole("heading", { name: "Bootstrap workspace" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Seed workspace" }));

    expect(await screen.findByText("bootstrap_seeded")).toBeInTheDocument();
    expect(screen.getByText("Objectives")).toBeInTheDocument();
    expect(screen.getByText("Preferences")).toBeInTheDocument();
    expect(screen.getByText("Tasks")).toBeInTheDocument();
    expect(requests[0].body).toMatchObject({
      schema_version: "ubu.orchestrator.desktop_session.v1",
      github_token: "test-token"
    });
    expect(requests[1].body).toMatchObject({
      schema_version: "ubu.orchestrator.bootstrap.v1",
      selected_repo: { owner: "UbU-project", repo: "ubu-orchestrator" }
    });
  });

  it("renders structured bootstrap diagnostics", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input.toString();

        if (url.endsWith("/desktop/session/github-token")) {
          return new Response(
            JSON.stringify({
              schema_version: "ubu.orchestrator.desktop_session.v1",
              accepted: true,
              token_available: true
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            error: "bootstrap-seeded state already exists; refusing to duplicate objects",
            diagnostics: [
              {
                code: "bootstrap_already_seeded",
                message: "bootstrap-seeded state already exists; refusing to duplicate objects"
              }
            ]
          }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        );
      })
    );

    render(<App />);

    fireEvent.change(screen.getByLabelText("GitHub personal access token"), { target: { value: "test-token" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue to bootstrap" }));

    expect(await screen.findByRole("heading", { name: "Bootstrap workspace" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Seed workspace" }));

    expect(await screen.findByText("bootstrap_already_seeded")).toBeInTheDocument();
    expect(screen.getAllByText("bootstrap-seeded state already exists; refusing to duplicate objects").length).toBeGreaterThan(0);
  });
});

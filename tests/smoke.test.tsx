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
    expect(screen.getByRole("button", { name: "Next Task" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Calendar" })).not.toBeInTheDocument();
  });

  it("submits token intake, seeds bootstrap, renders next Task, and records complete over loopback", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    let completed = false;
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

        if (url.includes("/next-action")) {
          if (completed) {
            return new Response(
              JSON.stringify({
                schema_version: "ubu.orchestrator.next_action.v1",
                recommendation: null,
                diagnostics: [
                  {
                    code: "no_active_tasks",
                    message: "admitted Tasks exist, but none are active",
                    blocked_task_count: 0,
                    sampled_task_ids: []
                  }
                ]
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }

          return new Response(
            JSON.stringify({
              schema_version: "ubu.orchestrator.next_action.v1",
              recommendation: {
                task_id: "task-1",
                title: "Do first",
                status: "active",
                readiness: "ready",
                parent_objective: { objective_id: "objective_1", title: "Bootstrap UbU desktop workflow" },
                source_refs: [{ source_kind: "issue", source_id: "UbU-project/ubu-orchestrator#10", url: "https://example.test/issue/10" }],
                selection: {
                  rule: "readiness_ordered_skeleton",
                  priority: 10,
                  tiebreak: "explicit priority ascending, then created_at ascending, then task_id ascending"
                },
                explanation: {
                  template_id: "readiness_based_recommendation.v1",
                  label: "readiness-based recommendation",
                  message:
                    "Readiness-based recommendation: selected a ready Task linked to parent Objective 'Bootstrap UbU desktop workflow' with 1 provenance source reference(s).",
                  readiness_state: "ready",
                  parent_objective: { objective_id: "objective_1", title: "Bootstrap UbU desktop workflow" },
                  source_refs: [{ source_kind: "issue", source_id: "UbU-project/ubu-orchestrator#10", url: "https://example.test/issue/10" }]
                }
              },
              diagnostics: []
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        if (url.endsWith("/task/task-1/action")) {
          completed = true;
          return new Response(
            JSON.stringify({
              schema_version: "ubu.orchestrator.task_action.v1",
              log_id: "log-1",
              task_id: "task-1",
              action: "complete",
              task_status: "completed",
              authority_source: "user",
              transition_applied: true,
              diagnostics: [],
              note: "done"
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

    expect(await screen.findByRole("heading", { name: "Do first" })).toBeInTheDocument();
    expect(screen.getByText("Readiness-based recommendation")).toBeInTheDocument();
    expect(screen.getByText("Bootstrap UbU desktop workflow")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "issue: UbU-project/ubu-orchestrator#10" })).toHaveAttribute("href", "https://example.test/issue/10");

    fireEvent.change(screen.getByLabelText("Action note"), { target: { value: "done" } });
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));

    expect(await screen.findByText("no_active_tasks")).toBeInTheDocument();
    expect(screen.getByText("admitted Tasks exist, but none are active")).toBeInTheDocument();
    expect(requests[0].body).toMatchObject({
      schema_version: "ubu.orchestrator.desktop_session.v1",
      github_token: "test-token"
    });
    expect(requests[1].body).toMatchObject({
      schema_version: "ubu.orchestrator.bootstrap.v1",
      selected_repo: { owner: "UbU-project", repo: "ubu-orchestrator" }
    });
    expect(requests.some((request) => request.url.includes("/next-action?schema_version=ubu.orchestrator.next_action.v1"))).toBe(true);
    expect(requests.find((request) => request.url.endsWith("/task/task-1/action"))?.body).toMatchObject({
      schema_version: "ubu.orchestrator.task_action.v1",
      action: "complete",
      note: "done"
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

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
    expect(screen.getByRole("button", { name: "Calendar" })).toBeInTheDocument();
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

  it("renders Compact Calendar generation and recalculation over loopback", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        const body = init?.body ? JSON.parse(init.body.toString()) : null;
        requests.push({ url, body });

        if (url.endsWith("/calendar/current")) {
          return new Response(
            JSON.stringify({
              plan_id: "plan_current",
              steps: [
                {
                  index: 0,
                  task_id: "task_current",
                  summary: "Review current Calendar",
                  start: 29684400,
                  end: 29684430,
                  depends_on: [],
                  static_anchor: false,
                  placement_authority: "calendar_window"
                }
              ]
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        if (url.endsWith("/planning/generate")) {
          return new Response(
            JSON.stringify({
              schema_version: "planning-kernel-contract/0.1",
              request_id: "planning_request_1",
              plan: {
                id: "plan_generated",
                status: "admitted",
                created_at: "2026-06-17T12:00:00Z",
                steps: [
                  {
                    index: 0,
                    task_id: "task_a",
                    summary: "Implement compact skeleton",
                    start: 29685120,
                    end: 29685180,
                    depends_on: [],
                    static_anchor: true,
                    placement_authority: "user_override"
                  },
                  {
                    index: 1,
                    task_id: "task_b",
                    summary: "Verify recalculation",
                    start: 29685180,
                    end: 29685210,
                    depends_on: ["task_a"],
                    static_anchor: false,
                    placement_authority: "calendar_window"
                  }
                ],
                supersedes_plan_id: null
              },
              diagnostics: []
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        if (url.endsWith("/planning/recalculate")) {
          return new Response(
            JSON.stringify({
              schema_version: "ubu.orchestrator.recalculation.v1",
              trigger_type: body?.trigger_type,
              repair_scope: "override_placement",
              prior_plan_id: "plan_generated",
              plan: {
                id: "plan_recalculated",
                status: "admitted",
                created_at: "2026-06-17T12:10:00Z",
                supersedes_plan_id: "plan_generated",
                steps: [
                  {
                    index: 0,
                    task_id: "task_a",
                    summary: "Implement compact skeleton",
                    start: 29685120,
                    end: 29685180,
                    depends_on: [],
                    static_anchor: true,
                    placement_authority: "user_override"
                  },
                  {
                    index: 1,
                    task_id: "task_b",
                    summary: "Verify recalculation after update",
                    start: 29685210,
                    end: 29685240,
                    depends_on: ["task_a"],
                    static_anchor: false,
                    placement_authority: "repair"
                  }
                ]
              },
              diagnostics: [{ code: "repair_preserved_static_anchor", message: "static anchor preserved during repair" }]
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        return new Response(JSON.stringify({ status: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } });
      })
    );

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));

    expect(await screen.findByText("Review current Calendar")).toBeInTheDocument();
    expect(screen.getByText("Single deterministic skeleton")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Generate Plan" }));

    expect(await screen.findByText("Implement compact skeleton")).toBeInTheDocument();
    expect(screen.getByText("Static anchor")).toBeInTheDocument();
    expect(screen.getAllByText("task_a").length).toBeGreaterThan(0);
    expect(screen.getByText("calendar_window")).toBeInTheDocument();
    expect(screen.getByText(/Last generation schema: planning-kernel-contract\/0.1/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "manual adjustment" } });
    fireEvent.click(screen.getByRole("button", { name: "Request recalculation" }));

    expect(await screen.findByText("Verify recalculation after update")).toBeInTheDocument();
    expect(screen.getByText("repair_preserved_static_anchor")).toBeInTheDocument();
    expect(screen.getAllByText(/Prior Plan/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "plan_recalculated" })[0]).toHaveAttribute("href", "#plan-plan_recalculated");

    expect(requests.find((request) => request.url.endsWith("/planning/generate"))?.body).toMatchObject({
      schema_version: "planning-kernel-contract/0.1",
      request: null
    });
    expect(requests.find((request) => request.url.endsWith("/planning/recalculate"))?.body).toMatchObject({
      schema_version: "ubu.orchestrator.recalculation.v1",
      trigger_type: "user_override",
      note: "manual adjustment",
      objects: []
    });
  });

  it("renders projection preview approval result and reconciliation conflicts over loopback", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    let approveCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        const body = init?.body ? JSON.parse(init.body.toString()) : null;
        requests.push({ url, body });

        if (url.endsWith("/projection/preview")) {
          return new Response(
            JSON.stringify({
              schema_version: "ubu.orchestrator.projection_preview.v1",
              preview_id: "preview_1",
              requires_approval: true,
              policy_summary: {
                legitimization: body?.no_external_export ? "rejected" : "accepted",
                adjudication_reasons: [
                  body?.no_external_export
                    ? "effective compartment policy forbids external export"
                    : "managed-label projection is allowed for automation worker export"
                ],
                checked_at: "2026-06-16T10:00:00Z",
                local_only: false,
                no_cloud_llm: false,
                no_external_export: body?.no_external_export
              },
              operations: [
                {
                  operation_id: "label-apply-ubu-project-ubu-orchestrator-7-ubu-managed",
                  kind: "label",
                  target: { owner: "UbU-project", repo: "ubu-orchestrator", issue_number: 7 },
                  summary: "Apply managed label `ubu-managed` to UbU-project/ubu-orchestrator#7",
                  payload: { label: "ubu-managed" }
                }
              ]
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        if (url.endsWith("/projection/approve")) {
          approveCount += 1;
          if (approveCount > 1) {
            return new Response(
              JSON.stringify({
                schema_version: "ubu.orchestrator.projection_result.v1",
                preview_id: "preview_1",
                status: "applied",
                operation_results: [
                  {
                    operation_id: "label-apply-ubu-project-ubu-orchestrator-7-ubu-managed",
                    status: "applied",
                    message: "managed-label operation written by automation_worker mock adapter",
                    authority_source: "automation_worker"
                  }
                ],
                diagnostics: []
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }

          return new Response(
            JSON.stringify({
              schema_version: "ubu.orchestrator.projection_result.v1",
              preview_id: "preview_1",
              status: "failed",
              operation_results: [
                {
                  operation_id: "label-apply-ubu-project-ubu-orchestrator-7-ubu-managed",
                  status: "failed",
                  message: "effective compartment policy forbids external export",
                  authority_source: null
                }
              ],
              diagnostics: [
                {
                  code: "projection_denied",
                  message: "effective compartment policy forbids external export",
                  operation_id: "label-apply-ubu-project-ubu-orchestrator-7-ubu-managed"
                }
              ]
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        if (url.endsWith("/projection/reconcile")) {
          return new Response(
            JSON.stringify({
              schema_version: "ubu.orchestrator.projection_reconciliation.v1",
              reconciliation_id: "reconciliation_1",
              preview_id: "preview_1",
              status: "missing",
              conflicts: [
                {
                  operation_id: "label-apply-ubu-project-ubu-orchestrator-7-ubu-managed",
                  conflict_type: "missing",
                  expected_label: "ubu-managed",
                  observed_labels: [],
                  message: "applied managed label is missing from observed GitHub state"
                },
                {
                  operation_id: "label-remove-ubu-project-ubu-orchestrator-7-ubu-old",
                  conflict_type: "drifted",
                  expected_label: "ubu-old",
                  observed_labels: ["ubu-old"],
                  message: "removed managed label is still present in observed GitHub state"
                }
              ],
              diagnostics: [{ code: "projection_conflict", message: "projection conflicts surfaced", operation_id: null }]
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        if (url.endsWith("/projection/reconciliation/accept-external")) {
          return new Response(
            JSON.stringify({
              schema_version: "ubu.orchestrator.projection_external_accept.v1",
              admitted_object_id: "xevent_1",
              reconciliation_id: "reconciliation_1",
              conflict_operation_id: "label-apply-ubu-project-ubu-orchestrator-7-ubu-managed"
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        return new Response(JSON.stringify({ status: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } });
      })
    );

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Projection" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "No external export policy" }));
    fireEvent.click(screen.getByRole("button", { name: "Create projection preview" }));

    expect(await screen.findByText("Proposed export pending approval")).toBeInTheDocument();
    expect(screen.getByText("effective compartment policy forbids external export")).toBeInTheDocument();
    expect(screen.getByText("Managed label:")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Approve this batch" }));

    expect(await screen.findByRole("heading", { name: "Projection result" })).toBeInTheDocument();
    expect(screen.getAllByText("projection_denied").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("checkbox", { name: "No external export policy" }));
    fireEvent.click(screen.getByRole("button", { name: "Create projection preview" }));
    expect(await screen.findByText("managed-label projection is allowed for automation worker export")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Approve this batch" }));
    expect(await screen.findByText("managed-label operation written by automation_worker mock adapter")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Run reconciliation" }));

    expect(await screen.findByRole("heading", { name: "Reconciliation" })).toBeInTheDocument();
    expect(screen.getByText("applied managed label is missing from observed GitHub state")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Accept external" })[0]);
    expect(await screen.findByText(/External change accepted as/)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Keep UbU state" })[1]);
    expect(screen.getByText("UbU state kept for review. No overwrite request was sent.")).toBeInTheDocument();
    expect(requests.find((request) => request.url.endsWith("/projection/preview"))?.body).toMatchObject({
      schema_version: "ubu.orchestrator.projection_preview.v1",
      no_external_export: true
    });
    expect(requests.find((request) => request.url.endsWith("/projection/approve"))?.body).toMatchObject({
      schema_version: "ubu.orchestrator.projection_approval.v1",
      preview_id: "preview_1",
      approved: true
    });
    expect(requests.find((request) => request.url.endsWith("/projection/reconcile"))?.body).toMatchObject({
      schema_version: "ubu.orchestrator.projection_reconciliation.v1"
    });
    expect(requests.filter((request) => request.url.endsWith("/projection/reconciliation/accept-external")).length).toBe(1);
  });
});

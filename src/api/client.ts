import openApiSpec from "./generated/openapi.generated.json";

export type ApiResult<T> = {
  data: T;
  status: number;
};

export type SessionTokenRequest = {
  token: string;
};

export type BootstrapSelectedRepo = {
  owner: string;
  repo: string;
};

export type BootstrapAnswers = {
  primary_objective: string;
  work_style: "focused" | "balanced" | "responsive";
  planning_horizon_days: number;
  attention_preference: "deep_work" | "mixed" | "quick_turnaround";
};

export type BootstrapSeedRequest = {
  selected_repo: BootstrapSelectedRepo;
  answers: BootstrapAnswers;
};

export type ImportResponse = {
  imported: number;
  admitted_to_store: number;
  candidates: Array<{
    task_id: string;
    title: string;
    source: string;
  }>;
};

export type BootstrapDiagnostic = {
  code: string;
  message: string;
};

export type BootstrapSeedResponse = {
  schema_version: string;
  objective_ids: string[];
  preference_ids: string[];
  imported_tasks: ImportResponse;
  diagnostics: BootstrapDiagnostic[];
};

export type SessionTokenResponse = {
  schema_version: string;
  accepted: boolean;
  token_available: boolean;
};

export type HealthResponse = {
  status: string;
  version: string;
  bind_policy: string;
};

type GeneratedPath = keyof typeof openApiSpec.paths;

const DESKTOP_TOKEN_PATH = "/desktop/session/github-token" satisfies GeneratedPath;
const BOOTSTRAP_SEED_PATH = "/bootstrap/seed" satisfies GeneratedPath;
const HEALTH_PATH = "/health" satisfies GeneratedPath;
const PROJECTION_APPROVE_PATH = "/projection/approve" satisfies GeneratedPath;

const DESKTOP_SESSION_SCHEMA_VERSION = "ubu.orchestrator.desktop_session.v1";
const BOOTSTRAP_SCHEMA_VERSION = "ubu.orchestrator.bootstrap.v1";
const DEFAULT_ORCHESTRATOR_PORT = "17890";

export function getOrchestratorBaseUrl(): string {
  const explicitUrl = import.meta.env.VITE_UBU_ORCHESTRATOR_URL;

  if (explicitUrl) {
    return explicitUrl.replace(/\/$/, "");
  }

  const port = import.meta.env.VITE_UBU_ORCHESTRATOR_PORT ?? DEFAULT_ORCHESTRATOR_PORT;
  return `http://127.0.0.1:${port}`;
}

export class OrchestratorError extends Error {
  readonly status: number;
  readonly diagnostics: BootstrapDiagnostic[];

  constructor(message: string, status: number, diagnostics: BootstrapDiagnostic[] = []) {
    super(message);
    this.name = "OrchestratorError";
    this.status = status;
    this.diagnostics = diagnostics;
  }
}

function isDiagnostic(value: unknown): value is BootstrapDiagnostic {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "message" in value &&
    typeof value.code === "string" &&
    typeof value.message === "string"
  );
}

async function readError(response: Response): Promise<OrchestratorError> {
  let message = `Orchestrator request failed: ${response.status} ${response.statusText}`;
  let diagnostics: BootstrapDiagnostic[] = [];

  try {
    const body = (await response.json()) as unknown;
    if (typeof body === "object" && body !== null) {
      if ("error" in body && typeof body.error === "string") {
        message = body.error;
      }
      if ("diagnostics" in body && Array.isArray(body.diagnostics)) {
        diagnostics = body.diagnostics.filter(isDiagnostic);
      }
    }
  } catch {
    // Keep the status-based fallback when the orchestrator returns no JSON body.
  }

  return new OrchestratorError(message, response.status, diagnostics);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const response = await fetch(`${getOrchestratorBaseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers
    }
  });

  if (!response.ok) {
    throw await readError(response);
  }

  const data = (await response.json()) as T;
  return { data, status: response.status };
}

export const orchestratorClient = {
  health() {
    return request<HealthResponse>(HEALTH_PATH);
  },

  submitSessionToken({ token }: SessionTokenRequest) {
    return request<SessionTokenResponse>(DESKTOP_TOKEN_PATH, {
      method: "POST",
      body: JSON.stringify({
        schema_version: DESKTOP_SESSION_SCHEMA_VERSION,
        github_token: token
      })
    });
  },

  seedBootstrap({ selected_repo, answers }: BootstrapSeedRequest) {
    return request<BootstrapSeedResponse>(BOOTSTRAP_SEED_PATH, {
      method: "POST",
      body: JSON.stringify({
        schema_version: BOOTSTRAP_SCHEMA_VERSION,
        selected_repo,
        answers
      })
    });
  },

  approveProjectionBatch(batchId: string) {
    // TODO(security): loopback-only binding does not fully protect mutating endpoints such as projection approval; Phase 1 defers per-run bearer-token/CSRF work because this surface is temporary and test-heavy.
    return request<{ approved: boolean; preview_id: string }>(PROJECTION_APPROVE_PATH, {
      method: "POST",
      body: JSON.stringify({ preview_id: batchId })
    });
  }
};

// TODO: add Tauri command bridge once local HTTP API stabilizes; it supersedes the HTTP surface.

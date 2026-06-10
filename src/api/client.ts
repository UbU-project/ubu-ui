export type ApiResult<T> = {
  data: T;
  status: number;
};

export type SessionTokenRequest = {
  token: string;
};

const DEFAULT_ORCHESTRATOR_PORT = "17890";

export function getOrchestratorBaseUrl(): string {
  const explicitUrl = import.meta.env.VITE_UBU_ORCHESTRATOR_URL;

  if (explicitUrl) {
    return explicitUrl.replace(/\/$/, "");
  }

  const port = import.meta.env.VITE_UBU_ORCHESTRATOR_PORT ?? DEFAULT_ORCHESTRATOR_PORT;
  return `http://127.0.0.1:${port}`;
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
    throw new Error(`Orchestrator request failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as T;
  return { data, status: response.status };
}

export const orchestratorClient = {
  health() {
    return request<{ status: string }>("/health");
  },

  submitSessionToken({ token }: SessionTokenRequest) {
    return request<{ sessionReady: boolean }>("/session/github-token", {
      method: "POST",
      body: JSON.stringify({ token })
    });
  },

  approveProjectionBatch(batchId: string) {
    // TODO(security): loopback-only binding does not fully protect mutating endpoints such as projection approval; Phase 1 defers per-run bearer-token/CSRF work because this surface is temporary and test-heavy.
    return request<{ approved: boolean; batchId: string }>(`/projection-preview/${encodeURIComponent(batchId)}/approve`, {
      method: "POST"
    });
  }
};

// TODO: add Tauri command bridge once local HTTP API stabilizes; it supersedes the HTTP surface.

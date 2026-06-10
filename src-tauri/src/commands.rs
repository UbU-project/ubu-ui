use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct BridgeStatus {
    pub http_surface_active: bool,
    pub command_bridge_ready: bool,
    pub note: &'static str,
}

#[tauri::command]
pub fn orchestrator_bridge_status() -> BridgeStatus {
    // TODO: add Tauri command bridge once local HTTP API stabilizes; it supersedes the HTTP surface.
    // TODO(security): loopback-only binding does not fully protect mutating endpoints such as projection approval; Phase 1 defers per-run bearer-token/CSRF work because this surface is temporary and test-heavy.
    BridgeStatus {
        http_surface_active: true,
        command_bridge_ready: false,
        note: "Phase 1 uses the loopback HTTP orchestrator API.",
    }
}

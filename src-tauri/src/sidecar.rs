pub fn document_phase_one_sidecar_policy(_app: &tauri::AppHandle) {
    // Phase 1 does not launch or manage the orchestrator as a bundled sidecar.
    // The user or devshell is responsible for starting ubu-orchestrator on 127.0.0.1.
    // TODO: add Tauri command bridge once local HTTP API stabilizes; it supersedes the HTTP surface.
}

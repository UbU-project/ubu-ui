mod commands;
mod sidecar;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::orchestrator_bridge_status
        ])
        .setup(|app| {
            sidecar::document_phase_one_sidecar_policy(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running UbU UI");
}

fn main() {
    run();
}

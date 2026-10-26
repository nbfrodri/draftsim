//! Crash-surviving bulk-simulation breadcrumbs.
//!
//! The renderer appends one line before each heavy bulk step. The native
//! process owns the file, so the last line survives a WebView renderer crash
//! and tells the next launch which year and stage was running. Lines hold only
//! a stage, ids, counters and memory/payload sizes; never save contents.
use serde::{Deserialize, Serialize};
use std::{
    fs::OpenOptions,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

pub const LOG_FILE: &str = "bulk-diagnostics.log";
const ROTATED_FILE: &str = "bulk-diagnostics.1.log";
/// The current file rotates once it reaches this size; one older file is kept.
pub const MAX_LOG_BYTES: u64 = 256 * 1024;
static LOG_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Breadcrumb {
    stage: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    reality_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    year: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    phase: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    completed: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    total: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    heap_used: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    heap_total: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    heap_limit: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    payload_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    statements: Option<u32>,
}

#[derive(Serialize)]
struct LogLine<'a> {
    ts: u64,
    #[serde(flatten)]
    breadcrumb: &'a Breadcrumb,
}

fn valid_token(value: &str, max: usize, allowed: impl Fn(u8) -> bool) -> bool {
    !value.is_empty() && value.len() <= max && value.bytes().all(allowed)
}

fn validate(breadcrumb: &Breadcrumb) -> Result<(), String> {
    if !valid_token(&breadcrumb.stage, 32, |c| c.is_ascii_lowercase() || c == b'-') {
        return Err("Invalid breadcrumb stage".into());
    }
    if let Some(id) = &breadcrumb.reality_id {
        if !valid_token(id, 80, |c| c.is_ascii_alphanumeric() || matches!(c, b'-' | b'_' | b'.' | b':')) {
            return Err("Invalid breadcrumb reality id".into());
        }
    }
    Ok(())
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64
}

/// Append one JSON line, rotating first when the file reached `max_bytes`.
/// `write_all` hands the line to the OS before returning, so it survives a
/// renderer or app crash (not a power loss; no fsync, to keep steps cheap).
pub fn append_breadcrumb(dir: &Path, breadcrumb: &Breadcrumb, ts: u64, max_bytes: u64) -> Result<(), String> {
    validate(breadcrumb)?;
    let mut line = serde_json::to_vec(&LogLine { ts, breadcrumb }).map_err(|e| e.to_string())?;
    line.push(b'\n');
    let _guard = LOG_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let path = dir.join(LOG_FILE);
    if std::fs::metadata(&path).is_ok_and(|m| m.len() >= max_bytes) {
        // std::fs::rename replaces an existing target on Windows and Unix.
        std::fs::rename(&path, dir.join(ROTATED_FILE)).map_err(|e| e.to_string())?;
    }
    let mut file = OpenOptions::new().create(true).append(true).open(&path).map_err(|e| e.to_string())?;
    file.write_all(&line).map_err(|e| e.to_string())
}

/// Older rotated lines first, then the current file. Missing files read as empty.
pub fn read_log(dir: &Path) -> Result<String, String> {
    let _guard = LOG_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let mut log = String::new();
    for name in [ROTATED_FILE, LOG_FILE] {
        match std::fs::read(dir.join(name)) {
            Ok(bytes) => log.push_str(&String::from_utf8_lossy(&bytes)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(log)
}

pub fn log_dir<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("logs"))
}

#[tauri::command]
pub async fn diagnostics_breadcrumb<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::WebviewWindow<R>,
    breadcrumb: Breadcrumb,
) -> Result<(), String> {
    if window.label() != "main" { return Err("Unsupported window".into()); }
    let dir = log_dir(&app)?;
    let ts = now_ms();
    tauri::async_runtime::spawn_blocking(move || append_breadcrumb(&dir, &breadcrumb, ts, MAX_LOG_BYTES))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn diagnostics_breadcrumb_log<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::WebviewWindow<R>,
) -> Result<String, String> {
    if window.label() != "main" { return Err("Unsupported window".into()); }
    let dir = log_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || read_log(&dir)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("draftsim-diagnostics-{name}-{}-{}", std::process::id(), now_ms()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    fn crumb(stage: &str, year: u32) -> Breadcrumb {
        Breadcrumb { stage: stage.into(), reality_id: Some("reality-abc_1".into()), year: Some(year), heap_used: Some(42), ..Default::default() }
    }

    #[test]
    fn appends_one_json_line_per_breadcrumb() {
        let dir = temp_dir("append");
        append_breadcrumb(&dir, &crumb("archive", 3), 10, MAX_LOG_BYTES).unwrap();
        append_breadcrumb(&dir, &crumb("idle", 3), 11, MAX_LOG_BYTES).unwrap();
        let log = read_log(&dir).unwrap();
        let lines: Vec<serde_json::Value> = log.lines().map(|l| serde_json::from_str(l).unwrap()).collect();
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0]["ts"], 10);
        assert_eq!(lines[0]["stage"], "archive");
        assert_eq!(lines[0]["realityId"], "reality-abc_1");
        assert_eq!(lines[0]["year"], 3);
        assert_eq!(lines[0]["heapUsed"], 42);
        assert!(lines[0].get("payloadBytes").is_none());
        assert_eq!(lines[1]["stage"], "idle");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn rotates_once_the_file_is_full_and_keeps_one_older_file() {
        let dir = temp_dir("rotate");
        for year in 0..40 { append_breadcrumb(&dir, &crumb("season-sim", year), 1, 200).unwrap(); }
        let current = std::fs::metadata(dir.join(LOG_FILE)).unwrap().len();
        let rotated = std::fs::metadata(dir.join(ROTATED_FILE)).unwrap().len();
        // Each file is bounded by the limit plus one line.
        assert!(current < 400 && rotated < 400, "current {current}, rotated {rotated}");
        let log = read_log(&dir).unwrap();
        let last: serde_json::Value = serde_json::from_str(log.lines().last().unwrap()).unwrap();
        assert_eq!(last["year"], 39);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn rejects_free_text_and_unknown_fields() {
        let dir = temp_dir("reject");
        assert!(append_breadcrumb(&dir, &crumb("Stage with spaces", 1), 1, MAX_LOG_BYTES).is_err());
        let bad_id = Breadcrumb { reality_id: Some("C:\\Users\\name".into()), ..crumb("save", 1) };
        assert!(append_breadcrumb(&dir, &bad_id, 1, MAX_LOG_BYTES).is_err());
        assert!(serde_json::from_str::<Breadcrumb>(r#"{"stage":"save","note":"private"}"#).is_err());
        assert_eq!(read_log(&dir).unwrap(), "");
    }

    #[test]
    fn ipc_rejects_other_windows() {
        let app = tauri::test::mock_builder()
            .invoke_handler(tauri::generate_handler![diagnostics_breadcrumb])
            .build(tauri::test::mock_context(tauri::test::noop_assets())).unwrap();
        let other = tauri::WebviewWindowBuilder::new(&app, "other", Default::default()).build().unwrap();
        let request = tauri::webview::InvokeRequest {
            cmd: "diagnostics_breadcrumb".into(),
            callback: tauri::ipc::CallbackFn(0),
            error: tauri::ipc::CallbackFn(1),
            url: if cfg!(windows) { "http://tauri.localhost" } else { "tauri://localhost" }.parse().unwrap(),
            body: tauri::ipc::InvokeBody::Json(serde_json::json!({ "breadcrumb": { "stage": "idle" } })),
            headers: Default::default(),
            invoke_key: tauri::test::INVOKE_KEY.to_string(),
        };
        // The main window would write under the real app data folder, so only
        // the rejection path is exercised through IPC.
        assert!(tauri::test::get_ipc_response(&other, request).is_err());
    }
}

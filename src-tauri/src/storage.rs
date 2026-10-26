use serde::Deserialize;
use serde_json::Value;
use std::{collections::HashMap, sync::Mutex};
use tauri::Manager;

/// Large bind values arrive before `persist_batch` as raw byte chunks, so no
/// single IPC message carries a multi-megabyte JSON string. Chunks are not
/// writes: the batch that references them still runs in one transaction.
/// Only the latest save's token is kept; `persist_batch` always takes and
/// clears the staged data, whatever its outcome.
#[derive(Default)]
pub struct PersistStaging(Mutex<StagedSave>);

#[derive(Default)]
struct StagedSave {
    token: String,
    blobs: HashMap<u32, Vec<u8>>,
    bytes: usize,
}

/// Upper bound for one save's staged bytes (largest measured save is ~18 MB).
pub const MAX_STAGED_BYTES: usize = 512 * 1024 * 1024;
const STAGED_KEY: &str = "$staged";

impl PersistStaging {
    fn lock(&self) -> std::sync::MutexGuard<'_, StagedSave> {
        self.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Append one chunk; a new token drops whatever an earlier attempt left behind.
    pub fn append(&self, token: &str, blob: u32, chunk: &[u8]) -> Result<(), String> {
        if token.is_empty() || token.len() > 64 || !token.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-') {
            return Err("Invalid staging token".into());
        }
        if chunk.is_empty() { return Err("Empty staged chunk".into()); }
        let mut staged = self.lock();
        if staged.token != token {
            *staged = StagedSave { token: token.to_string(), ..Default::default() };
        }
        if staged.bytes + chunk.len() > MAX_STAGED_BYTES {
            *staged = StagedSave::default();
            return Err("Save is too large to stage".into());
        }
        staged.bytes += chunk.len();
        staged.blobs.entry(blob).or_default().extend_from_slice(chunk);
        Ok(())
    }

    /// Take (and clear) the blobs staged for `token`; any other token's data is dropped.
    pub fn take(&self, token: Option<&str>) -> HashMap<u32, Vec<u8>> {
        let staged = std::mem::take(&mut *self.lock());
        match token {
            Some(token) if staged.token == token => staged.blobs,
            _ => HashMap::new(),
        }
    }
}

/// Replace `{"$staged": n}` bind values with the UTF-8 text staged under blob `n`.
pub fn resolve_staged(statements: &mut [Statement], mut blobs: HashMap<u32, Vec<u8>>) -> Result<(), String> {
    for statement in statements.iter_mut() {
        for value in statement.bind_values.iter_mut() {
            let Value::Object(map) = value else { continue };
            let id = match (map.len(), map.get(STAGED_KEY).and_then(Value::as_u64)) {
                (1, Some(id)) => u32::try_from(id).map_err(|_| "Invalid staged value")?,
                _ => return Err("Only scalar SQL bindings are supported".into()),
            };
            let bytes = blobs.remove(&id).ok_or("A staged save chunk is missing")?;
            *value = Value::String(String::from_utf8(bytes).map_err(|_| "A staged save value is not valid UTF-8")?);
        }
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Statement {
    query: String,
    bind_values: Vec<Value>,
}

/// All statements use one acquired connection and roll back together on error.
pub async fn execute_batch(pool: &sqlx::SqlitePool, statements: Vec<Statement>) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    for statement in statements {
        let mut query = sqlx::query(&statement.query);
        for value in statement.bind_values {
            query = match value {
                Value::Null => query.bind(Option::<String>::None),
                Value::Bool(value) => query.bind(value),
                Value::Number(value) if value.is_i64() => query.bind(value.as_i64().unwrap()),
                Value::Number(value) => query.bind(value.as_f64().ok_or("Invalid numeric binding")?),
                Value::String(value) => query.bind(value),
                _ => return Err("Only scalar SQL bindings are supported".into()),
            };
        }
        query.execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())
}

/// Raw body: one chunk of a large bind value. Headers name the save and blob.
#[tauri::command]
pub async fn persist_stage_chunk<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    staging: tauri::State<'_, PersistStaging>,
    request: tauri::ipc::Request<'_>,
) -> Result<(), String> {
    if window.label() != "main" { return Err("Unsupported window".into()); }
    let header = |name: &str| request.headers().get(name).and_then(|v| v.to_str().ok()).ok_or("Missing staging header");
    let token = header("draftsim-stage")?;
    let blob = header("draftsim-blob")?.parse::<u32>().map_err(|_| "Invalid staging blob")?;
    let tauri::ipc::InvokeBody::Raw(chunk) = request.body() else { return Err("Staged chunks must be raw bytes".into()) };
    staging.append(token, blob, chunk)
}

#[tauri::command]
pub async fn persist_batch<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::WebviewWindow<R>,
    databases: tauri::State<'_, tauri_plugin_sql::DbInstances>,
    staging: tauri::State<'_, PersistStaging>,
    mut statements: Vec<Statement>,
    staging_token: Option<String>,
) -> Result<(), String> {
    if window.label() != "main" { return Err("Unsupported window".into()); }
    // Always clear staged data, even when this batch fails; a retry restages everything.
    let blobs = staging.take(staging_token.as_deref());
    resolve_staged(&mut statements, blobs)?;
    let path = app.path().app_data_dir().map_err(|e| e.to_string())?.join("draftsim.db");
    let key = format!("sqlite:{}", path.display());
    let instances = databases.0.read().await;
    let Some(tauri_plugin_sql::DbPool::Sqlite(pool)) = instances.get(&key) else {
        return Err("DraftSim database is not open".into());
    };
    execute_batch(pool, statements).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rolls_back_every_statement_on_failure() {
        tauri::async_runtime::block_on(async {
            let pool = sqlx::sqlite::SqlitePoolOptions::new().max_connections(1)
                .connect("sqlite::memory:").await.unwrap();
            sqlx::query("CREATE TABLE sample (value TEXT NOT NULL)").execute(&pool).await.unwrap();
            let make = |query: &str, bind_values| Statement { query: query.into(), bind_values };
            let failed = execute_batch(&pool, vec![
                make("INSERT INTO sample VALUES (?)", vec![Value::String("first".into())]),
                make("INSERT INTO sample VALUES (?)", vec![Value::Null]),
            ]).await;
            assert!(failed.is_err());
            let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM sample").fetch_one(&pool).await.unwrap();
            assert_eq!(count, 0);
            execute_batch(&pool, vec![make("INSERT INTO sample VALUES (?)", vec![Value::String("saved".into())])]).await.unwrap();
            let (value,): (String,) = sqlx::query_as("SELECT value FROM sample").fetch_one(&pool).await.unwrap();
            assert_eq!(value, "saved");
        });
    }
    #[test]
    fn ipc_batch_uses_registered_pool_and_rejects_other_windows() {
        let app = tauri::test::mock_builder()
            .manage(tauri_plugin_sql::DbInstances::default())
            .manage(PersistStaging::default())
            .invoke_handler(tauri::generate_handler![persist_batch])
            .build(tauri::test::mock_context(tauri::test::noop_assets())).unwrap();
        let main = tauri::WebviewWindowBuilder::new(&app, "main", Default::default()).build().unwrap();
        let other = tauri::WebviewWindowBuilder::new(&app, "other", Default::default()).build().unwrap();
        // Only compute the lookup key; no user database or AppData file is opened.
        let key = format!("sqlite:{}", app.path().app_data_dir().unwrap().join("draftsim.db").display());
        let pool = tauri::async_runtime::block_on(async {
            let pool = sqlx::sqlite::SqlitePoolOptions::new().max_connections(1)
                .connect("sqlite::memory:").await.unwrap();
            sqlx::query("CREATE TABLE sample (value TEXT NOT NULL)").execute(&pool).await.unwrap();
            app.state::<tauri_plugin_sql::DbInstances>().0.write().await
                .insert(key, tauri_plugin_sql::DbPool::Sqlite(pool.clone()));
            pool
        });
        let request = |statements: Value| tauri::webview::InvokeRequest {
            cmd: "persist_batch".into(),
            callback: tauri::ipc::CallbackFn(0),
            error: tauri::ipc::CallbackFn(1),
            // The local app origin is http://tauri.localhost on Windows and tauri://localhost elsewhere.
            url: if cfg!(windows) { "http://tauri.localhost" } else { "tauri://localhost" }.parse().unwrap(),
            body: tauri::ipc::InvokeBody::Json(serde_json::json!({ "statements": statements })),
            headers: Default::default(),
            invoke_key: tauri::test::INVOKE_KEY.to_string(),
        };
        let statement = serde_json::json!({"query":"INSERT INTO sample VALUES (?)","bindValues":["saved through IPC"]});
        assert!(tauri::test::get_ipc_response(&main, request(serde_json::json!([statement]))).is_ok());
        assert!(tauri::test::get_ipc_response(&other, request(serde_json::json!([statement]))).is_err());
        let invalid = serde_json::json!({"query":"INSERT INTO sample VALUES (?)","bindValues":[null]});
        assert!(tauri::test::get_ipc_response(&main, request(serde_json::json!([statement, invalid]))).is_err());
        let (count,): (i64,) = tauri::async_runtime::block_on(
            sqlx::query_as("SELECT COUNT(*) FROM sample").fetch_one(&pool)
        ).unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn staging_keeps_only_the_latest_save_and_clears_on_take() {
        let staging = PersistStaging::default();
        staging.append("save-1", 0, b"stale").unwrap();
        staging.append("save-2", 0, b"he").unwrap();
        staging.append("save-2", 0, b"llo").unwrap();
        staging.append("save-2", 1, b"x").unwrap();
        let blobs = staging.take(Some("save-2"));
        assert_eq!(blobs.get(&0).map(Vec::as_slice), Some(&b"hello"[..]));
        assert_eq!(blobs.get(&1).map(Vec::as_slice), Some(&b"x"[..]));
        assert!(staging.take(Some("save-2")).is_empty());
        staging.append("save-3", 0, b"orphan").unwrap();
        assert!(staging.take(Some("other")).is_empty());
        assert!(staging.take(Some("save-3")).is_empty(), "a mismatched take still clears");
        assert!(staging.append("bad token!", 0, b"x").is_err());
        assert!(staging.append("save-4", 0, b"").is_err(), "empty chunks could grow the blob map without bytes");
    }

    #[test]
    fn resolves_placeholders_and_rejects_missing_or_invalid_text() {
        let make = |values: Vec<Value>| vec![Statement { query: "INSERT INTO sample VALUES (?, ?)".into(), bind_values: values }];
        let mut statements = make(vec![serde_json::json!({ "$staged": 0 }), Value::from(3)]);
        resolve_staged(&mut statements, HashMap::from([(0, "é payload".as_bytes().to_vec())])).unwrap();
        assert_eq!(statements[0].bind_values[0], Value::String("é payload".into()));
        assert_eq!(statements[0].bind_values[1], Value::from(3));
        let mut missing = make(vec![serde_json::json!({ "$staged": 1 })]);
        assert!(resolve_staged(&mut missing, HashMap::new()).is_err());
        let mut invalid = make(vec![serde_json::json!({ "$staged": 0 })]);
        assert!(resolve_staged(&mut invalid, HashMap::from([(0, vec![0xff, 0xfe])])).is_err());
        let mut foreign = make(vec![serde_json::json!({ "other": 0 })]);
        assert!(resolve_staged(&mut foreign, HashMap::new()).is_err());
    }

    #[test]
    fn ipc_staged_chunks_commit_in_one_transaction_and_never_outlive_the_batch() {
        let app = tauri::test::mock_builder()
            .manage(tauri_plugin_sql::DbInstances::default())
            .manage(PersistStaging::default())
            .invoke_handler(tauri::generate_handler![persist_batch, persist_stage_chunk])
            .build(tauri::test::mock_context(tauri::test::noop_assets())).unwrap();
        let main = tauri::WebviewWindowBuilder::new(&app, "main", Default::default()).build().unwrap();
        let key = format!("sqlite:{}", app.path().app_data_dir().unwrap().join("draftsim.db").display());
        let pool = tauri::async_runtime::block_on(async {
            let pool = sqlx::sqlite::SqlitePoolOptions::new().max_connections(1)
                .connect("sqlite::memory:").await.unwrap();
            sqlx::query("CREATE TABLE sample (value TEXT NOT NULL)").execute(&pool).await.unwrap();
            app.state::<tauri_plugin_sql::DbInstances>().0.write().await
                .insert(key, tauri_plugin_sql::DbPool::Sqlite(pool.clone()));
            pool
        });
        let url: tauri::Url = if cfg!(windows) { "http://tauri.localhost" } else { "tauri://localhost" }.parse().unwrap();
        let chunk = |token: &str, blob: &str, bytes: &[u8]| {
            let mut headers = tauri::http::HeaderMap::new();
            headers.insert("draftsim-stage", token.parse().unwrap());
            headers.insert("draftsim-blob", blob.parse().unwrap());
            tauri::webview::InvokeRequest {
                cmd: "persist_stage_chunk".into(), callback: tauri::ipc::CallbackFn(0), error: tauri::ipc::CallbackFn(1),
                url: url.clone(), body: tauri::ipc::InvokeBody::Raw(bytes.to_vec()), headers,
                invoke_key: tauri::test::INVOKE_KEY.to_string(),
            }
        };
        let batch = |body: Value| tauri::webview::InvokeRequest {
            cmd: "persist_batch".into(), callback: tauri::ipc::CallbackFn(0), error: tauri::ipc::CallbackFn(1),
            url: url.clone(), body: tauri::ipc::InvokeBody::Json(body), headers: Default::default(),
            invoke_key: tauri::test::INVOKE_KEY.to_string(),
        };
        let count = || tauri::async_runtime::block_on(sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM sample").fetch_one(&pool)).unwrap().0;
        let insert_staged = serde_json::json!({"query":"INSERT INTO sample VALUES (?)","bindValues":[{"$staged":0}]});

        // A failing later statement rolls back the staged insert and still clears staging.
        assert!(tauri::test::get_ipc_response(&main, chunk("save-a", "0", "big ".as_bytes())).is_ok());
        let invalid = serde_json::json!({"query":"INSERT INTO sample VALUES (?)","bindValues":[null]});
        assert!(tauri::test::get_ipc_response(&main, batch(serde_json::json!({ "statements": [insert_staged, invalid], "stagingToken": "save-a" }))).is_err());
        assert_eq!(count(), 0);
        assert!(tauri::test::get_ipc_response(&main, batch(serde_json::json!({ "statements": [insert_staged], "stagingToken": "save-a" }))).is_err());

        // A retry restages every chunk, in order, and commits the full text.
        for part in ["big ", "value ", "ü"] {
            assert!(tauri::test::get_ipc_response(&main, chunk("save-b", "0", part.as_bytes())).is_ok());
        }
        let first = serde_json::json!({"query":"INSERT INTO sample VALUES (?)","bindValues":["first"]});
        assert!(tauri::test::get_ipc_response(&main, batch(serde_json::json!({ "statements": [first, insert_staged], "stagingToken": "save-b" }))).is_ok());
        let rows: Vec<(String,)> = tauri::async_runtime::block_on(sqlx::query_as("SELECT value FROM sample ORDER BY rowid").fetch_all(&pool)).unwrap();
        assert_eq!(rows, vec![("first".to_string(),), ("big value ü".to_string(),)]);
        assert!(app.state::<PersistStaging>().take(Some("save-b")).is_empty());
    }
}

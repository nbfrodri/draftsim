use serde::Deserialize;
use serde_json::Value;
use tauri::Manager;

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

#[tauri::command]
pub async fn persist_batch<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::WebviewWindow<R>,
    databases: tauri::State<'_, tauri_plugin_sql::DbInstances>,
    statements: Vec<Statement>,
) -> Result<(), String> {
    if window.label() != "main" { return Err("Unsupported window".into()); }
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
            url: "http://tauri.localhost".parse().unwrap(),
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

}

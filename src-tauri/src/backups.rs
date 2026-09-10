use serde::Serialize;
use sqlx::{Connection, Row};
use std::{collections::HashSet, path::{Path, PathBuf}, time::{SystemTime, UNIX_EPOCH}};
use tauri::Manager;

fn now() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64 }
fn err(e: impl std::fmt::Display) -> String { e.to_string() }
// Windows can briefly retain SQLite handles while its worker finishes closing.
// Retry only sharing/lock violations; all other errors preserve normal rollback.
fn rename_closed_file(from: impl AsRef<Path>, to: impl AsRef<Path>) -> std::io::Result<()> {
    for attempt in 0..50 {
        match std::fs::rename(from.as_ref(), to.as_ref()) {
            Err(e) if cfg!(windows) && matches!(e.raw_os_error(), Some(32 | 33)) && attempt < 49 => {
                std::thread::sleep(std::time::Duration::from_millis(10));
            }
            result => return result,
        }
    }
    unreachable!()
}

fn safe_id(id: &str) -> bool { id.starts_with("backup-") && id.ends_with(".db") && id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'.') }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Backup { id: String, created_at: u64, bytes: u64, realities: Vec<String>, years: i64 }

async fn inspect(path: &Path) -> Result<(Vec<String>, i64), String> {
    let options = sqlx::sqlite::SqliteConnectOptions::new().filename(path).read_only(true);
    let mut db = sqlx::SqliteConnection::connect_with(&options).await.map_err(err)?;
    let result = async {
        let (check,): (String,) = sqlx::query_as("PRAGMA integrity_check").fetch_one(&mut db).await.map_err(err)?;
        if check != "ok" { return Err("Backup integrity check failed".into()); }
        let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('global_state','realities','reality_history','meta_config','schema_meta')").fetch_one(&mut db).await.map_err(err)?;
        if count != 5 { return Err("Not a compatible DraftSim backup".into()); }
        let version: Option<(String,)> = sqlx::query_as("SELECT value FROM schema_meta WHERE key = 'persist_version'")
            .fetch_optional(&mut db).await.map_err(err)?;
        // Legacy DraftSim databases predate the marker and use this same schema.
        if version.is_some_and(|(v,)| v != "7") { return Err("Unsupported saved database version".into()); }
        let violations = sqlx::query("PRAGMA foreign_key_check").fetch_all(&mut db).await.map_err(err)?;
        if !violations.is_empty() { return Err("Backup contains broken references".into()); }
        for table in ["SELECT state_json AS value FROM global_state", "SELECT season_json AS value FROM realities", "SELECT entry_json AS value FROM reality_history"] {
            for row in sqlx::query(table).fetch_all(&mut db).await.map_err(err)? {
                let value: String = row.get("value");
                let parsed: serde_json::Value = serde_json::from_str(&value).map_err(err)?;
                if !parsed.is_object() { return Err("Invalid saved data in backup".into()); }
            }
        }
        let rows = sqlx::query("SELECT name, year FROM realities ORDER BY name").fetch_all(&mut db).await.map_err(err)?;
        Ok((rows.iter().map(|r| r.get::<String,_>("name")).collect(), rows.iter().map(|r| r.get::<i64,_>("year")).sum()))
    }.await;
    db.close().await.map_err(err)?;
    result
}

fn retained(times: &[(String, u64)]) -> HashSet<String> {
    let mut keep = HashSet::new();
    let mut days = HashSet::new();
    let mut weeks = HashSet::new();
    for (i, (id, t)) in times.iter().enumerate() {
        if i < 5 { keep.insert(id.clone()); }
        let day = t / 86_400_000;
        if days.len() < 7 && days.insert(day) { keep.insert(id.clone()); }
        if weeks.len() < 4 && weeks.insert(day / 7) { keep.insert(id.clone()); }
    }
    keep
}
fn entries(dir: &Path) -> Result<Vec<(String,u64)>, String> {
    if !dir.exists() { return Ok(vec![]); }
    let mut items = vec![];
    for item in std::fs::read_dir(dir).map_err(err)? {
        let item = item.map_err(err)?;
        let id = item.file_name().to_string_lossy().to_string();
        if safe_id(&id) && item.file_type().map_err(err)?.is_file() {
            if let Some(t) = id.strip_prefix("backup-").and_then(|s| s.strip_suffix(".db")).and_then(|s| s.parse::<u64>().ok()) { items.push((id,t)); }
        }
    }
    items.sort_by(|a,b| b.1.cmp(&a.1));
    Ok(items)
}
// Reserve staging names exclusively so concurrent operations cannot collide.
fn reserve_snapshot(dir: &Path) -> Result<(PathBuf, PathBuf), String> {
    std::fs::create_dir_all(dir).map_err(err)?;
    let mut timestamp = now();
    loop {
        let path = dir.join(format!("backup-{timestamp}.db"));
        let temporary = path.with_extension("tmp");
        if !path.exists() {
            match std::fs::OpenOptions::new().write(true).create_new(true).open(&temporary) {
                Ok(_) => return Ok((path, temporary)),
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {},
                Err(e) => return Err(err(e)),
            }
        }
        timestamp = timestamp.checked_add(1).ok_or("Backup timestamp overflow")?;
    }
}
async fn prune_valid_snapshots(dir: &Path) -> Result<(), String> {
    let mut valid = vec![];
    for entry in entries(dir)? {
        if inspect(&dir.join(&entry.0)).await.is_ok() { valid.push(entry); }
    }
    let keep = retained(&valid);
    for (id, _) in valid {
        if !keep.contains(&id) { std::fs::remove_file(dir.join(id)).map_err(err)?; }
    }
    Ok(())
}
async fn snapshot(pool: &sqlx::SqlitePool, dir: &Path) -> Result<PathBuf, String> {
    let (final_path, temporary) = reserve_snapshot(dir)?;
    sqlx::query("VACUUM INTO ?").bind(temporary.to_string_lossy().as_ref()).execute(pool).await.map_err(err)?;
    inspect(&temporary).await?;
    std::fs::OpenOptions::new().write(true).open(&temporary).map_err(err)?.sync_all().map_err(err)?;
    rename_closed_file(&temporary, &final_path).map_err(err)?;
    prune_valid_snapshots(dir).await?;
    Ok(final_path)
}

#[tauri::command]
pub async fn backup_list<R: tauri::Runtime>(app: tauri::AppHandle<R>, window: tauri::WebviewWindow<R>) -> Result<Vec<Backup>, String> {
    if window.label() != "main" { return Err("Unsupported window".into()); }
    let dir = app.path().app_data_dir().map_err(err)?.join("backups");
    let mut out = vec![];
    for (id,t) in entries(&dir)? {
        let path = dir.join(&id);
        // Invalid copies are kept on disk for inspection but never offered for restoration.
        if let Ok((realities,years)) = inspect(&path).await {
            out.push(Backup { id, created_at: t, bytes: std::fs::metadata(path).map_err(err)?.len(), realities, years });
        }
    }
    Ok(out)
}
#[tauri::command]
pub async fn backup_create<R: tauri::Runtime>(app: tauri::AppHandle<R>, window: tauri::WebviewWindow<R>, databases: tauri::State<'_, tauri_plugin_sql::DbInstances>) -> Result<String, String> {
    if window.label() != "main" { return Err("Unsupported window".into()); }
    let root = app.path().app_data_dir().map_err(err)?;
    let key = format!("sqlite:{}", root.join("draftsim.db").display());
    let instances = databases.0.write().await;
    let Some(tauri_plugin_sql::DbPool::Sqlite(pool)) = instances.get(&key) else { return Err("Database is not open".into()); };
    let path = snapshot(pool, &root.join("backups")).await?;
    if let Ok(destination) = std::fs::read_to_string(root.join("backup-destination.txt")) {
        let destination = PathBuf::from(destination).join(path.file_name().ok_or("Invalid backup name")?);
        let temp = destination.with_extension("tmp");
        std::fs::copy(&path, &temp).map_err(|e| format!("Local backup saved; external copy failed: {e}"))?;
        std::fs::OpenOptions::new().write(true).open(&temp).map_err(err)?.sync_all().map_err(err)?;
        inspect(&temp).await?;
        rename_closed_file(temp, &destination).map_err(err)?;
        prune_valid_snapshots(destination.parent().ok_or("Invalid backup destination")?).await?;
    }
    Ok(path.file_name().unwrap().to_string_lossy().into())
}
#[tauri::command]
pub async fn backup_destination<R: tauri::Runtime>(app: tauri::AppHandle<R>, window: tauri::WebviewWindow<R>) -> Result<(), String> {
    use tauri_plugin_dialog::DialogExt;
    if window.label() != "main" { return Err("Unsupported window".into()); }
    if let Some(folder) = app.dialog().file().set_title("Choose an external backup folder").blocking_pick_folder() {
        let folder = folder.into_path().map_err(err)?;
        let root = app.path().app_data_dir().map_err(err)?;
        std::fs::create_dir_all(&root).map_err(err)?;
        std::fs::write(root.join("backup-destination.txt"), folder.to_string_lossy().as_bytes()).map_err(err)?;
    }
    Ok(())
}
#[tauri::command]
pub async fn backup_import<R: tauri::Runtime>(app: tauri::AppHandle<R>, window: tauri::WebviewWindow<R>) -> Result<(), String> {
    use tauri_plugin_dialog::DialogExt;
    if window.label() != "main" { return Err("Unsupported window".into()); }
    if let Some(file) = app.dialog().file().add_filter("DraftSim recovery", &["db"]).blocking_pick_file() {
        let source = file.into_path().map_err(err)?;
        inspect(&source).await?;
        let dir = app.path().app_data_dir().map_err(err)?.join("backups");
        std::fs::create_dir_all(&dir).map_err(err)?;
        let (path, temp) = reserve_snapshot(&dir)?;
        std::fs::copy(&source, &temp).map_err(err)?;
        inspect(&temp).await?;
        std::fs::OpenOptions::new().write(true).open(&temp).map_err(err)?.sync_all().map_err(err)?;
        rename_closed_file(temp, path).map_err(err)?;
    }
    Ok(())
}
/// Recover a process interruption between moving the original and installing
/// the staged copy. Only paths created by this module are accepted.
pub fn recover_interrupted_restore(root: &Path) -> Result<(), String> {
    let journal = root.join("restore-journal.txt");
    if !journal.exists() { return Ok(()); }
    let name = std::fs::read_to_string(&journal).map_err(err)?;
    if !name.starts_with("before-restore-") || !name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') { return Err("Invalid recovery journal".into()); }
    let recovery = root.join(name);
    if root.join("restore-staged.db").exists() || !root.join("draftsim.db").exists() {
        for file in ["draftsim.db", "draftsim.db-wal", "draftsim.db-shm"] {
            if recovery.join(file).exists() {
                if root.join(file).exists() { return Err("Recovery conflict; original files preserved".into()); }
                rename_closed_file(recovery.join(file), root.join(file)).map_err(err)?;
            }
        }
    }
    std::fs::remove_file(journal).map_err(err)?;
    Ok(())
}
fn install_staged_restore(root: &Path) -> Result<(), String> {
    let staged = root.join("restore-staged.db");
    let recovery = root.join(format!("before-restore-{}", now()));
    std::fs::create_dir(&recovery).map_err(err)?;
    let journal = root.join("restore-journal.txt");
    std::fs::write(&journal, recovery.file_name().unwrap().to_string_lossy().as_bytes()).map_err(err)?;
    std::fs::OpenOptions::new().write(true).open(&journal).map_err(err)?.sync_all().map_err(err)?;
    let mut moved = vec![];
    for name in ["draftsim.db", "draftsim.db-wal", "draftsim.db-shm"] {
        if root.join(name).exists() {
            if let Err(e) = rename_closed_file(root.join(name), recovery.join(name)) {
                for previous in moved { rename_closed_file(recovery.join(previous), root.join(previous)).map_err(err)?; }
                std::fs::remove_file(&journal).map_err(err)?;
                return Err(err(e));
            }
            moved.push(name);
        }
    }
    if let Err(e) = rename_closed_file(&staged, root.join("draftsim.db")) {
        for name in moved { rename_closed_file(recovery.join(name), root.join(name)).map_err(err)?; }
        std::fs::remove_file(&journal).map_err(err)?;
        return Err(err(e));
    }
    std::fs::remove_file(journal).map_err(err)?;
    Ok(())
}
#[tauri::command]
pub async fn backup_restore<R: tauri::Runtime>(app: tauri::AppHandle<R>, window: tauri::WebviewWindow<R>, databases: tauri::State<'_, tauri_plugin_sql::DbInstances>, id: String) -> Result<(), String> {
    if window.label() != "main" || !safe_id(&id) { return Err("Invalid backup selection".into()); }
    let root = app.path().app_data_dir().map_err(err)?;
    if root.join("restore-journal.txt").exists() { return Err("Restart to complete the previous recovery before restoring again".into()); }
    let source = root.join("backups").join(id);
    inspect(&source).await?;
    let staged = root.join("restore-staged.db");
    std::fs::copy(&source, &staged).map_err(err)?;
    std::fs::OpenOptions::new().write(true).open(&staged).map_err(err)?.sync_all().map_err(err)?;
    inspect(&staged).await?;
    let key = format!("sqlite:{}", root.join("draftsim.db").display());
    let mut instances = databases.0.write().await;
    if let Some(tauri_plugin_sql::DbPool::Sqlite(pool)) = instances.get(&key) {
        // Preserve a healthy current database before replacing it. A corrupt
        // original is preserved byte-for-byte below, including its WAL.
        if inspect(&root.join("draftsim.db")).await.is_ok() { snapshot(pool, &root.join("backups")).await?; }
        pool.close().await;
    }
    instances.remove(&key);
    let result = install_staged_restore(&root);
    // Re-register the pool after success OR a completed rollback. The frontend
    // executor addresses the pool by key and must remain usable after an error.
    if root.join("restore-journal.txt").exists() {
        return Err(result.err().unwrap_or_else(|| "Restart to complete interrupted recovery".into()));
    }
    let options = sqlx::sqlite::SqliteConnectOptions::new().filename(root.join("draftsim.db"))
        .create_if_missing(false).journal_mode(sqlx::sqlite::SqliteJournalMode::Wal);
    let pool = sqlx::SqlitePool::connect_with(options).await.map_err(|e| format!("Unable to reopen saved data; original files preserved: {e}"))?;
    instances.insert(key, tauri_plugin_sql::DbPool::Sqlite(pool));
    result
}
#[tauri::command]
pub fn storage_size<R: tauri::Runtime>(app: tauri::AppHandle<R>, window: tauri::WebviewWindow<R>) -> Result<u64, String> {
    if window.label() != "main" { return Err("Unsupported window".into()); }
    let root = app.path().app_data_dir().map_err(err)?;
    Ok(["draftsim.db", "draftsim.db-wal"].iter().filter_map(|f| std::fs::metadata(root.join(f)).ok()).map(|m|m.len()).sum())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn retention_keeps_recent_daily_and_weekly() {
        let times: Vec<_> = (0..100).map(|i| (format!("backup-{i}.db"), (100-i)*86_400_000)).collect();
        let keep = retained(&times);
        assert!(keep.contains("backup-0.db"));
        assert!(keep.contains("backup-6.db"));
        assert!(keep.len() <= 16);
        assert!(!keep.contains("backup-99.db"));
        assert!(!safe_id("../draftsim.db"));
    }
    #[test]
    fn interruption_restores_original_database_and_wal() {
        let root = std::env::temp_dir().join(format!("draftsim-restore-test-{}", now()));
        let old = root.join("before-restore-1"); std::fs::create_dir_all(&old).unwrap();
        std::fs::write(old.join("draftsim.db"), b"original").unwrap();
        std::fs::write(old.join("draftsim.db-wal"), b"last committed data").unwrap();
        std::fs::write(root.join("restore-staged.db"), b"new copy").unwrap();
        std::fs::write(root.join("restore-journal.txt"), b"before-restore-1").unwrap();
        recover_interrupted_restore(&root).unwrap();
        assert_eq!(std::fs::read(root.join("draftsim.db")).unwrap(), b"original");
        assert_eq!(std::fs::read(root.join("draftsim.db-wal")).unwrap(), b"last committed data");
        assert!(!root.join("restore-journal.txt").exists());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn failed_install_rolls_back_and_success_keeps_original_files() {
        let root = std::env::temp_dir().join(format!("draftsim-install-test-{}", now()));
        std::fs::create_dir(&root).unwrap();
        std::fs::write(root.join("draftsim.db"), b"original").unwrap();
        std::fs::write(root.join("draftsim.db-wal"), b"original WAL").unwrap();
        assert!(install_staged_restore(&root).is_err());
        assert_eq!(std::fs::read(root.join("draftsim.db")).unwrap(), b"original");
        assert_eq!(std::fs::read(root.join("draftsim.db-wal")).unwrap(), b"original WAL");
        assert!(!root.join("restore-journal.txt").exists());
        std::fs::write(root.join("restore-staged.db"), b"replacement").unwrap();
        // Use a different directory name even if the clock has not advanced.
        let previous = std::fs::read_dir(&root).unwrap().filter_map(Result::ok)
            .find(|e| e.file_name().to_string_lossy().starts_with("before-restore-")).unwrap().path();
        std::fs::remove_dir(previous).unwrap();
        install_staged_restore(&root).unwrap();
        assert_eq!(std::fs::read(root.join("draftsim.db")).unwrap(), b"replacement");
        assert!(!root.join("draftsim.db-wal").exists());
        let original = std::fs::read_dir(&root).unwrap().filter_map(Result::ok)
            .find(|e| e.file_name().to_string_lossy().starts_with("before-restore-")).unwrap().path();
        assert_eq!(std::fs::read(original.join("draftsim.db")).unwrap(), b"original");
        assert_eq!(std::fs::read(original.join("draftsim.db-wal")).unwrap(), b"original WAL");
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn reserved_snapshots_never_share_a_staging_file() {
        let root = std::env::temp_dir().join(format!("draftsim-reservation-test-{}", now()));
        let (first, stage) = reserve_snapshot(&root).unwrap();
        let (second, second_stage) = reserve_snapshot(&root).unwrap();
        assert_ne!(first, second);
        assert_ne!(stage, second_stage);
        std::fs::write(&first, b"existing backup").unwrap();
        let (third, _) = reserve_snapshot(&root).unwrap();
        assert_ne!(first, third);
        assert_eq!(std::fs::read(first).unwrap(), b"existing backup");
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn interruption_after_moving_only_database_preserves_unmoved_wal() {
        let root = std::env::temp_dir().join(format!("draftsim-partial-test-{}", now()));
        let old = root.join("before-restore-1");
        std::fs::create_dir_all(&old).unwrap();
        std::fs::write(old.join("draftsim.db"), b"original").unwrap();
        std::fs::write(root.join("draftsim.db-wal"), b"committed WAL").unwrap();
        std::fs::write(root.join("restore-staged.db"), b"new copy").unwrap();
        std::fs::write(root.join("restore-journal.txt"), b"before-restore-1").unwrap();
        recover_interrupted_restore(&root).unwrap();
        recover_interrupted_restore(&root).unwrap();
        assert_eq!(std::fs::read(root.join("draftsim.db")).unwrap(), b"original");
        assert_eq!(std::fs::read(root.join("draftsim.db-wal")).unwrap(), b"committed WAL");
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn snapshot_captures_wal_and_rejects_corruption() {
        tauri::async_runtime::block_on(async {
            let root = std::env::temp_dir().join(format!("draftsim-backup-test-{}", now()));
            std::fs::create_dir(&root).unwrap();
            let options = sqlx::sqlite::SqliteConnectOptions::new().filename(root.join("test.db")).create_if_missing(true).journal_mode(sqlx::sqlite::SqliteJournalMode::Wal);
            let pool = sqlx::SqlitePool::connect_with(options).await.unwrap();
            sqlx::query("CREATE TABLE schema_meta (key TEXT, value TEXT); CREATE TABLE meta_config (value TEXT)").execute(&pool).await.unwrap();
            sqlx::query("CREATE TABLE global_state (state_json TEXT); CREATE TABLE realities (name TEXT, year INTEGER, season_json TEXT); CREATE TABLE reality_history (entry_json TEXT)").execute(&pool).await.unwrap();
            sqlx::query("INSERT INTO realities VALUES ('Test franchise', 100, '{}')").execute(&pool).await.unwrap();
            let copy = snapshot(&pool, &root.join("backups")).await.unwrap();
            assert_eq!(inspect(&copy).await.unwrap(), (vec!["Test franchise".to_string()], 100));
            let bad = root.join("bad.db"); std::fs::write(&bad,b"truncated").unwrap();
            assert!(inspect(&bad).await.is_err());
            assert!(copy.exists());
            sqlx::query("INSERT INTO schema_meta VALUES ('persist_version', '999')").execute(&pool).await.unwrap();
            assert!(snapshot(&pool, &root.join("backups")).await.is_err());
            assert!(copy.exists());
            sqlx::query("UPDATE schema_meta SET value = '7'").execute(&pool).await.unwrap();
            // Newer corrupt files must never evict the last valid snapshot.
            let backup_dir = root.join("backups");
            let oldest = backup_dir.join("backup-1.db");
            rename_closed_file(&copy, &oldest).unwrap();
            for i in 1..40 {
                std::fs::write(backup_dir.join(format!("backup-{}.db", i * 86_400_000u64)), b"corrupt").unwrap();
            }
            let latest = snapshot(&pool, &backup_dir).await.unwrap();
            assert!(oldest.exists());
            assert!(latest.exists());
            // The same validation and retention is used at an external destination.
            let external = root.join("external");
            std::fs::create_dir(&external).unwrap();
            for i in 1..40 {
                std::fs::copy(&latest, external.join(format!("backup-{}.db", i * 86_400_000u64))).unwrap();
            }
            prune_valid_snapshots(&external).await.unwrap();
            assert!(entries(&external).unwrap().len() <= 16);
            assert!(inspect(&latest).await.is_ok());
            sqlx::query("UPDATE realities SET year = 101").execute(&pool).await.unwrap();
            pool.close().await;
            rename_closed_file(root.join("test.db"), root.join("draftsim.db")).unwrap();
            std::fs::copy(&latest, root.join("restore-staged.db")).unwrap();
            install_staged_restore(&root).unwrap();
            // Opening a real restored SQLite database sees the snapshot, not the later write.
            assert_eq!(inspect(&root.join("draftsim.db")).await.unwrap().1, 100);
            let original = std::fs::read_dir(&root).unwrap().filter_map(Result::ok)
                .find(|e| e.file_name().to_string_lossy().starts_with("before-restore-")).unwrap().path();
            assert_eq!(inspect(&original.join("draftsim.db")).await.unwrap().1, 101);
            std::fs::remove_dir_all(root).unwrap();
        });
    }
}

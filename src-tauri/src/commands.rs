use crate::db::{self, Db};
use crate::metadata;
use crate::models::{Card, FolderStat, Summary};
use tauri::State;

type Res<T> = Result<T, String>;

fn lock<'a>(db: &'a State<'_, Db>) -> Res<std::sync::MutexGuard<'a, rusqlite::Connection>> {
    db.0.lock().map_err(|e| format!("数据库锁异常: {e}"))
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

// ---------------------------------------------------------------- 分组

#[tauri::command]
pub fn list_folders(db: State<'_, Db>) -> Res<Vec<FolderStat>> {
    let conn = lock(&db)?;
    db::list_folders(&conn).map_err(err)
}

#[tauri::command]
pub fn create_folder(db: State<'_, Db>, name: String, parent_id: Option<i64>) -> Res<FolderStat> {
    let conn = lock(&db)?;
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("分组名不能为空".to_string());
    }
    db::create_folder(&conn, trimmed, parent_id).map_err(err)
}

#[tauri::command]
pub fn rename_folder(db: State<'_, Db>, id: i64, name: String) -> Res<FolderStat> {
    let conn = lock(&db)?;
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("分组名不能为空".to_string());
    }
    db::rename_folder(&conn, id, trimmed).map_err(err)
}

#[tauri::command]
pub fn move_folder(db: State<'_, Db>, id: i64, parent_id: Option<i64>) -> Res<()> {
    let conn = lock(&db)?;
    if parent_id == Some(id) {
        return Err("不能把分组移动到它自己里面".to_string());
    }
    if db::would_create_cycle(&conn, id, parent_id).map_err(err)? {
        return Err("不能把分组移动到它自己的子分组里".to_string());
    }
    db::set_folder_parent(&conn, id, parent_id).map_err(err)
}

#[tauri::command]
pub fn delete_folder(db: State<'_, Db>, id: i64) -> Res<()> {
    let conn = lock(&db)?;
    db::delete_folder(&conn, id).map_err(err)
}

#[tauri::command]
pub fn set_folder_expanded(db: State<'_, Db>, id: i64, expanded: bool) -> Res<()> {
    let conn = lock(&db)?;
    db::set_folder_expanded(&conn, id, expanded).map_err(err)
}

// ---------------------------------------------------------------- 卡片

#[tauri::command]
pub fn list_cards(
    db: State<'_, Db>,
    folder_id: Option<i64>,
    scope: String,
    query: Option<String>,
) -> Res<Vec<Card>> {
    let conn = lock(&db)?;
    db::query_cards(&conn, folder_id, &scope, query.as_deref()).map_err(err)
}

#[tauri::command]
pub async fn create_card(
    db: State<'_, Db>,
    url: String,
    folder_id: Option<i64>,
) -> Res<Card> {
    // 先做网络抓取（不持锁），再落库
    let meta = metadata::fetch_metadata(&url).await?;
    let conn = lock(&db)?;
    let title = meta.title.unwrap_or_else(|| "未命名".to_string());
    db::insert_card(
        &conn,
        folder_id,
        &meta.url,
        &title,
        meta.description.as_deref(),
        meta.site_name.as_deref(),
        meta.image_url.as_deref(),
        meta.favicon_url.as_deref(),
    )
    .map_err(err)
}

#[tauri::command]
pub async fn refetch_card(db: State<'_, Db>, id: i64) -> Res<Card> {
    let current = {
        let conn = lock(&db)?;
        db::card_by_id(&conn, id).map_err(err)?
    };
    let meta = metadata::fetch_metadata(&current.url).await?;
    let conn = lock(&db)?;
    let title = meta.title.unwrap_or_else(|| current.title.clone());
    db::set_card_metadata(
        &conn,
        id,
        &meta.url,
        &title,
        meta.description.as_deref(),
        meta.site_name.as_deref(),
        meta.image_url.as_deref(),
        meta.favicon_url.as_deref(),
    )
    .map_err(err)
}

#[tauri::command]
pub fn update_card(
    db: State<'_, Db>,
    id: i64,
    title: Option<String>,
    description: Option<String>,
) -> Res<Card> {
    let conn = lock(&db)?;
    if let Some(t) = title {
        let t = t.trim().to_string();
        if t.is_empty() {
            return Err("名称不能为空".to_string());
        }
        return db::update_card_fields(&conn, id, Some(&t), description.as_deref()).map_err(err);
    }
    db::update_card_fields(&conn, id, None, description.as_deref()).map_err(err)
}

#[tauri::command]
pub fn move_card(db: State<'_, Db>, id: i64, folder_id: Option<i64>) -> Res<Card> {
    let conn = lock(&db)?;
    db::set_card_folder(&conn, id, folder_id).map_err(err)
}

#[tauri::command]
pub fn delete_card(db: State<'_, Db>, id: i64) -> Res<Card> {
    let conn = lock(&db)?;
    db::remove_card(&conn, id).map_err(err)
}

#[tauri::command]
pub fn restore_card(db: State<'_, Db>, card: Card) -> Res<Card> {
    let conn = lock(&db)?;
    db::insert_card_full(&conn, &card).map_err(err)
}

#[tauri::command]
pub fn mark_clicked(db: State<'_, Db>, id: i64) -> Res<Card> {
    let conn = lock(&db)?;
    db::set_card_clicked(&conn, id, true).map_err(err)
}

#[tauri::command]
pub fn unmark_clicked(db: State<'_, Db>, id: i64) -> Res<Card> {
    let conn = lock(&db)?;
    db::set_card_clicked(&conn, id, false).map_err(err)
}

#[tauri::command]
pub fn get_summary(db: State<'_, Db>) -> Res<Summary> {
    let conn = lock(&db)?;
    let (total, pending) = db::summary(&conn).map_err(err)?;
    Ok(Summary { total, pending })
}

// ---------------------------------------------------------------- 其他

/// 用系统默认浏览器打开链接。
/// 通过 ShellExecuteW（opener crate）执行，不经过 shell，避免命令注入。
#[tauri::command]
pub fn open_external(url: String) -> Res<()> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("只允许打开 http/https 链接".to_string());
    }
    opener::open(&url).map_err(|e| format!("无法打开链接: {e}"))
}

use crate::models::{Card, FolderStat};
use anyhow::Result;
use rusqlite::{params, Connection, Row};
use std::path::Path;
use std::sync::Mutex;

/// 共享数据库句柄。rusqlite 的 Connection 是 Send 但不是 Sync，
/// 因此用 Mutex 包裹后即可作为 Tauri 的托管状态。
pub struct Db(pub Mutex<Connection>);

/// 卡片列清单。pending 由 SQLite 依据**本地时区**计算，
/// 避免前端用 UTC 比较导致「明明点过还红着」。
pub const CARD_COLS: &str = "c.id, c.folder_id, c.url, c.title, c.description, \
     c.site_name, c.image_url, c.favicon_url, c.last_clicked_at, c.sort_order, c.created_at, \
     (c.last_clicked_at IS NULL \
      OR date(c.last_clicked_at,'localtime') <> date('now','localtime')) AS pending";

const MIGRATION: &str = r#"
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS folders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id   INTEGER REFERENCES folders(id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    expanded    INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cards (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    folder_id       INTEGER REFERENCES folders(id) ON DELETE CASCADE,
    url             TEXT    NOT NULL,
    title           TEXT    NOT NULL,
    description     TEXT,
    site_name       TEXT,
    image_url       TEXT,
    favicon_url     TEXT,
    last_clicked_at TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_cards_folder   ON cards(folder_id);
CREATE INDEX IF NOT EXISTS idx_cards_clicked  ON cards(last_clicked_at);
"#;

const SEED: &str = r#"
INSERT INTO folders (id, parent_id, name, sort_order) VALUES
  (1, NULL, '工作', 0),
  (2, NULL, '资讯', 1),
  (3, NULL, '生活', 2);
"#;

pub fn open(path: &Path) -> Result<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch(MIGRATION)?;
    seed(&conn)?;
    Ok(conn)
}

fn seed(conn: &Connection) -> Result<()> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM folders", [], |r| r.get(0))?;
    if count == 0 {
        conn.execute_batch(SEED)?;
    }
    Ok(())
}

pub fn map_card(row: &Row<'_>) -> rusqlite::Result<Card> {
    Ok(Card {
        id: row.get("id")?,
        folder_id: row.get("folder_id")?,
        url: row.get("url")?,
        title: row.get("title")?,
        description: row.get("description")?,
        site_name: row.get("site_name")?,
        image_url: row.get("image_url")?,
        favicon_url: row.get("favicon_url")?,
        last_clicked_at: row.get("last_clicked_at")?,
        pending: row.get::<_, i64>("pending")? != 0,
        sort_order: row.get("sort_order")?,
        created_at: row.get("created_at")?,
    })
}

pub fn card_by_id(conn: &Connection, id: i64) -> Result<Card> {
    let sql = format!("SELECT {CARD_COLS} FROM cards c WHERE c.id = ?1");
    let card = conn.query_row(&sql, [id], map_card)?;
    Ok(card)
}

pub fn folder_by_id(conn: &Connection, id: i64) -> Result<FolderStat> {
    let sql = r#"
        SELECT f.id, f.parent_id, f.name, f.sort_order, f.expanded,
          (SELECT COUNT(*) FROM cards c WHERE c.folder_id = f.id) AS total,
          (SELECT COUNT(*) FROM cards c WHERE c.folder_id = f.id
             AND (c.last_clicked_at IS NULL
                  OR date(c.last_clicked_at,'localtime') <> date('now','localtime'))) AS pending
        FROM folders f WHERE f.id = ?1
    "#;
    let folder = conn.query_row(sql, [id], |row| {
        Ok(FolderStat {
            id: row.get(0)?,
            parent_id: row.get(1)?,
            name: row.get(2)?,
            sort_order: row.get(3)?,
            expanded: row.get::<_, i64>(4)? != 0,
            total: row.get(5)?,
            pending: row.get(6)?,
        })
    })?;
    Ok(folder)
}

// ---------------------------------------------------------------- 分组写入

/// 新建分组。`parent_id` 为 None 表示建在根级。
pub fn create_folder(conn: &Connection, name: &str, parent_id: Option<i64>) -> Result<FolderStat> {
    let unique = unique_folder_name(conn, parent_id, name)?;
    let next: i64 = conn.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM folders WHERE parent_id IS ?1",
        params![parent_id],
        |r| r.get(0),
    )?;
    conn.execute(
        "INSERT INTO folders (parent_id, name, sort_order) VALUES (?1, ?2, ?3)",
        params![parent_id, unique, next],
    )?;
    // 新建子分组时自动展开父分组：否则父级处于折叠状态时，
    // 用户看不到新分组出现，会误以为「点了没反应」。
    if let Some(pid) = parent_id {
        conn.execute(
            "UPDATE folders SET expanded = 1 WHERE id = ?1",
            params![pid],
        )?;
    }
    folder_by_id(conn, conn.last_insert_rowid())
}

pub fn rename_folder(conn: &Connection, id: i64, name: &str) -> Result<FolderStat> {
    conn.execute(
        "UPDATE folders SET name = ?1 WHERE id = ?2",
        params![name, id],
    )?;
    folder_by_id(conn, id)
}

/// 把分组挂到新的父节点下（parent_id 为 None 表示移到根级）。
/// 调用方需先用 `would_create_cycle` 校验，避免形成环。
pub fn set_folder_parent(conn: &Connection, id: i64, parent_id: Option<i64>) -> Result<()> {
    let next: i64 = conn.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM folders WHERE parent_id IS ?1",
        params![parent_id],
        |r| r.get(0),
    )?;
    conn.execute(
        "UPDATE folders SET parent_id = ?1, sort_order = ?2 WHERE id = ?3",
        params![parent_id, next, id],
    )?;
    Ok(())
}

pub fn delete_folder(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM folders WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn set_folder_expanded(conn: &Connection, id: i64, expanded: bool) -> Result<()> {
    conn.execute(
        "UPDATE folders SET expanded = ?1 WHERE id = ?2",
        params![if expanded { 1 } else { 0 }, id],
    )?;
    Ok(())
}

// ---------------------------------------------------------------- 卡片写入

#[allow(clippy::too_many_arguments)]
pub fn insert_card(
    conn: &Connection,
    folder_id: Option<i64>,
    url: &str,
    title: &str,
    description: Option<&str>,
    site_name: Option<&str>,
    image_url: Option<&str>,
    favicon_url: Option<&str>,
) -> Result<Card> {
    conn.execute(
        "INSERT INTO cards (folder_id, url, title, description, site_name, image_url, favicon_url, sort_order) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, \
                 (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM cards))",
        params![folder_id, url, title, description, site_name, image_url, favicon_url],
    )?;
    card_by_id(conn, conn.last_insert_rowid())
}

/// 撤销删除时按原样写回（含 id 与点卯记录）。
pub fn insert_card_full(conn: &Connection, card: &Card) -> Result<Card> {
    conn.execute(
        "INSERT INTO cards (id, folder_id, url, title, description, site_name, image_url, \
         favicon_url, last_clicked_at, sort_order, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, \
                 COALESCE(NULLIF(?11, ''), datetime('now')))",
        params![
            card.id,
            card.folder_id,
            card.url,
            card.title,
            card.description,
            card.site_name,
            card.image_url,
            card.favicon_url,
            card.last_clicked_at,
            card.sort_order,
            card.created_at,
        ],
    )?;
    card_by_id(conn, card.id)
}

pub fn set_card_clicked(conn: &Connection, id: i64, clicked: bool) -> Result<Card> {
    if clicked {
        conn.execute(
            "UPDATE cards SET last_clicked_at = datetime('now') WHERE id = ?1",
            params![id],
        )?;
    } else {
        conn.execute(
            "UPDATE cards SET last_clicked_at = NULL WHERE id = ?1",
            params![id],
        )?;
    }
    card_by_id(conn, id)
}

pub fn set_card_folder(conn: &Connection, id: i64, folder_id: Option<i64>) -> Result<Card> {
    conn.execute(
        "UPDATE cards SET folder_id = ?1 WHERE id = ?2",
        params![folder_id, id],
    )?;
    card_by_id(conn, id)
}

pub fn set_card_metadata(
    conn: &Connection,
    id: i64,
    url: &str,
    title: &str,
    description: Option<&str>,
    site_name: Option<&str>,
    image_url: Option<&str>,
    favicon_url: Option<&str>,
) -> Result<Card> {
    conn.execute(
        "UPDATE cards SET url = ?1, title = ?2, description = ?3, site_name = ?4, \
         image_url = ?5, favicon_url = ?6 WHERE id = ?7",
        params![url, title, description, site_name, image_url, favicon_url, id],
    )?;
    card_by_id(conn, id)
}

pub fn update_card_fields(
    conn: &Connection,
    id: i64,
    title: Option<&str>,
    description: Option<&str>,
) -> Result<Card> {
    if let Some(t) = title {
        conn.execute("UPDATE cards SET title = ?1 WHERE id = ?2", params![t, id])?;
    }
    if let Some(d) = description {
        conn.execute(
            "UPDATE cards SET description = ?1 WHERE id = ?2",
            params![d, id],
        )?;
    }
    card_by_id(conn, id)
}

pub fn remove_card(conn: &Connection, id: i64) -> Result<Card> {
    let card = card_by_id(conn, id)?;
    conn.execute("DELETE FROM cards WHERE id = ?1", params![id])?;
    Ok(card)
}

pub fn list_folders(conn: &Connection) -> Result<Vec<FolderStat>> {
    let sql = r#"
        SELECT f.id, f.parent_id, f.name, f.sort_order, f.expanded,
          (SELECT COUNT(*) FROM cards c WHERE c.folder_id = f.id) AS total,
          (SELECT COUNT(*) FROM cards c WHERE c.folder_id = f.id
             AND (c.last_clicked_at IS NULL
                  OR date(c.last_clicked_at,'localtime') <> date('now','localtime'))) AS pending
        FROM folders f
        ORDER BY f.sort_order, f.id
    "#;
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map([], |row| {
        Ok(FolderStat {
            id: row.get(0)?,
            parent_id: row.get(1)?,
            name: row.get(2)?,
            sort_order: row.get(3)?,
            expanded: row.get::<_, i64>(4)? != 0,
            total: row.get(5)?,
            pending: row.get(6)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

/// 判断把 `id` 挂到 `new_parent` 下是否会形成环。
pub fn would_create_cycle(conn: &Connection, id: i64, new_parent: Option<i64>) -> Result<bool> {
    let mut cursor = new_parent;
    while let Some(cur) = cursor {
        if cur == id {
            return Ok(true);
        }
        cursor = conn
            .query_row("SELECT parent_id FROM folders WHERE id = ?1", [cur], |r| {
                r.get::<_, Option<i64>>(0)
            })
            .unwrap_or(None);
    }
    Ok(false)
}

pub fn query_cards(
    conn: &Connection,
    folder_id: Option<i64>,
    scope: &str,
    query: Option<&str>,
) -> Result<Vec<Card>> {
    let mut sql = String::new();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    match scope {
        // 选中某个分组时，连同其所有后代分组的卡片一起展示
        "folder" => {
            if let Some(fid) = folder_id {
                sql.push_str(
                    "WITH RECURSIVE subtree(id) AS ( \
                       SELECT ?1 UNION ALL \
                       SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id) ",
                );
                params_vec.push(Box::new(fid));
                sql.push_str(&format!(
                    "SELECT {CARD_COLS} FROM cards c \
                     WHERE c.folder_id IN (SELECT id FROM subtree)"
                ));
            } else {
                // folder_id 为 None 表示「未分组」虚拟节点
                sql.push_str(&format!(
                    "SELECT {CARD_COLS} FROM cards c WHERE c.folder_id IS NULL"
                ));
            }
        }
        "pending" => {
            sql.push_str(&format!(
                "SELECT {CARD_COLS} FROM cards c \
                 WHERE (c.last_clicked_at IS NULL \
                        OR date(c.last_clicked_at,'localtime') <> date('now','localtime'))"
            ));
        }
        _ => {
            sql.push_str(&format!("SELECT {CARD_COLS} FROM cards c WHERE 1=1"));
        }
    }

    if let Some(q) = query {
        let q = q.trim();
        if !q.is_empty() {
            sql.push_str(
                " AND (c.title LIKE ?  OR IFNULL(c.description,'') LIKE ? OR c.url LIKE ?)",
            );
            let like = format!("%{}%", q);
            params_vec.push(Box::new(like.clone()));
            params_vec.push(Box::new(like.clone()));
            params_vec.push(Box::new(like));
        }
    }

    sql.push_str(" ORDER BY c.sort_order, c.id");

    let mut stmt = conn.prepare(&sql)?;
    let refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();
    let rows = stmt.query_map(refs.as_slice(), map_card)?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

pub fn summary(conn: &Connection) -> Result<(i64, i64)> {
    let total: i64 = conn.query_row("SELECT COUNT(*) FROM cards", [], |r| r.get(0))?;
    let pending: i64 = conn.query_row(
        "SELECT COUNT(*) FROM cards WHERE last_clicked_at IS NULL \
         OR date(last_clicked_at,'localtime') <> date('now','localtime')",
        [],
        |r| r.get(0),
    )?;
    Ok((total, pending))
}

/// 生成不与同级重名冲突的分组名。
pub fn unique_folder_name(
    conn: &Connection,
    parent_id: Option<i64>,
    base: &str,
) -> Result<String> {
    let base = base.trim();
    let base = if base.is_empty() { "新分组" } else { base };
    for n in 0..200 {
        let candidate = if n == 0 {
            base.to_string()
        } else {
            format!("{} {}", base, n + 1)
        };
        let exists: i64 = match parent_id {
            Some(pid) => conn.query_row(
                "SELECT COUNT(*) FROM folders WHERE name = ?1 AND parent_id = ?2",
                params![candidate, pid],
                |r| r.get(0),
            )?,
            None => conn.query_row(
                "SELECT COUNT(*) FROM folders WHERE name = ?1 AND parent_id IS NULL",
                params![candidate],
                |r| r.get(0),
            )?,
        };
        if exists == 0 {
            return Ok(candidate);
        }
    }
    Ok(format!("{} {}", base, chrono_like_stamp()))
}

fn chrono_like_stamp() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 每个测试使用独立的内存库，彼此隔离且不触碰真实数据文件。
    fn mem() -> Connection {
        let conn = Connection::open_in_memory().expect("打开内存数据库失败");
        conn.execute_batch(MIGRATION).expect("建表失败");
        conn
    }

    fn add_card(conn: &Connection, folder_id: Option<i64>, url: &str, title: &str) -> Card {
        insert_card(conn, folder_id, url, title, None, None, None, None).expect("插入卡片失败")
    }

    /// 核心用例：三层的嵌套分组必须被正确持久化并原样返回
    #[test]
    fn nested_folders_are_persisted_with_parent_id() {
        let conn = mem();
        let work = create_folder(&conn, "工作", None).unwrap();
        let rival = create_folder(&conn, "竞品", Some(work.id)).unwrap();
        let domestic = create_folder(&conn, "国内", Some(rival.id)).unwrap();

        assert_eq!(work.parent_id, None);
        assert_eq!(rival.parent_id, Some(work.id));
        assert_eq!(domestic.parent_id, Some(rival.id));

        // 从数据库重新读出来，确认 parent_id 真的落库了
        let all = list_folders(&conn).unwrap();
        assert_eq!(all.len(), 3);
        let rival_row = all.iter().find(|f| f.id == rival.id).unwrap();
        assert_eq!(rival_row.parent_id, Some(work.id));
        let domestic_row = all.iter().find(|f| f.id == domestic.id).unwrap();
        assert_eq!(domestic_row.parent_id, Some(rival.id));
    }

    /// 选中父分组时，必须能穿透任意深度拿到后代分组的卡片
    #[test]
    fn subtree_query_reaches_all_generations() {
        let conn = mem();
        let work = create_folder(&conn, "工作", None).unwrap();
        let rival = create_folder(&conn, "竞品", Some(work.id)).unwrap();
        let domestic = create_folder(&conn, "国内", Some(rival.id)).unwrap();
        let overseas = create_folder(&conn, "海外", Some(rival.id)).unwrap();
        let news = create_folder(&conn, "资讯", None).unwrap();

        add_card(&conn, Some(work.id), "https://a.com", "工作直属");
        add_card(&conn, Some(rival.id), "https://b.com", "竞品直属");
        add_card(&conn, Some(domestic.id), "https://c.com", "国内");
        add_card(&conn, Some(overseas.id), "https://d.com", "海外");
        add_card(&conn, Some(news.id), "https://e.com", "资讯");

        // 第一层：只应有工作这一支
        let under_work = query_cards(&conn, Some(work.id), "folder", None).unwrap();
        assert_eq!(under_work.len(), 4, "工作子树应含 4 张卡片");

        // 第二层
        let under_rival = query_cards(&conn, Some(rival.id), "folder", None).unwrap();
        assert_eq!(under_rival.len(), 3, "竞品子树应含 3 张卡片");

        // 第三层
        let under_domestic = query_cards(&conn, Some(domestic.id), "folder", None).unwrap();
        assert_eq!(under_domestic.len(), 1);

        // 兄弟分支不应被误纳入
        assert!(!under_work.iter().any(|c| c.title == "资讯"));
    }

    /// 把父分组拖进自己的后代必须被识别为成环
    #[test]
    fn cycle_detection_blocks_moving_parent_into_descendant() {
        let conn = mem();
        let a = create_folder(&conn, "A", None).unwrap();
        let b = create_folder(&conn, "B", Some(a.id)).unwrap();
        let c = create_folder(&conn, "C", Some(b.id)).unwrap();

        assert!(would_create_cycle(&conn, a.id, Some(b.id)).unwrap());
        assert!(would_create_cycle(&conn, a.id, Some(c.id)).unwrap());
        assert!(would_create_cycle(&conn, a.id, Some(a.id)).unwrap());
        assert!(!would_create_cycle(&conn, a.id, None).unwrap());
        assert!(!would_create_cycle(&conn, c.id, Some(a.id)).unwrap());
    }

    /// 移动分组后层级关系应更新
    #[test]
    fn moving_a_folder_updates_depth() {
        let conn = mem();
        let a = create_folder(&conn, "A", None).unwrap();
        let b = create_folder(&conn, "B", Some(a.id)).unwrap();
        let c = create_folder(&conn, "C", None).unwrap();

        // 把 C 挂到 B 下 → 变成第三层
        set_folder_parent(&conn, c.id, Some(b.id)).unwrap();
        let all = list_folders(&conn).unwrap();
        assert_eq!(
            all.iter().find(|f| f.id == c.id).unwrap().parent_id,
            Some(b.id)
        );

        // 再把 B 提回根级，C 应随 B 一起上移
        set_folder_parent(&conn, b.id, None).unwrap();
        let all = list_folders(&conn).unwrap();
        assert_eq!(all.iter().find(|f| f.id == b.id).unwrap().parent_id, None);
        assert_eq!(
            all.iter().find(|f| f.id == c.id).unwrap().parent_id,
            Some(b.id)
        );
    }

    /// 删除父分组应级联删除所有后代与其卡片
    #[test]
    fn deleting_folder_cascades_through_generations() {
        let conn = mem();
        let a = create_folder(&conn, "A", None).unwrap();
        let b = create_folder(&conn, "B", Some(a.id)).unwrap();
        let c = create_folder(&conn, "C", Some(b.id)).unwrap();
        add_card(&conn, Some(b.id), "https://x.com", "B 的卡片");
        add_card(&conn, Some(c.id), "https://y.com", "C 的卡片");

        delete_folder(&conn, a.id).unwrap();

        assert!(list_folders(&conn).unwrap().is_empty());
        assert!(query_cards(&conn, None, "all", None).unwrap().is_empty());
    }

    /// 同名分组：同级自动加序号，跨级允许同名
    #[test]
    fn sibling_names_are_deduplicated_but_same_name_under_other_parent_is_allowed() {
        let conn = mem();
        let a = create_folder(&conn, "工作", None).unwrap();
        let a2 = create_folder(&conn, "工作", None).unwrap();
        assert_eq!(a2.name, "工作 2");

        let child = create_folder(&conn, "工作", Some(a.id)).unwrap();
        assert_eq!(child.name, "工作", "不同父级下应允许同名");
        assert_eq!(child.parent_id, Some(a.id));
    }

    /// 默认分组种子应写入三个根级分组
    #[test]
    fn seed_creates_three_root_folders() {
        let conn = mem();
        seed(&conn).unwrap();
        let all = list_folders(&conn).unwrap();
        assert_eq!(all.len(), 3);
        assert!(all.iter().all(|f| f.parent_id.is_none()));
        assert!(all.iter().any(|f| f.name == "工作"));
    }

    /// 父分组处于折叠状态时新建子分组，必须自动展开父级，
    /// 否则用户看不到结果会以为功能失效。
    #[test]
    fn creating_subfolder_expands_the_parent() {
        let conn = mem();
        let parent = create_folder(&conn, "工作", None).unwrap();
        set_folder_expanded(&conn, parent.id, false).unwrap();
        assert!(!folder_by_id(&conn, parent.id).unwrap().expanded);

        create_folder(&conn, "竞品", Some(parent.id)).unwrap();

        assert!(
            folder_by_id(&conn, parent.id).unwrap().expanded,
            "新建子分组后父分组应自动展开"
        );
    }

    /// 点卯状态与本地日期比较
    #[test]
    fn clicking_today_clears_pending() {
        let conn = mem();
        let f = create_folder(&conn, "工作", None).unwrap();
        let card = add_card(&conn, Some(f.id), "https://x.com", "X");
        assert!(card.pending, "新建卡片应为今日未点卯");

        let clicked = set_card_clicked(&conn, card.id, true).unwrap();
        assert!(!clicked.pending, "点卯后当天不应再是未点卯");
        assert!(clicked.last_clicked_at.is_some());

        // 把记录改到昨天，应重新变为未点卯
        conn.execute(
            "UPDATE cards SET last_clicked_at = datetime('now','-1 day') WHERE id = ?1",
            params![card.id],
        )
        .unwrap();
        let yesterday = card_by_id(&conn, card.id).unwrap();
        assert!(yesterday.pending, "昨天的点卯记录今天应重新显示红点");

        let unmarked = set_card_clicked(&conn, card.id, false).unwrap();
        assert!(unmarked.pending);
        assert!(unmarked.last_clicked_at.is_none());
    }
}

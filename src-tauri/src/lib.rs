mod commands;
mod db;
mod metadata;
mod models;

use db::Db;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

/// 决定数据目录，这是「安装版」与「便携版」的关键差别所在。
///
/// - 开发模式：固定使用系统应用数据目录，避免调试时数据散落在 target 里。
/// - 发布模式：
///   * 若 **exe 同目录下已存在 `data/` 文件夹** → 使用它。
///     这就是便携版：把整个文件夹拷走即可连同数据一起迁移。
///   * 否则 → 使用 `%APPDATA%\com.dianmao.app\`。
///     安装版走这条路径，卸载程序不会误删用户数据。
///
/// 之所以用「data 目录是否存在」而不是「目录是否可写」来判断，
/// 是因为安装版若装在可写目录（如 D:\Apps）会被误判为便携版，
/// 卸载时连数据一起删除。
fn resolve_data_dir(app: &tauri::AppHandle) -> PathBuf {
    if !cfg!(debug_assertions) {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(parent) = exe.parent() {
                let portable = parent.join("data");
                if portable.is_dir() {
                    return portable;
                }
            }
        }
    }
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("dianmao"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 单实例保护：必须注册在其它插件之前。
        // 桌面快捷方式被重复点击时，不再开出第二个窗口去争抢同一个数据库，
        // 而是把已有窗口恢复到前台。
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.show();
                let _ = win.set_focus();
            }
        }))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let dir = resolve_data_dir(app.handle());
            std::fs::create_dir_all(&dir)?;
            let conn = db::open(&dir.join("dianmao.db"))?;
            log::info!("数据目录: {}", dir.display());
            app.manage(Db(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_folders,
            commands::create_folder,
            commands::rename_folder,
            commands::move_folder,
            commands::delete_folder,
            commands::set_folder_expanded,
            commands::list_cards,
            commands::create_card,
            commands::refetch_card,
            commands::update_card,
            commands::move_card,
            commands::delete_card,
            commands::restore_card,
            commands::mark_clicked,
            commands::unmark_clicked,
            commands::get_summary,
            commands::open_external,
        ])
        .run(tauri::generate_context!())
        .expect("error while running dianmao");
}

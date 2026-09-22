import { invoke } from "@tauri-apps/api/core"
import type { Card, FolderStat, ScanScope, Summary } from "./types"

/**
 * Tauri 命令的类型化封装。
 * 参数名使用 camelCase，Tauri 会自动映射到 Rust 侧的 snake_case 参数。
 */
export const api = {
  // ---- 分组
  listFolders: () => invoke<FolderStat[]>("list_folders"),
  createFolder: (name: string, parentId: number | null) =>
    invoke<FolderStat>("create_folder", { name, parentId }),
  renameFolder: (id: number, name: string) =>
    invoke<FolderStat>("rename_folder", { id, name }),
  moveFolder: (id: number, parentId: number | null) =>
    invoke<void>("move_folder", { id, parentId }),
  deleteFolder: (id: number) => invoke<void>("delete_folder", { id }),
  setFolderExpanded: (id: number, expanded: boolean) =>
    invoke<void>("set_folder_expanded", { id, expanded }),

  // ---- 卡片
  listCards: (folderId: number | null, scope: ScanScope, query: string | null) =>
    invoke<Card[]>("list_cards", { folderId, scope, query }),
  createCard: (url: string, folderId: number | null) =>
    invoke<Card>("create_card", { url, folderId }),
  refetchCard: (id: number) => invoke<Card>("refetch_card", { id }),
  updateCard: (id: number, title: string | null, description: string | null) =>
    invoke<Card>("update_card", { id, title, description }),
  moveCard: (id: number, folderId: number | null) =>
    invoke<Card>("move_card", { id, folderId }),
  deleteCard: (id: number) => invoke<Card>("delete_card", { id }),
  restoreCard: (card: Card) => invoke<Card>("restore_card", { card }),
  markClicked: (id: number) => invoke<Card>("mark_clicked", { id }),
  unmarkClicked: (id: number) => invoke<Card>("unmark_clicked", { id }),

  // ---- 其他
  getSummary: () => invoke<Summary>("get_summary"),
  openExternal: (url: string) => invoke<void>("open_external", { url }),
}

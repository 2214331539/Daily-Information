/** 与 src-tauri/src/models.rs 一一对应 */

export type FolderStat = {
  id: number
  parentId: number | null
  name: string
  sortOrder: number
  expanded: boolean
  /** 直接挂载的卡片总数 */
  total: number
  /** 直接挂载且今日未点卯的卡片数 */
  pending: number
}

export type Card = {
  id: number
  folderId: number | null
  url: string
  title: string
  description: string | null
  siteName: string | null
  imageUrl: string | null
  faviconUrl: string | null
  lastClickedAt: string | null
  pending: boolean
  sortOrder: number
  createdAt: string
}

export type Summary = {
  total: number
  pending: number
}

/** 前端构建的树节点，含子树聚合结果 */
export type FolderNode = FolderStat & {
  children: FolderNode[]
  depth: number
  /** 含所有后代的卡片总数 */
  aggTotal: number
  /** 含所有后代、今日未点卯的卡片数 */
  aggPending: number
}

export type ScanScope = "folder" | "all" | "pending"

/** 当前选中项：两个虚拟入口 + 未分组 + 具体分组 */
export type Selection =
  | { kind: "all" }
  | { kind: "pending" }
  | { kind: "unfiled" }
  | { kind: "folder"; id: number }

export type DragPayload =
  | { type: "card"; id: number }
  | { type: "folder"; id: number }

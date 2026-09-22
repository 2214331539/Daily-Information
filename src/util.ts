import type { FolderNode, FolderStat, Selection } from "./types"

/** 把扁平分组列表构建成树，并完成子树聚合（产品文档 4.3） */
export function buildTree(folders: FolderStat[]): FolderNode[] {
  const map = new Map<number, FolderNode>()
  for (const f of folders) {
    map.set(f.id, {
      ...f,
      children: [],
      depth: 0,
      aggTotal: f.total,
      aggPending: f.pending,
    })
  }

  const roots: FolderNode[] = []
  for (const f of folders) {
    const node = map.get(f.id)!
    if (f.parentId != null && map.has(f.parentId)) {
      map.get(f.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const walk = (nodes: FolderNode[], depth: number): { total: number; pending: number } => {
    let total = 0
    let pending = 0
    for (const node of nodes) {
      node.depth = depth
      const sub = walk(node.children, depth + 1)
      node.aggTotal = node.total + sub.total
      node.aggPending = node.pending + sub.pending
      total += node.aggTotal
      pending += node.aggPending
    }
    return { total, pending }
  }
  walk(roots, 0)
  return roots
}

/** 递归展平成用于渲染的行列表（跳过折叠节点的子级） */
export function flattenTree(nodes: FolderNode[]): FolderNode[] {
  const out: FolderNode[] = []
  const walk = (list: FolderNode[]) => {
    for (const n of list) {
      out.push(n)
      if (n.expanded && n.children.length > 0) walk(n.children)
    }
  }
  walk(nodes)
  return out
}

/** 收集某分组及其所有后代的 id */
export function collectSubtreeIds(node: FolderNode): number[] {
  const out = [node.id]
  for (const c of node.children) out.push(...collectSubtreeIds(c))
  return out
}

export function findNode(nodes: FolderNode[], id: number): FolderNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    const hit = findNode(n.children, id)
    if (hit) return hit
  }
  return null
}

export function selectionKey(s: Selection): string {
  switch (s.kind) {
    case "folder":
      return `folder:${s.id}`
    case "all":
      return "all"
    case "pending":
      return "pending"
    case "unfiled":
      return "unfiled"
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "")
  } catch {
    return url
  }
}

export function faviconFallback(url: string): string {
  try {
    const u = new URL(url)
    return `${u.origin}/favicon.ico`
  } catch {
    return ""
  }
}

/** 相对时间，用于卡片副信息 */
export function relativeDay(iso: string | null): string {
  if (!iso) return "从未点卯"
  const then = new Date(iso.endsWith("Z") ? iso : iso.replace(" ", "T") + "Z")
  if (Number.isNaN(then.getTime())) return ""
  const now = new Date()
  const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const d1 = new Date(then.getFullYear(), then.getMonth(), then.getDate())
  const days = Math.round((d0.getTime() - d1.getTime()) / 86400000)
  if (days <= 0) return "今天已点卯"
  if (days === 1) return "昨天点卯"
  if (days < 30) return `${days} 天前点卯`
  return `${Math.floor(days / 30)} 个月前点卯`
}

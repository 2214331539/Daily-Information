import type { DragEvent, MouseEvent } from "react"
import type { FolderNode, Selection, Summary } from "../types"
import FolderRow from "./FolderRow"
import { IconInbox, IconLayers, IconPlus } from "../icons"
import { flattenTree } from "../util"

type Props = {
  nodes: FolderNode[]
  selection: Selection
  summary: Summary
  unfiledTotal: number
  unfiledPending: number
  dragging: boolean
  onSelect: (s: Selection) => void
  onToggleExpand: (node: FolderNode) => void
  onContextFolder: (node: FolderNode, e: MouseEvent) => void
  onContextBackground: (e: MouseEvent) => void
  onNewFolder: () => void
  onDragStartFolder: (node: FolderNode) => void
  onDragEnd: () => void
  onDropOn: (folderId: number | null) => void
  onAddChild: (node: FolderNode) => void
}

export default function FolderTree({
  nodes,
  selection,
  summary,
  unfiledTotal,
  unfiledPending,
  dragging,
  onSelect,
  onToggleExpand,
  onContextFolder,
  onContextBackground,
  onNewFolder,
  onDragStartFolder,
  onDragEnd,
  onDropOn,
  onAddChild,
}: Props) {
  const rows = flattenTree(nodes)
  const hasNesting = rows.some(n => n.depth > 0)

  const handleUnfiledDrop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onDropOn(null)
  }

  /** 拖到侧栏空白处 = 移到根级（卡片则移入「未分组」） */
  const handleRootDrop = (e: DragEvent) => {
    e.preventDefault()
    onDropOn(null)
  }

  return (
    <div
      className="sidebar-scroll"
      onContextMenu={onContextBackground}
      onDragOver={e => {
        if (dragging) {
          e.preventDefault()
          e.dataTransfer.dropEffect = "move"
        }
      }}
      onDrop={handleRootDrop}
      role="tree"
      aria-label="巡检名册"
    >
      <div className="nav-group">
        <button
          className={`nav-item${selection.kind === "all" ? " is-active" : ""}`}
          onClick={() => onSelect({ kind: "all" })}
        >
          <IconLayers size={15} />
          <span className="nav-label">全部</span>
          <span className="frow-count nums">
            {summary.total - summary.pending}
            <span style={{ opacity: 0.5 }}>/</span>
            {summary.total}
          </span>
        </button>

        <button
          className={`nav-item${selection.kind === "pending" ? " is-active" : ""}`}
          onClick={() => onSelect({ kind: "pending" })}
        >
          {summary.pending > 0 ? <span className="dot" /> : <IconLayers size={15} />}
          <span className="nav-label">今日未点卯</span>
          <span className="frow-count nums">{summary.pending}</span>
        </button>

        {unfiledTotal > 0 && (
          <button
            className={`nav-item${selection.kind === "unfiled" ? " is-active" : ""}`}
            onClick={() => onSelect({ kind: "unfiled" })}
            onDragOver={e => {
              if (dragging) {
                e.preventDefault()
                e.dataTransfer.dropEffect = "move"
              }
            }}
            onDrop={handleUnfiledDrop}
          >
            <IconInbox size={15} />
            <span className="nav-label">未分组</span>
            {unfiledPending > 0 && <span className="dot" />}
            <span className="frow-count nums">
              {unfiledTotal - unfiledPending}
              <span style={{ opacity: 0.5 }}>/</span>
              {unfiledTotal}
            </span>
          </button>
        )}
      </div>

      <div className="nav-group">
        <div className="nav-group-title">
          <span className="micro">巡检名册</span>
          <button className="tb-btn" onClick={onNewFolder} title="新建分组">
            <IconPlus size={14} />
          </button>
        </div>

        {rows.length === 0 ? (
          <p
            style={{
              padding: "6px 10px 10px",
              fontSize: 12.5,
              lineHeight: 1.7,
              color: "var(--text-mute)",
            }}
          >
            还没有分组。点右上角 ＋ 新建一个，把网站归进去。
          </p>
        ) : (
          rows.map(node => (
            <FolderRow
              key={node.id}
              node={node}
              active={selection.kind === "folder" && selection.id === node.id}
              dragging={dragging}
              onSelect={id => onSelect({ kind: "folder", id })}
              onToggleExpand={onToggleExpand}
              onContext={onContextFolder}
              onDragStart={onDragStartFolder}
              onDragEnd={onDragEnd}
              onDropOn={onDropOn}
              onAddChild={onAddChild}
            />
          ))
        )}

        {rows.length > 0 && !hasNesting && (
          <p className="tree-hint">
            鼠标移到分组上，点右侧 ＋ 可新建子分组；也可以直接把一个分组拖到另一个分组上。
          </p>
        )}
      </div>
    </div>
  )
}

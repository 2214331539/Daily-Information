import { useEffect, useRef, useState } from "react"
import type { DragEvent, MouseEvent } from "react"
import type { FolderNode } from "../types"
import { IconCheck, IconChevron, IconPlus } from "../icons"

type Props = {
  node: FolderNode
  active: boolean
  dragging: boolean
  onSelect: (id: number) => void
  onToggleExpand: (node: FolderNode) => void
  onContext: (node: FolderNode, e: MouseEvent) => void
  onDragStart: (node: FolderNode) => void
  onDragEnd: () => void
  onDropOn: (folderId: number | null) => void
  onAddChild: (node: FolderNode) => void
}

export default function FolderRow({
  node,
  active,
  dragging,
  onSelect,
  onToggleExpand,
  onContext,
  onDragStart,
  onDragEnd,
  onDropOn,
  onAddChild,
}: Props) {
  const [over, setOver] = useState(false)
  const [sweep, setSweep] = useState(false)
  const prevPending = useRef(node.aggPending)

  // 子树巡检完成时播放一次扫光（产品文档 8.4）
  useEffect(() => {
    const was = prevPending.current
    prevPending.current = node.aggPending
    if (was > 0 && node.aggPending === 0 && node.aggTotal > 0) {
      setSweep(true)
      const t = window.setTimeout(() => setSweep(false), 950)
      return () => window.clearTimeout(t)
    }
  }, [node.aggPending, node.aggTotal])

  const handleDragOver = (e: DragEvent) => {
    if (!dragging) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setOver(true)
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    // 必须阻止冒泡：否则会继续触发侧栏根级的「移到根级」放置处理，
    // 导致刚嵌套好的分组又被立刻移回根级。
    e.stopPropagation()
    setOver(false)
    onDropOn(node.id)
  }

  const done = Math.max(0, node.aggTotal - node.aggPending)
  // 视觉缩进层级上限：超过 8 层不再继续内缩，避免深层嵌套把名称挤没。
  // 数据层仍支持无限层级。
  const visualDepth = Math.min(node.depth, 8)
  const classes = [
    "frow",
    active ? "is-active" : "",
    over ? "is-drop" : "",
    sweep ? "is-complete" : "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div
      className={classes}
      style={{ paddingLeft: 8 }}
      onClick={() => onSelect(node.id)}
      onContextMenu={e => onContext(node, e)}
      onDragOver={handleDragOver}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      draggable
      onDragStart={() => onDragStart(node)}
      onDragEnd={onDragEnd}
      role="treeitem"
      aria-expanded={node.children.length > 0 ? node.expanded : undefined}
      aria-selected={active}
    >
      {/* 每层一条竖线，让层级关系一眼可见 */}
      {Array.from({ length: visualDepth }).map((_, i) => (
        <span key={i} className="frow-guide" aria-hidden />
      ))}

      <span
        className={`frow-caret${node.expanded ? " is-open" : ""}${
          node.children.length === 0 ? " is-leaf" : ""
        }`}
        onClick={e => {
          e.stopPropagation()
          if (node.children.length > 0) onToggleExpand(node)
        }}
      >
        <IconChevron size={11} />
      </span>

      <span className="frow-name">{node.name}</span>

      {node.aggTotal > 0 &&
        (node.aggPending > 0 ? (
          <span className="dot" />
        ) : (
          <span className="tick">
            <IconCheck size={12} />
          </span>
        ))}

      {node.aggTotal > 0 && (
        <span className="frow-count nums">
          {done}
          <span style={{ opacity: 0.5 }}>/</span>
          {node.aggTotal}
        </span>
      )}

      <button
        className="frow-add"
        title={`在「${node.name}」下新建子分组`}
        aria-label={`在「${node.name}」下新建子分组`}
        onClick={e => {
          e.stopPropagation()
          onAddChild(node)
        }}
      >
        <IconPlus size={12} />
      </button>
    </div>
  )
}

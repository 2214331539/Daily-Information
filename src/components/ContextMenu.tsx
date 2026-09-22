import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { ReactNode } from "react"

export type MenuItem =
  | { kind: "sep" }
  | { kind: "label"; text: string }
  | {
      kind: "item"
      label: string
      icon?: ReactNode
      danger?: boolean
      onSelect: () => void
    }

type Props = {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const nx = Math.min(x, window.innerWidth - rect.width - 8)
    const ny = Math.min(y, window.innerHeight - rect.height - 8)
    setPos({ x: Math.max(8, nx), y: Math.max(8, ny) })
  }, [x, y])

  useEffect(() => {
    const close = () => onClose()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("mousedown", close)
    window.addEventListener("resize", close)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("mousedown", close)
      window.removeEventListener("resize", close)
      window.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="menu"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={e => e.stopPropagation()}
      role="menu"
    >
      {items.map((item, i) => {
        if (item.kind === "sep") return <div className="menu-sep" key={i} />
        if (item.kind === "label")
          return (
            <div className="menu-label" key={i}>
              {item.text}
            </div>
          )
        return (
          <button
            key={i}
            role="menuitem"
            className={`menu-item${item.danger ? " is-danger" : ""}`}
            onClick={() => {
              item.onSelect()
              onClose()
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}

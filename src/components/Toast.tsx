import { IconUndo } from "../icons"

export type ToastItem = {
  id: number
  text: string
  tone: "info" | "error"
  actionLabel?: string
  onAction?: () => void
}

type Props = {
  items: ToastItem[]
  onDismiss: (id: number) => void
}

export default function Toasts({ items, onDismiss }: Props) {
  if (items.length === 0) return null
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map(t => (
        <div key={t.id} className={`toast${t.tone === "error" ? " is-error" : ""}`}>
          <span>{t.text}</span>
          {t.onAction && (
            <button
              className="toast-action"
              onClick={() => {
                t.onAction?.()
                onDismiss(t.id)
              }}
            >
              <IconUndo size={13} />
              {t.actionLabel ?? "撤销"}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

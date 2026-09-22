import { useState } from "react"
import type { KeyboardEvent } from "react"
import type { Card, FolderNode } from "../types"
import Modal from "./Modal"

function enterConfirms(e: KeyboardEvent, submit: () => void) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault()
    submit()
  }
}

/* ------------------------------------------------------------ 新建分组 */

export function NewFolderDialog({
  parentName,
  onConfirm,
  onClose,
}: {
  parentName: string | null
  onConfirm: (name: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState("")
  const submit = () => {
    if (!name.trim()) return
    onConfirm(name.trim())
  }
  return (
    <Modal
      title={parentName ? `在「${parentName}」下新建分组` : "新建分组"}
      onClose={onClose}
      actions={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn" onClick={submit} disabled={!name.trim()}>
            创建
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field-label" htmlFor="nf-name">
          分组名称
        </label>
        <input
          id="nf-name"
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => enterConfirms(e, submit)}
          placeholder="例如：竞品、政策、内部系统"
        />
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------ 重命名分组 */

export function RenameFolderDialog({
  initial,
  onConfirm,
  onClose,
}: {
  initial: string
  onConfirm: (name: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState(initial)
  const submit = () => {
    if (!name.trim()) return
    onConfirm(name.trim())
  }
  return (
    <Modal
      title="重命名分组"
      onClose={onClose}
      actions={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn" onClick={submit} disabled={!name.trim()}>
            保存
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field-label" htmlFor="rf-name">
          分组名称
        </label>
        <input
          id="rf-name"
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => enterConfirms(e, submit)}
        />
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------ 编辑卡片 */

export function EditCardDialog({
  card,
  onConfirm,
  onClose,
}: {
  card: Card
  onConfirm: (title: string, description: string) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState(card.title)
  const [desc, setDesc] = useState(card.description ?? "")
  const submit = () => {
    if (!title.trim()) return
    onConfirm(title.trim(), desc.trim())
  }
  return (
    <Modal
      title="编辑卡片信息"
      onClose={onClose}
      actions={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn" onClick={submit} disabled={!title.trim()}>
            保存
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field-label" htmlFor="ec-title">
          名称
        </label>
        <input
          id="ec-title"
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => enterConfirms(e, submit)}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="ec-desc">
          简要信息
        </label>
        <textarea
          id="ec-desc"
          value={desc}
          onChange={e => setDesc(e.target.value)}
          placeholder="抓取失败时可以在这里手动填写"
        />
      </div>
      <p className="dialog-text" style={{ margin: 0, fontSize: 12 }}>
        {card.url}
      </p>
    </Modal>
  )
}

/* ------------------------------------------------------------ 删除分组确认 */

export function DeleteFolderDialog({
  name,
  cardCount,
  childCount,
  onConfirm,
  onClose,
}: {
  name: string
  cardCount: number
  childCount: number
  onConfirm: () => void
  onClose: () => void
}) {
  const detail =
    cardCount + childCount === 0
      ? "这个分组是空的，删除后无法恢复。"
      : `这个分组及其子分组下的 ${cardCount} 张卡片、${childCount} 个子分组会一并删除，无法恢复。`
  return (
    <Modal
      title={`删除分组「${name}」？`}
      onClose={onClose}
      actions={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button
            className="btn"
            style={{ background: "var(--signal)", color: "#fff" }}
            onClick={onConfirm}
          >
            删除
          </button>
        </>
      }
    >
      <p className="dialog-text">{detail}</p>
    </Modal>
  )
}

/* ------------------------------------------------------------ 移动卡片 */

export function MoveCardDialog({
  card,
  folders,
  onConfirm,
  onClose,
}: {
  card: Card
  folders: FolderNode[]
  onConfirm: (folderId: number | null) => void
  onClose: () => void
}) {
  const options: { id: number | null; label: string; depth: number }[] = [
    ...folders.map(f => ({ id: f.id as number | null, label: f.name, depth: f.depth })),
    { id: null, label: "未分组", depth: 0 },
  ]
  return (
    <Modal
      title="移动到分组"
      onClose={onClose}
      actions={
        <button className="btn btn-ghost" onClick={onClose}>
          取消
        </button>
      }
    >
      <p className="dialog-text" style={{ marginBottom: 12 }}>
        把「{card.title}」移动到：
      </p>
      <div className="pick-list">
        {options.map(o => (
          <button
            key={o.id ?? "none"}
            className={`pick-item${
              (card.folderId ?? null) === o.id ? " is-current" : ""
            }`}
            style={{ paddingLeft: 12 + o.depth * 16 }}
            onClick={() => onConfirm(o.id)}
          >
            {o.label}
            {(card.folderId ?? null) === o.id && (
              <span className="micro" style={{ letterSpacing: "0.06em" }}>
                当前
              </span>
            )}
          </button>
        ))}
      </div>
    </Modal>
  )
}

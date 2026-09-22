import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties, KeyboardEvent, MouseEvent } from "react"
import { api } from "./api"
import type {
  Card,
  DragPayload,
  FolderNode,
  FolderStat,
  ScanScope,
  Selection,
  Summary,
} from "./types"
import { buildTree, collectSubtreeIds, findNode, flattenTree } from "./util"
import { useTheme } from "./hooks/useTheme"
import TitleBar from "./components/TitleBar"
import FolderTree from "./components/FolderTree"
import CardGrid from "./components/CardGrid"
import AddSiteBar from "./components/AddSiteBar"
import ProgressRing from "./components/ProgressRing"
import ContextMenu from "./components/ContextMenu"
import type { MenuItem } from "./components/ContextMenu"
import Toasts from "./components/Toast"
import type { ToastItem } from "./components/Toast"
import {
  DeleteFolderDialog,
  EditCardDialog,
  MoveCardDialog,
  NewFolderDialog,
  RenameFolderDialog,
} from "./components/Dialogs"
import {
  IconCheck,
  IconEdit,
  IconExternal,
  IconLayers,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconUndo,
} from "./icons"

type DialogState =
  | { kind: "newFolder"; parentId: number | null; parentName: string | null }
  | { kind: "renameFolder"; id: number; initial: string }
  | { kind: "editCard"; card: Card }
  | {
      kind: "deleteFolder"
      id: number
      name: string
      cardCount: number
      childCount: number
    }
  | { kind: "moveCard"; card: Card }

function scopeOf(sel: Selection): { scope: ScanScope; folderId: number | null } {
  switch (sel.kind) {
    case "all":
      return { scope: "all", folderId: null }
    case "pending":
      return { scope: "pending", folderId: null }
    case "unfiled":
      return { scope: "folder", folderId: null }
    case "folder":
      return { scope: "folder", folderId: sel.id }
  }
}

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme()

  const [folders, setFolders] = useState<FolderStat[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [summary, setSummary] = useState<Summary>({ total: 0, pending: 0 })
  const [selection, setSelection] = useState<Selection>({ kind: "all" })
  const [query, setQuery] = useState("")
  const [onlyPending, setOnlyPending] = useState(false)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(
    null
  )
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [drag, setDrag] = useState<DragPayload | null>(null)
  const [sbWidth, setSbWidth] = useState(244)

  const searchRef = useRef<HTMLInputElement>(null)
  const addRef = useRef<HTMLInputElement>(null)
  const toastSeq = useRef(0)
  const resizing = useRef(false)

  /* ---------------------------------------------------------- 提示 */

  const pushToast = useCallback((t: Omit<ToastItem, "id">) => {
    const id = ++toastSeq.current
    setToasts(list => [...list, { ...t, id }])
    window.setTimeout(
      () => setToasts(list => list.filter(x => x.id !== id)),
      t.onAction ? 5200 : 3200
    )
  }, [])

  /* ---------------------------------------------------------- 数据加载 */

  const fetchCards = useCallback(async (sel: Selection, q: string) => {
    const { scope, folderId } = scopeOf(sel)
    return api.listCards(folderId, scope, q.trim() || null)
  }, [])

  const reloadMeta = useCallback(async () => {
    const [f, s] = await Promise.all([api.listFolders(), api.getSummary()])
    setFolders(f)
    setSummary(s)
  }, [])

  const reloadAll = useCallback(async () => {
    const [f, s, c] = await Promise.all([
      api.listFolders(),
      api.getSummary(),
      fetchCards(selection, query),
    ])
    setFolders(f)
    setSummary(s)
    setCards(c)
  }, [selection, query, fetchCards])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [f, s, c] = await Promise.all([
          api.listFolders(),
          api.getSummary(),
          fetchCards(selection, query),
        ])
        if (!alive) return
        setFolders(f)
        setSummary(s)
        setCards(c)
      } catch (e) {
        if (alive) pushToast({ text: String(e), tone: "error" })
      } finally {
        if (alive) setReady(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [selection, query, fetchCards, pushToast])

  /* ---------------------------------------------------------- 派生数据 */

  const tree = useMemo(() => buildTree(folders), [folders])
  const flat = useMemo(() => flattenTree(tree), [tree])

  const unfiledTotal = Math.max(
    0,
    summary.total - folders.reduce((a, f) => a + f.total, 0)
  )
  const unfiledPending = Math.max(
    0,
    summary.pending - folders.reduce((a, f) => a + f.pending, 0)
  )

  const visible = useMemo(
    () => (onlyPending ? cards.filter(c => c.pending) : cards),
    [cards, onlyPending]
  )
  const headPending = visible.filter(c => c.pending).length

  const currentNode =
    selection.kind === "folder" ? findNode(tree, selection.id) : null
  const headTitle =
    selection.kind === "all"
      ? "全部"
      : selection.kind === "pending"
        ? "今日未点卯"
        : selection.kind === "unfiled"
          ? "未分组"
          : (currentNode?.name ?? "分组")
  const targetLabel =
    selection.kind === "folder"
      ? (currentNode?.name ?? "当前分组")
      : selection.kind === "unfiled"
        ? "未分组"
        : "未分组"

  /* ---------------------------------------------------------- 操作 */

  const openCard = useCallback(
    async (card: Card) => {
      api
        .openExternal(card.url)
        .catch(e => pushToast({ text: String(e), tone: "error" }))

      if (!card.pending) return

      // 乐观更新：先让红点立刻消失，再落库
      const nowIso = new Date().toISOString()
      setCards(cs =>
        cs.map(c =>
          c.id === card.id ? { ...c, pending: false, lastClickedAt: nowIso } : c
        )
      )
      setSummary(s => ({ ...s, pending: Math.max(0, s.pending - 1) }))
      setFolders(fs =>
        fs.map(f =>
          f.id === card.folderId ? { ...f, pending: Math.max(0, f.pending - 1) } : f
        )
      )

      try {
        await api.markClicked(card.id)
        await reloadMeta()
        // 若当前视图会因点卯而变化，等动画播完再重排列表
        if (selection.kind === "pending" || onlyPending) {
          window.setTimeout(() => {
            fetchCards(selection, query)
              .then(setCards)
              .catch(() => {})
          }, 780)
        }
      } catch (e) {
        pushToast({ text: `记录失败：${String(e)}`, tone: "error" })
        await reloadAll()
      }
    },
    [
      pushToast,
      reloadMeta,
      reloadAll,
      selection,
      query,
      onlyPending,
      fetchCards,
    ]
  )

  const addCard = useCallback(
    async (url: string) => {
      setBusy("正在抓取页面信息…")
      try {
        const folderId = selection.kind === "folder" ? selection.id : null
        const card = await api.createCard(url, folderId)
        await reloadAll()
        pushToast({ text: `已收录「${card.title}」`, tone: "info" })
      } catch (e) {
        pushToast({ text: `收录失败：${String(e)}`, tone: "error" })
      } finally {
        setBusy(null)
      }
    },
    [selection, reloadAll, pushToast]
  )

  const removeCard = useCallback(
    async (card: Card) => {
      setCards(cs => cs.filter(c => c.id !== card.id))
      try {
        await api.deleteCard(card.id)
        await reloadAll()
        pushToast({
          text: `已删除「${card.title}」`,
          tone: "info",
          actionLabel: "撤销",
          onAction: async () => {
            try {
              await api.restoreCard(card)
              await reloadAll()
              pushToast({ text: "已恢复", tone: "info" })
            } catch (e) {
              pushToast({ text: String(e), tone: "error" })
            }
          },
        })
      } catch (e) {
        pushToast({ text: String(e), tone: "error" })
        await reloadAll()
      }
    },
    [reloadAll, pushToast]
  )

  const refetchCard = useCallback(
    async (card: Card) => {
      setBusy("正在重新抓取…")
      try {
        await api.refetchCard(card.id)
        await reloadAll()
        pushToast({ text: "已重新抓取页面信息", tone: "info" })
      } catch (e) {
        pushToast({ text: String(e), tone: "error" })
      } finally {
        setBusy(null)
      }
    },
    [reloadAll, pushToast]
  )

  const markCard = useCallback(
    async (card: Card, clicked: boolean) => {
      try {
        if (clicked) await api.markClicked(card.id)
        else await api.unmarkClicked(card.id)
        await reloadAll()
      } catch (e) {
        pushToast({ text: String(e), tone: "error" })
      }
    },
    [reloadAll, pushToast]
  )

  const moveCardTo = useCallback(
    async (card: Card, folderId: number | null) => {
      try {
        await api.moveCard(card.id, folderId)
        await reloadAll()
        pushToast({ text: "已移动", tone: "info" })
      } catch (e) {
        pushToast({ text: String(e), tone: "error" })
      }
    },
    [reloadAll, pushToast]
  )

  const toggleExpand = useCallback((node: FolderNode) => {
    setFolders(fs =>
      fs.map(f => (f.id === node.id ? { ...f, expanded: !f.expanded } : f))
    )
    api.setFolderExpanded(node.id, !node.expanded).catch(() => {})
  }, [])

  const onDropOn = useCallback(
    async (folderId: number | null) => {
      const payload = drag
      setDrag(null)
      if (!payload) return

      if (payload.type === "card") {
        const card = cards.find(c => c.id === payload.id)
        if (!card) return
        if ((card.folderId ?? null) === folderId) return
        await moveCardTo(card, folderId)
      } else {
        if (payload.id === folderId) return
        try {
          await api.moveFolder(payload.id, folderId)
          await reloadAll()
        } catch (e) {
          pushToast({ text: String(e), tone: "error" })
        }
      }
    },
    [drag, cards, moveCardTo, reloadAll, pushToast]
  )

  /* ---------------------------------------------------------- 右键菜单 */

  const openCardMenu = useCallback(
    (card: Card, e: MouseEvent) => {
      e.preventDefault()
      const items: MenuItem[] = [
        {
          kind: "item",
          label: "打开网页",
          icon: <IconExternal size={14} />,
          onSelect: () => openCard(card),
        },
        { kind: "sep" },
        {
          kind: "item",
          label: "编辑名称与简介",
          icon: <IconEdit size={14} />,
          onSelect: () => setDialog({ kind: "editCard", card }),
        },
        {
          kind: "item",
          label: "重新抓取信息",
          icon: <IconRefresh size={14} />,
          onSelect: () => refetchCard(card),
        },
        {
          kind: "item",
          label: "移动到分组…",
          icon: <IconLayers size={14} />,
          onSelect: () => setDialog({ kind: "moveCard", card }),
        },
        { kind: "sep" },
        card.pending
          ? {
              kind: "item",
              label: "标记为已点卯",
              icon: <IconCheck size={14} />,
              onSelect: () => markCard(card, true),
            }
          : {
              kind: "item",
              label: "取消点卯标记",
              icon: <IconUndo size={14} />,
              onSelect: () => markCard(card, false),
            },
        {
          kind: "item",
          label: "删除卡片",
          icon: <IconTrash size={14} />,
          danger: true,
          onSelect: () => removeCard(card),
        },
      ]
      setMenu({ x: e.clientX, y: e.clientY, items })
    },
    [openCard, refetchCard, markCard, removeCard]
  )

  const openFolderMenu = useCallback((node: FolderNode, e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const childCount = collectSubtreeIds(node).length - 1
    const items: MenuItem[] = [
      {
        kind: "item",
        label: "新建子分组",
        icon: <IconPlus size={14} />,
        onSelect: () =>
          setDialog({
            kind: "newFolder",
            parentId: node.id,
            parentName: node.name,
          }),
      },
      {
        kind: "item",
        label: "重命名",
        icon: <IconEdit size={14} />,
        onSelect: () =>
          setDialog({ kind: "renameFolder", id: node.id, initial: node.name }),
      },
      { kind: "sep" },
      {
        kind: "item",
        label: "删除分组",
        icon: <IconTrash size={14} />,
        danger: true,
        onSelect: () =>
          setDialog({
            kind: "deleteFolder",
            id: node.id,
            name: node.name,
            cardCount: node.aggTotal,
            childCount,
          }),
      },
    ]
    setMenu({ x: e.clientX, y: e.clientY, items })
  }, [])

  const newFolderDialog = useCallback(
    (parentId: number | null, parentName: string | null) =>
      setDialog({ kind: "newFolder", parentId, parentName }),
    []
  )

  /** 在指定分组下新建子分组 */
  const addChildFolder = useCallback(
    (node: FolderNode) =>
      setDialog({ kind: "newFolder", parentId: node.id, parentName: node.name }),
    []
  )

  const openBackgroundMenu = useCallback(
    (e: MouseEvent) => {
      e.preventDefault()
      setMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          {
            kind: "item",
            label: "新建分组",
            icon: <IconPlus size={14} />,
            onSelect: () => newFolderDialog(null, null),
          },
        ],
      })
    },
    [newFolderDialog]
  )

  /* ---------------------------------------------------------- 快捷键 */

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      } else if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault()
        addRef.current?.focus()
      } else if (e.key === "Escape") {
        setMenu(null)
        if (document.activeElement === searchRef.current) setQuery("")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  /* ---------------------------------------------------------- 侧栏拖拽调宽 */

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!resizing.current) return
      setSbWidth(Math.min(420, Math.max(190, e.clientX)))
    }
    const onUp = () => {
      if (!resizing.current) return
      resizing.current = false
      document.body.style.cursor = ""
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
  }, [])

  /* ---------------------------------------------------------- 渲染 */

  return (
    <div className="shell" style={{ "--sidebar-w": `${sbWidth}px` } as CSSProperties}>
      <TitleBar
        query={query}
        onQuery={setQuery}
        searchRef={searchRef}
        theme={theme}
        onToggleTheme={toggleTheme}
        onlyPending={onlyPending}
        onToggleOnlyPending={() => setOnlyPending(v => !v)}
      />

      <div className="body">
        <aside className="sidebar">
          <FolderTree
            nodes={tree}
            selection={selection}
            summary={summary}
            unfiledTotal={unfiledTotal}
            unfiledPending={unfiledPending}
            dragging={drag !== null}
            onSelect={setSelection}
            onToggleExpand={toggleExpand}
            onContextFolder={openFolderMenu}
            onContextBackground={openBackgroundMenu}
            onNewFolder={() => newFolderDialog(null, null)}
            onDragStartFolder={node => setDrag({ type: "folder", id: node.id })}
            onDragEnd={() => setDrag(null)}
            onDropOn={onDropOn}
            onAddChild={addChildFolder}
          />
        </aside>

        <div
          className="sidebar-resizer"
          onPointerDown={() => {
            resizing.current = true
            document.body.style.cursor = "col-resize"
          }}
          role="separator"
          aria-orientation="vertical"
          aria-label="调整侧栏宽度"
        />

        <main className="content">
          <div className="content-head">
            <div className="head-text">
              <h1 className="head-title">{headTitle}</h1>
              <div className="head-meta">
                <span className="nums">{visible.length} 张卡片</span>
                <span className="sep" />
                {headPending > 0 ? (
                  <span style={{ color: "var(--signal)" }} className="nums">
                    {headPending} 张今日未点卯
                  </span>
                ) : visible.length > 0 ? (
                  <span style={{ color: "var(--done)" }}>今日巡检已完成</span>
                ) : (
                  <span>暂无内容</span>
                )}
                {onlyPending && (
                  <>
                    <span className="sep" />
                    <span style={{ color: "var(--amber)" }}>仅看未点卯</span>
                  </>
                )}
              </div>
            </div>
            <ProgressRing
              total={visible.length}
              pending={headPending}
              size={46}
            />
          </div>

          <AddSiteBar
            inputRef={addRef}
            busy={busy !== null}
            targetLabel={targetLabel}
            onSubmit={addCard}
          />

          {ready ? (
            <CardGrid
              cards={visible}
              hasQuery={query.trim().length > 0}
              hasCardsEver={summary.total > 0}
              onOpen={openCard}
              onContext={openCardMenu}
              onDragStart={card => setDrag({ type: "card", id: card.id })}
              onDragEnd={() => setDrag(null)}
            />
          ) : (
            <div className="grid-wrap">
              <div className="loading">载入中…</div>
            </div>
          )}
        </main>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      )}

      {dialog?.kind === "newFolder" && (
        <NewFolderDialog
          parentName={dialog.parentName}
          onClose={() => setDialog(null)}
          onConfirm={async name => {
            setDialog(null)
            try {
              await api.createFolder(name, dialog.parentId)
              await reloadAll()
            } catch (e) {
              pushToast({ text: String(e), tone: "error" })
            }
          }}
        />
      )}

      {dialog?.kind === "renameFolder" && (
        <RenameFolderDialog
          initial={dialog.initial}
          onClose={() => setDialog(null)}
          onConfirm={async name => {
            setDialog(null)
            try {
              await api.renameFolder(dialog.id, name)
              await reloadAll()
            } catch (e) {
              pushToast({ text: String(e), tone: "error" })
            }
          }}
        />
      )}

      {dialog?.kind === "editCard" && (
        <EditCardDialog
          card={dialog.card}
          onClose={() => setDialog(null)}
          onConfirm={async (title, description) => {
            setDialog(null)
            try {
              await api.updateCard(dialog.card.id, title, description)
              await reloadAll()
            } catch (e) {
              pushToast({ text: String(e), tone: "error" })
            }
          }}
        />
      )}

      {dialog?.kind === "moveCard" && (
        <MoveCardDialog
          card={dialog.card}
          folders={flat}
          onClose={() => setDialog(null)}
          onConfirm={async folderId => {
            const card = dialog.card
            setDialog(null)
            await moveCardTo(card, folderId)
          }}
        />
      )}

      {dialog?.kind === "deleteFolder" && (
        <DeleteFolderDialog
          name={dialog.name}
          cardCount={dialog.cardCount}
          childCount={dialog.childCount}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            const id = dialog.id
            setDialog(null)
            try {
              await api.deleteFolder(id)
              setSelection({ kind: "all" })
              await reloadAll()
              pushToast({ text: "分组已删除", tone: "info" })
            } catch (e) {
              pushToast({ text: String(e), tone: "error" })
            }
          }}
        />
      )}

      <Toasts items={toasts} onDismiss={id => setToasts(l => l.filter(t => t.id !== id))} />

      {busy && (
        <div className="busy">
          <span className="spin">
            <IconRefresh size={13} />
          </span>
          {busy}
        </div>
      )}
    </div>
  )
}

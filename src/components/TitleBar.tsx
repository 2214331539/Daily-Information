import type { RefObject } from "react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import {
  IconClose,
  IconLayers,
  IconMaximize,
  IconMinimize,
  IconMoon,
  IconSearch,
  IconSun,
} from "../icons"
import type { Theme } from "../hooks/useTheme"

type Props = {
  query: string
  onQuery: (v: string) => void
  searchRef: RefObject<HTMLInputElement | null>
  theme: Theme
  onToggleTheme: () => void
  onlyPending: boolean
  onToggleOnlyPending: () => void
}

/**
 * 惰性获取窗口句柄。
 * 不要在模块顶层调用 getCurrentWindow()：一旦窗口 API 不可用，
 * 模块求值就会抛错，导致整个应用白屏而不是局部降级。
 */
const appWindow = () => getCurrentWindow()

export default function TitleBar({
  query,
  onQuery,
  searchRef,
  theme,
  onToggleTheme,
  onlyPending,
  onToggleOnlyPending,
}: Props) {
  return (
    <header className="titlebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden />
        <div className="brand-name">日常新闻</div>
      </div>

      <div className="titlebar-drag" data-tauri-drag-region />

      <div className="searchbox">
        <IconSearch size={14} />
        <input
          ref={searchRef}
          value={query}
          onChange={e => onQuery(e.target.value)}
          placeholder="搜索名称、简介或域名"
          spellCheck={false}
          aria-label="搜索"
        />
      </div>

      <button
        className={`tb-btn${onlyPending ? " is-on" : ""}`}
        onClick={onToggleOnlyPending}
        title="只看今日未点卯"
        aria-pressed={onlyPending}
      >
        <IconLayers size={16} />
      </button>

      <button
        className="tb-btn"
        onClick={onToggleTheme}
        title={theme === "dark" ? "切换到亮色" : "切换到暗色"}
      >
        {theme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
      </button>

      <div className="win-controls">
        <button
          className="win-btn"
          onClick={() => appWindow().minimize()}
          title="最小化"
          aria-label="最小化"
        >
          <IconMinimize size={15} />
        </button>
        <button
          className="win-btn"
          onClick={() => appWindow().toggleMaximize()}
          title="最大化"
          aria-label="最大化"
        >
          <IconMaximize size={14} />
        </button>
        <button
          className="win-btn is-close"
          onClick={() => appWindow().close()}
          title="关闭"
          aria-label="关闭"
        >
          <IconClose size={15} />
        </button>
      </div>
    </header>
  )
}

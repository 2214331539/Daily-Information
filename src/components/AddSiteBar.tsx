import { useState } from "react"
import type { FormEvent, RefObject } from "react"
import { IconPlus, IconRefresh } from "../icons"

type Props = {
  inputRef: RefObject<HTMLInputElement | null>
  busy: boolean
  targetLabel: string
  onSubmit: (url: string) => void
}

export default function AddSiteBar({ inputRef, busy, targetLabel, onSubmit }: Props) {
  const [value, setValue] = useState("")

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const url = value.trim()
    if (!url || busy) return
    onSubmit(url)
    setValue("")
  }

  return (
    <form className="addbar" onSubmit={submit}>
      <IconPlus size={15} />
      <input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="粘贴网址，回车收录"
        spellCheck={false}
        aria-label="添加网址"
      />
      <span className="addbar-hint">收录到 {targetLabel}</span>
      <button className="btn" type="submit" disabled={busy || value.trim().length === 0}>
        {busy ? (
          <>
            <span className="spin">
              <IconRefresh size={13} />
            </span>
            抓取中
          </>
        ) : (
          "收录"
        )}
      </button>
    </form>
  )
}

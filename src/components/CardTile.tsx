import { useState } from "react"
import type { CSSProperties, MouseEvent } from "react"
import type { Card } from "../types"
import { faviconFallback, hostOf } from "../util"
import { IconCheck } from "../icons"

type Props = {
  card: Card
  index: number
  onOpen: (card: Card) => void
  onContext: (card: Card, e: MouseEvent) => void
  onDragStart: (card: Card) => void
  onDragEnd: () => void
}

export default function CardTile({
  card,
  index,
  onOpen,
  onContext,
  onDragStart,
  onDragEnd,
}: Props) {
  const [justChecked, setJustChecked] = useState(false)
  const [faviconFailed, setFaviconFailed] = useState(false)

  const host = hostOf(card.url)
  const favicon = card.faviconUrl || faviconFallback(card.url)

  const handleClick = () => {
    if (card.pending) {
      setJustChecked(true)
      window.setTimeout(() => setJustChecked(false), 900)
    }
    onOpen(card)
  }

  return (
    <article
      className="card"
      style={{ "--i": index } as CSSProperties}
      onClick={handleClick}
      onContextMenu={e => onContext(card, e)}
      draggable
      onDragStart={() => onDragStart(card)}
      onDragEnd={onDragEnd}
      title={`${card.title}\n${card.url}`}
    >
      <div className="card-head">
        {favicon && !faviconFailed ? (
          <img
            className="card-favicon"
            src={favicon}
            alt=""
            loading="lazy"
            onError={() => setFaviconFailed(true)}
          />
        ) : (
          <span className="card-favicon is-fallback" aria-hidden>
            {host.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="card-host">{host}</span>
        <span className="card-status">
          {card.pending ? (
            <>
              <span className={`dot${justChecked ? " is-popping" : ""}`} />
              {justChecked && <span className="ripple" />}
            </>
          ) : (
            <span className={`tick${justChecked ? " tick-in" : ""}`}>
              <IconCheck size={13} />
            </span>
          )}
        </span>
      </div>

      <div className="card-title">{card.title}</div>
      <div className={`card-desc${card.description ? "" : " is-empty"}`}>
        {card.description || "暂无简介 · 右键可编辑"}
      </div>
    </article>
  )
}

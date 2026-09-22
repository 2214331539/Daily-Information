import type { MouseEvent } from "react"
import type { Card } from "../types"
import CardTile from "./CardTile"
import EmptyState from "./EmptyState"

type Props = {
  cards: Card[]
  hasQuery: boolean
  hasCardsEver: boolean
  onOpen: (card: Card) => void
  onContext: (card: Card, e: MouseEvent) => void
  onDragStart: (card: Card) => void
  onDragEnd: () => void
}

export default function CardGrid({
  cards,
  hasQuery,
  hasCardsEver,
  onOpen,
  onContext,
  onDragStart,
  onDragEnd,
}: Props) {
  return (
    <div className="grid-wrap">
      {cards.length === 0 ? (
        <EmptyState hasQuery={hasQuery} hasCardsEver={hasCardsEver} />
      ) : (
        <div className="grid">
          {cards.map((card, i) => (
            <CardTile
              key={card.id}
              card={card}
              index={Math.min(i, 12)}
              onOpen={onOpen}
              onContext={onContext}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      )}
    </div>
  )
}

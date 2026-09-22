import { IconPlus } from "../icons"

type Props = {
  hasQuery: boolean
  hasCardsEver: boolean
}

export default function EmptyState({ hasQuery, hasCardsEver }: Props) {
  if (hasQuery) {
    return (
      <div className="empty">
        <div className="empty-mark">
          <IconPlus size={16} />
        </div>
        <div className="empty-title">没有匹配的卡片</div>
        <p className="empty-text">换个关键字试试，或清空搜索框查看全部内容。</p>
      </div>
    )
  }

  if (!hasCardsEver) {
    return (
      <div className="empty">
        <div className="empty-mark">
          <IconPlus size={16} />
        </div>
        <div className="empty-title">还没有收录任何网站</div>
        <p className="empty-text">
          在上方输入框粘贴一个网址，会自动抓取它的名称与简介。
          <br />
          之后每天没点过的卡片会亮红点，点过就熄灭。
        </p>
      </div>
    )
  }

  return (
    <div className="empty">
      <div className="empty-mark">
        <IconPlus size={16} />
      </div>
      <div className="empty-title">今日巡检已完成</div>
      <p className="empty-text">
        这个视图下没有未点卯的卡片。
        <br />
        明天卯时，它们会重新亮起。
      </p>
    </div>
  )
}

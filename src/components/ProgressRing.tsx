type Props = {
  total: number
  pending: number
  size?: number
}

/** 巡检进度环：已完成 / 总数 */
export default function ProgressRing({ total, pending, size = 46 }: Props) {
  const done = Math.max(0, total - pending)
  const ratio = total === 0 ? 0 : done / total
  const stroke = 3.5
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - ratio)
  const isDone = total > 0 && pending === 0

  return (
    <svg
      className={`ring${isDone ? " is-done" : ""}`}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`巡检进度 ${done}/${total}`}
    >
      <circle
        className="ring-track"
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
      />
      <circle
        className="ring-bar"
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        className="ring-label"
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
      >
        {total === 0 ? "—" : `${done}/${total}`}
      </text>
    </svg>
  )
}

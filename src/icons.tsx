type P = { size?: number }

const base = (size = 16) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
})

export const IconSearch = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
)

export const IconPlus = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconChevron = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M9 6l6 6-6 6" />
  </svg>
)

export const IconFolder = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M3 7a2 2 0 0 1 2-2h3.5l2 2.2H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
)

export const IconCheck = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M4 12.5l5 5L20 6.5" />
  </svg>
)

export const IconInbox = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M3 13h5l1.5 3h5L16 13h5" />
    <path d="M5.5 5h13l2.5 8v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4z" />
  </svg>
)

export const IconLayers = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M12 3l9 5-9 5-9-5z" />
    <path d="M3 13l9 5 9-5" />
  </svg>
)

export const IconTrash = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
  </svg>
)

export const IconEdit = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="M14 6l4 4" />
  </svg>
)

export const IconRefresh = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M20 11a8 8 0 1 0-2.4 5.7" />
    <path d="M20 5v6h-6" />
  </svg>
)

export const IconExternal = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M14 4h6v6" />
    <path d="M20 4l-9 9" />
    <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
  </svg>
)

export const IconMoveTo = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M3 7a2 2 0 0 1 2-2h3l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M12 11v6M9.5 14.5L12 17l2.5-2.5" />
  </svg>
)

export const IconUndo = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M4 10h10a5 5 0 0 1 0 10h-4" />
    <path d="M8 6l-4 4 4 4" />
  </svg>
)

export const IconClose = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

export const IconMinimize = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M5 12h14" />
  </svg>
)

export const IconMaximize = ({ size }: P) => (
  <svg {...base(size)}>
    <rect x="5" y="5" width="14" height="14" rx="2" />
  </svg>
)

export const IconSun = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
  </svg>
)

export const IconMoon = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
  </svg>
)

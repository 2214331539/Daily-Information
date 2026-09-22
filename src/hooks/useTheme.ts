import { useCallback, useEffect, useState } from "react"

export type Theme = "dark" | "light"
const KEY = "dianmao.theme"

function initial(): Theme {
  const stored = localStorage.getItem(KEY)
  if (stored === "dark" || stored === "light") return stored
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initial)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(KEY, theme)
  }, [theme])

  const toggle = useCallback(() => {
    setTheme(t => (t === "dark" ? "light" : "dark"))
  }, [])

  return { theme, toggle }
}

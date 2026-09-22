import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

// Tauri 需要固定端口与关闭清屏
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    // WebView2 (Chromium 153) 支持全部现代语法，使用 Vite 8 默认的 oxc 转换与压缩。
    // 注意：不要再设置 minify: "esbuild"，Vite 8 已不再内置 esbuild。
    sourcemap: false,
  },
})

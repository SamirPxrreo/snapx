import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

/**
 * Arranca el frontend en un navegador normal con las APIs de Tauri simuladas
 * (ver mock/). Sirve para iterar en la UI sin recompilar Rust.
 *
 *   npm run ui
 */
export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname),
  resolve: {
    alias: [
      { find: /^@tauri-apps\/api\/core$/, replacement: resolve(__dirname, "mock/core.ts") },
      { find: /^@tauri-apps\/api\/window$/, replacement: resolve(__dirname, "mock/window.ts") },
      { find: /^@tauri-apps\/api\/event$/, replacement: resolve(__dirname, "mock/event.ts") },
      {
        find: /^@tauri-apps\/plugin-clipboard-manager$/,
        replacement: resolve(__dirname, "mock/clipboard.ts"),
      },
      { find: /^@tauri-apps\/plugin-dialog$/, replacement: resolve(__dirname, "mock/dialog.ts") },
    ],
  },
  server: {
    port: 5199,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**", "**/dist/**"],
    },
  },
});
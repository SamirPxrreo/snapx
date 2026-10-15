import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri quiere puerto fijo y hot reload apagado en prod
export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    // src-tauri/target lo usa cargo en paralelo: sin esto el watcher choca
    // con los .exe que se estan enlazando y vite muere con EBUSY.
    watch: {
      ignored: ["**/src-tauri/**", "**/dist/**"],
    },
  },
  build: {
    target: "chrome110",
    minify: false,
    sourcemap: false,
  },
}));

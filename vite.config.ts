import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri quiere puerto fijo y hot reload apagado en prod
export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: "chrome110",
    minify: false,
    sourcemap: false,
  },
}));

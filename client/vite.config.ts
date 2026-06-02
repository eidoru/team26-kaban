import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

export default defineConfig({
  envDir: resolve(__dirname, ".."),
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("node_modules/react-dom") ||
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-router-dom")
          ) {
            return "react";
          }
          if (id.includes("node_modules/@tanstack/react-query")) {
            return "query";
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: false,
      },
    },
  },
});

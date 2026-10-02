import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  define: {
    APP_VERSION: JSON.stringify("1.0.0"),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/molstar")) return "molstar";
        },
      },
    },
  },
});

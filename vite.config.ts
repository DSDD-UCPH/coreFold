import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const greenfoldProxy = {
  "/greenfold-api": {
    target: "https://greenfold.dsdd.one",
    changeOrigin: true,
    timeout: 600_000,
    proxyTimeout: 600_000,
    rewrite: (path: string) => path.replace(/^\/greenfold-api/, ""),
  },
};

export default defineConfig({
  plugins: [react()],
  define: {
    APP_VERSION: JSON.stringify("1.0.0"),
  },
  server: {
    proxy: greenfoldProxy,
  },
  preview: {
    proxy: greenfoldProxy,
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

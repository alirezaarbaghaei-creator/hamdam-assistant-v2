import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // مسیر واسط برای سرویس هوش مصنوعی؛ کلید و آدرس از متغیرهای محیطی سرور خوانده می‌شوند
      "/ai-proxy": {
        target: process.env.ANTHROPIC_BASE_URL || "http://localhost:9091/proxy/anthropic",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ai-proxy/, ""),
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        },
      },
    },
  },
});

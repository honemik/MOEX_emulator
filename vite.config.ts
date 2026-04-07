import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  build: {
    rolldownOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, "/");

          if (normalizedId.includes("/node_modules/react/") || normalizedId.includes("/node_modules/react-dom/")) {
            return "react-vendor";
          }

          if (normalizedId.includes("/node_modules/scheduler/")) {
            return "react-vendor";
          }

          if (normalizedId.includes("/node_modules/katex/")) {
            return "katex-vendor";
          }

          if (normalizedId.includes("/node_modules/@tauri-apps/")) {
            return "tauri-vendor";
          }

          if (
            normalizedId.endsWith("/src/components/QuestionPanel.tsx") ||
            normalizedId.endsWith("/src/components/StatusGrid.tsx")
          ) {
            return "exam-ui";
          }

          if (normalizedId.endsWith("/src/components/LegacyKeyboard.tsx")) {
            return "login-ui";
          }

          if (normalizedId.endsWith("/src/components/MathText.tsx")) {
            return "math-text";
          }
        },
      },
    },
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});

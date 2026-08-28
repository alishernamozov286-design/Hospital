import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        /**
         * Keeps the framework in its own file so it survives app redeploys in
         * the browser cache. React barely changes between releases; bundling it
         * with app code means every fix re-downloads it.
         */
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "react";
          if (id.includes("@radix-ui")) return "radix";
        },
      },
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  /**
   * Pre-bundled on dev start instead of on first request. Without this the very
   * first page load pays to discover and convert these packages one at a time,
   * which is the "refresh is slow in dev" cost — Vite then reloads the page
   * once it is done, so the user sees the splash twice.
   */
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "wouter",
      "@tanstack/react-query",
      "react-hook-form",
      "@hookform/resolvers/zod",
      "zod",
      "lucide-react",
      "next-themes",
    ],
  },
});

import path from "node:path";
import { defineConfig, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// Supervisor exports DISABLE_HOT_RELOAD=true when the platform sets ENABLE_RELOAD=false.
const hotReloadDisabled = process.env.DISABLE_HOT_RELOAD === "true";

// Pod inotify quota is node-shared and routinely exhausted; native fs.watch EMFILEs at
// boot. Polling is the load-bearing default (set before Vite evaluates the config).
if (!hotReloadDisabled) {
  process.env.CHOKIDAR_USEPOLLING = "true";
}

// https://vite.dev/config/
export default defineConfig(() => {
  return {
    // Deployment sub-path (e.g. /lab-tnl). Drives import.meta.env.BASE_URL, which the router
    // basename and the /api prefix in src/lib/api.ts both read.
    base: process.env.NEXT_PUBLIC_BASE_PATH
      ? `/${process.env.NEXT_PUBLIC_BASE_PATH.replace(/^\/+|\/+$/g, "")}/`
      : "/",
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        strategies: "injectManifest",
        srcDir: "src/pwa",
        filename: "sw.ts",
        injectRegister: false,
        includeManifestIcons: false,
        injectManifest: { globPatterns: ["offline.html"] },
        manifestFilename: "site.webmanifest",
        manifest: {
          name: "Laboratorium Jaringan Telekomunikasi ITS",
          short_name: "Lab TNL ITS",
          description: "Telecommunication Network Laboratory, ITS Surabaya",
          theme_color: "#111613",
          background_color: "#111613",
          display: "standalone",
          start_url: ".",
          scope: ".",
          icons: [
            { src: "android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
            { src: "android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
          ],
        },
      }),
    ],
    resolve: {
      alias: [
        { find: "@", replacement: path.resolve(__dirname, "./src") },
        // lucide 1.x dropped brand logos; src/lib/adapters/lucide-react.tsx restores them on top of the real package.
        { find: /^lucide-react$/, replacement: path.resolve(__dirname, "./src/lib/adapters/lucide-react.tsx") },
        { find: "lucide-react-upstream", replacement: path.resolve(__dirname, "./node_modules/lucide-react") },
        // recharts 3's Tooltip callback types reject the annotations agents write; src/lib/adapters/recharts.tsx adapts them.
        { find: /^recharts$/, replacement: path.resolve(__dirname, "./src/lib/adapters/recharts.tsx") },
        { find: "recharts-upstream", replacement: path.resolve(__dirname, "./node_modules/recharts") },
      ],
    },
    // Every shipped dep, pre-bundled up front. Vite discovers deps lazily, so the first
    // import outside the initial graph would trigger a re-optimize + reload mid-session.
    optimizeDeps: {
      include: [
        "@base-ui/react/button",
        "@base-ui/react/checkbox",
        "@base-ui/react/dialog",
        "@base-ui/react/input",
        "@base-ui/react/menu",
        "@base-ui/react/merge-props",
        "@base-ui/react/popover",
        "@base-ui/react/select",
        "@base-ui/react/tabs",
        "@base-ui/react/use-render",
        "@tanstack/react-query",
        "class-variance-authority",
        "clsx",
        "date-fns",
        "@icons-pack/react-simple-icons",
        "lucide-react-upstream",
        "motion/react",
        "next-themes",
        "react",
        "react-day-picker",
        "react-dom/client",
        "react-is",
        "react-router-dom",
        "recharts-upstream",
        "sonner",
        "tailwind-merge",
      ],
    },
    build: {
      rollupOptions: {
        output: {
          codeSplitting: { groups: [
            // Heavy editor deps (tiptap + extensions)
            { name: "vendor-editor", test: /node_modules[\\/](@tiptap|prosemirror-[^\\/]+)[\\/]/ },
            // Data viz
            { name: "vendor-viz", test: /node_modules[\\/](recharts|d3-[^\\/]+)[\\/]/ },
            // Animation
            { name: "vendor-motion", test: /node_modules[\\/](motion|motion-dom|motion-utils|framer-motion)[\\/]/ },
            // React Query
            { name: "vendor-query", test: /node_modules[\\/]@tanstack[\\/]/ },
            // UI primitives
            { name: "vendor-ui", test: /node_modules[\\/]@base-ui[\\/]/ },
            // Icons
            { name: "vendor-icons", test: /node_modules[\\/](lucide-react|@icons-pack)[\\/]/ },
            // Date utils
            { name: "vendor-date", test: /node_modules[\\/](date-fns|react-day-picker)[\\/]/ },
            // Router
            { name: "vendor-router", test: /node_modules[\\/](react-router|react-router-dom)[\\/]/ },
            // Misc
            { name: "vendor-misc", test: /node_modules[\\/](class-variance-authority|clsx|sonner|tailwind-merge|next-themes)[\\/]/ },
          ] },
        },
      },
      chunkSizeWarningLimit: 600,
    },
    server: {
      host: true,
      port: 3000,
      allowedHosts: true,
      cors: true,
      hmr: hotReloadDisabled ? false : true,
      watch: hotReloadDisabled ? null : { usePolling: true, interval: 300 },
      proxy: {
        "/api": {
          target: "http://localhost:8001",
          changeOrigin: true,
        },
      },
    },
  } satisfies UserConfig;
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import fs from "fs";

// Plugin to copy index.html as 404.html after build (SPA fallback)
function copy404Plugin() {
  return {
    name: 'copy-404',
    closeBundle() {
      const distIndex = path.resolve(__dirname, 'dist/index.html');
      const dist404 = path.resolve(__dirname, 'dist/404.html');
      if (fs.existsSync(distIndex)) {
        fs.copyFileSync(distIndex, dist404);
      }
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger(), copy404Plugin()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
}));

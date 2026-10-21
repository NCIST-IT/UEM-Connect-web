import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { productionHeaders, securityHeaders, securityHeadersPlugin } from "./config/security-headers.js";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), securityHeadersPlugin()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    host: "0.0.0.0",
    port: 5178,
    strictPort: true,
    allowedHosts: ["nixos.tailbc211e.ts.net"],
    cors: false,
    headers: securityHeaders,
  },
  preview: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
    cors: false,
    headers: productionHeaders,
  },
  build: { sourcemap: false, assetsInlineLimit: 0 },
});

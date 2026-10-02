import { defineConfig, optimizeDeps } from "vite";
import reactPlugin from "@vitejs/plugin-react";
import Pages from "vite-plugin-pages";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [reactPlugin(), Pages()],

  base: "/", //change to "/" for local development or to "/Abundance" for deployment
  build: {
    outDir: "dist",
    // engine.js (Kiri:Moto) uses top-level await, which the default target rejects
    target: "es2022",
  },
  server: {
    port: 4444,
  },

  optimizeDeps: {
    exclude: ["polygon-packer", "geometry-utils"],
  },
});

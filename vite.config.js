import { defineConfig } from "vite";
import reactPlugin from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [reactPlugin()],
  base: "https://barboursmith.github.io/Abundance/",
  build: {
    outDir: ".",
  },
  server: {
    port: 4444,
  },
});



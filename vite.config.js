import { defineConfig, optimizeDeps } from "vite";
import reactPlugin from "@vitejs/plugin-react";
import Pages from "vite-plugin-pages";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [reactPlugin(), Pages()],

  base: "/", //change to "/" for local development or to "/Abundance" for deployment
  build: {
    outDir: "dist",
  },
  server: {
    port: 4444,
  },

  optimizeDeps: {
    // replicad-shrink-wrap/replicad-decorate must not be pre-bundled: esbuild
    // would inline their own copy of "replicad", creating a second OC/replicad
    // module instance whose setOC() singleton is never initialized.
    exclude: [
      "polygon-packer",
      "geometry-utils",
      "replicad",
      "replicad-shrink-wrap",
      "replicad-decorate",
    ],
  },
});

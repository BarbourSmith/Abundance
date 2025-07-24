import { defineConfig, optimizeDeps } from "vite";
import reactPlugin from "@vitejs/plugin-react";
import Pages from "vite-plugin-pages";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [reactPlugin(), Pages()],

  base: "/", //change to "/" for local development or to "/Abundance/" for deployment
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Vendor chunks - split large dependencies into separate chunks
          if (id.includes('node_modules')) {
            // React and React ecosystem
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'react-vendor';
            }
            // Three.js and 3D related libraries
            if (id.includes('three') || id.includes('replicad') || id.includes('@react-three')) {
              return 'three-vendor';
            }
            // Code editor related
            if (id.includes('codemirror') || id.includes('@uiw')) {
              return 'editor-vendor';
            }
            // Material UI and UI libraries
            if (id.includes('@mui') || id.includes('@emotion') || id.includes('leva')) {
              return 'ui-vendor';
            }
            // GitHub and auth related
            if (id.includes('octokit') || id.includes('auth0')) {
              return 'github-vendor';
            }
            // Math and geometry utilities
            if (id.includes('mathjs') || id.includes('geometry-utils') || id.includes('polygon-packer')) {
              return 'math-vendor';
            }
            // Other vendor libraries
            return 'vendor';
          }
          
          // Split main routes into separate chunks
          if (id.includes('/components/main-routes/')) {
            const match = id.match(/\/components\/main-routes\/(.+?)\.jsx?/);
            if (match) {
              return `route-${match[1].toLowerCase()}`;
            }
          }
          
          // Split worker files
          if (id.includes('/worker/')) {
            return 'worker';
          }
          
          // Split molecules
          if (id.includes('/molecules/')) {
            return 'molecules';
          }
        }
      }
    },
    // Adjust chunk size warning limit
    chunkSizeWarningLimit: 1000
  },
  server: {
    port: 4444,
  },

  optimizeDeps: {
    exclude: ["polygon-packer", "geometry-utils"],
  },
});

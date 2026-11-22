import { defineConfig } from 'vite';

// Relative base so the build works on GitHub Pages under any repository name
// (https://<user>.github.io/<repo>/), on a custom domain, or when opened from a local static server.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2200,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('rapier3d')) return 'rapier';
          return undefined;
        },
      },
    },
  },
});

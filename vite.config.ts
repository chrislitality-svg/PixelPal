import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  base: './',
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        settings: resolve(__dirname, 'settings.html'),
        status: resolve(__dirname, 'status.html'),
        world: resolve(__dirname, 'world.html'),
        shop: resolve(__dirname, 'shop.html'),
        gallery: resolve(__dirname, 'gallery.html'),
        work: resolve(__dirname, 'work.html'),
        report: resolve(__dirname, 'report.html'),
        visitor: resolve(__dirname, 'visitor.html'),
      },
    },
  },
  server: {
    port: 5173,
  },
});

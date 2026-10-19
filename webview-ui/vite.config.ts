import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Builds the Fermas panel into ../dist/webview.js + ../dist/style.css.
// The extension host (src/providers/fermasWebviewProvider.ts) writes its own
// HTML shell and loads exactly those two files by name, so the names matter.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  publicDir: false,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: '../dist',
    emptyOutDir: false, // dist/ also holds extension.js, built by ../esbuild.js
    cssCodeSplit: false,
    sourcemap: true,
    minify: true,
    target: 'es2022',
    lib: {
      entry: 'src/main.tsx',
      formats: ['iife'],
      name: 'FermasWebview',
      fileName: () => 'webview.js',
      cssFileName: 'style',
    },
  },
});

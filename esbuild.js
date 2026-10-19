const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const watch = process.argv.includes('--watch');

async function build() {
  try {
    // 1. Build Extension Host
    const extensionCtx = await esbuild.context({
      entryPoints: ['src/extension.ts'],
      bundle: true,
      outfile: 'dist/extension.js',
      external: ['vscode'],
      format: 'cjs',
      platform: 'node',
      sourcemap: true,
      minify: false,
    });

    // 2. Build Webview App
    const webviewCtx = await esbuild.context({
      entryPoints: ['src/webview/main.ts'],
      bundle: true,
      outfile: 'dist/webview.js',
      format: 'iife',
      platform: 'browser',
      sourcemap: true,
      minify: false,
    });

    if (watch) {
      await extensionCtx.watch();
      await webviewCtx.watch();
      console.log('👀 Watching for file changes...');
    } else {
      await extensionCtx.rebuild();
      await webviewCtx.rebuild();
      await extensionCtx.dispose();
      await webviewCtx.dispose();
      console.log('✅ Build completed successfully!');
    }

    // Copy webview styles to dist/
    if (!fs.existsSync('dist')) {
      fs.mkdirSync('dist', { recursive: true });
    }
    if (fs.existsSync('src/webview/style.css')) {
      fs.copyFileSync('src/webview/style.css', 'dist/style.css');
    }
  } catch (err) {
    console.error('❌ Build failed:', err);
    process.exit(1);
  }
}

build();

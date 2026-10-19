const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

/**
 * Builds the extension host only.
 *
 * The webview is built separately by Vite from webview-ui/ — see
 * webview-ui/vite.config.ts. Do not add a webview entry point here or the two
 * builds will fight over dist/webview.js.
 */
const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  sourcemap: true,
  minify: false,
};

async function build() {
  if (watch) {
    const context = await esbuild.context(options);
    await context.watch();
    console.log('[fermas] watching extension host...');
    return;
  }
  await esbuild.build(options);
  console.log('[fermas] extension host built -> dist/extension.js');
}

build().catch((error) => {
  console.error('[fermas] build failed:', error);
  process.exit(1);
});

// ============================================================
// Build Script - esbuild 打包 + 静态资源复制
// ============================================================

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// 需要复制到 dist 的文件/目录
const STATIC_FILES = [
  'manifest.json',
  'popup.html',
  'sidepanel.html',
  'content.css',
];

const STATIC_DIRS = [
  'popup/styles',
  'sidepanel/styles',
  'icons',
];

const STATIC_SERVICE_FILES = [
  'services/iflytek-pcm-processor.js',
];

async function build() {
  const isWatch = process.argv.includes('--watch');

  // Clean dist
  if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true });
  }
  fs.mkdirSync(DIST, { recursive: true });

  // Copy static files
  for (const file of STATIC_FILES) {
    const src = path.join(ROOT, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(DIST, file));
      console.log(`  [copy] ${file}`);
    }
  }

  // Copy static directories
  for (const dir of STATIC_DIRS) {
    const src = path.join(ROOT, dir);
    const dest = path.join(DIST, dir);
    if (fs.existsSync(src)) {
      copyDir(src, dest);
      console.log(`  [copy] ${dir}/`);
    }
  }

  // Copy standalone service files (e.g. AudioWorklet modules)
  for (const file of STATIC_SERVICE_FILES) {
    const src = path.join(ROOT, file);
    const dest = path.join(DIST, file);
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      console.log(`  [copy] ${file}`);
    }
  }

  // Bundle JS
  const commonOptions = {
    bundle: true,
    sourcemap: false,
    minify: !isWatch,
    target: 'chrome110',
    logLevel: 'info',
  };

  // Background service worker (ESM)
  await esbuild.build({
    ...commonOptions,
    entryPoints: [path.join(ROOT, 'background.js')],
    outfile: path.join(DIST, 'background.js'),
    format: 'esm',
  });

  // Content script (IIFE) - includes jd-parser inline
  await esbuild.build({
    ...commonOptions,
    entryPoints: [path.join(ROOT, 'content.js')],
    outfile: path.join(DIST, 'content.js'),
    format: 'iife',
  });

  // Popup (IIFE)
  await esbuild.build({
    ...commonOptions,
    entryPoints: [path.join(ROOT, 'popup.js')],
    outfile: path.join(DIST, 'popup.js'),
    format: 'iife',
  });

  // Sidepanel (IIFE + React)
  await esbuild.build({
    ...commonOptions,
    entryPoints: [path.join(ROOT, 'sidepanel.jsx')],
    outfile: path.join(DIST, 'sidepanel.js'),
    format: 'iife',
    loader: { '.jsx': 'jsx' },
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  });

  console.log('\n✅ Build complete! Load dist/ folder in chrome://extensions\n');

  if (isWatch) {
    console.log('👀 Watching for changes...\n');
    // Watch source files
    const ctx = await esbuild.context({
      ...commonOptions,
      entryPoints: [
        path.join(ROOT, 'background.js'),
        path.join(ROOT, 'content.js'),
        path.join(ROOT, 'popup.js'),
        path.join(ROOT, 'sidepanel.jsx'),
      ],
      outdir: DIST,
      format: 'iife',
      loader: { '.jsx': 'jsx' },
    });
    await ctx.watch();
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});

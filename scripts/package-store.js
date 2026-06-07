// ============================================================
// Package Script - 将 dist/ 打包为 Chrome Web Store 上传 zip
// ============================================================

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const zipName = `interview-ai-${manifest.version}.zip`;
const zipPath = path.join(ROOT, zipName);

if (!fs.existsSync(DIST)) {
  console.error('dist/ not found. Run npm run build first.');
  process.exit(1);
}

if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

execSync(`cd "${DIST}" && zip -r "${zipPath}" . -x "*.DS_Store"`, { stdio: 'inherit' });

const sizeMb = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(2);
console.log(`\n✅ Store package ready: ${zipName} (${sizeMb} MB)`);
console.log('   Upload at: https://chrome.google.com/webstore/devconsole\n');

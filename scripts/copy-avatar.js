#!/usr/bin/env node
// Temporary script to copy the AI avatar image to the icons directory
const fs = require('fs');
const path = require('path');

const src = path.resolve(__dirname, '..', '..', '..', '.qoderwork', 'workspace', 'mpqmewv496c220wn', 'vibe_images', 'ai-interviewer-avatar_1780476947.png');
const dst = path.resolve(__dirname, '..', 'icons', 'ai-avatar.png');

// Ensure destination directory exists
const dstDir = path.dirname(dst);
if (!fs.existsSync(dstDir)) {
  fs.mkdirSync(dstDir, { recursive: true });
}

fs.copyFileSync(src, dst);
console.log('Copied to:', dst);

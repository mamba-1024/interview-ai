// ============================================================
// Icon Generator - 生成 Chrome 插件图标
// 使用 sharp 生成 PNG，如果不可用则生成 SVG
// ============================================================

const fs = require('fs');
const path = require('path');

const ICONS_DIR = path.resolve(__dirname, '..', 'icons');
const SIZES = [16, 48, 128];

// SVG 图标模板
function generateSVG(size) {
  const fontSize = Math.round(size * 0.38);
  const strokeWidth = Math.max(1.5, size * 0.06);
  const robotSize = Math.round(size * 0.55);
  const offset = Math.round(size * 0.22);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4F46E5"/>
      <stop offset="100%" style="stop-color:#3730A3"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.2)}" fill="url(#bg)"/>
  <g transform="translate(${offset}, ${offset})" stroke="white" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M${robotSize * 0.5} ${robotSize * 0.17}V0H${robotSize * 0.33}"/>
    <rect width="${robotSize * 0.67}" height="${robotSize * 0.5}" x="${robotSize * 0.17}" y="${robotSize * 0.33}" rx="${robotSize * 0.08}"/>
    <path d="M${robotSize * 0.08} ${robotSize * 0.58}h${robotSize * 0.08}"/>
    <path d="M${robotSize * 0.83} ${robotSize * 0.58}h${robotSize * 0.08}"/>
    <path d="M${robotSize * 0.62} ${robotSize * 0.54}v${robotSize * 0.08}"/>
    <path d="M${robotSize * 0.38} ${robotSize * 0.54}v${robotSize * 0.08}"/>
  </g>
</svg>`;
}

async function generate() {
  // Ensure icons directory exists
  if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
  }

  // Try to use sharp for PNG generation
  let sharp;
  try {
    sharp = require('sharp');
  } catch (e) {
    // sharp not available, generate SVGs instead
  }

  for (const size of SIZES) {
    const svg = generateSVG(size);

    if (sharp) {
      // Generate PNG using sharp
      const pngBuffer = await sharp(Buffer.from(svg))
        .resize(size, size)
        .png()
        .toBuffer();
      fs.writeFileSync(path.join(ICONS_DIR, `icon${size}.png`), pngBuffer);
      console.log(`  Generated icon${size}.png`);
    } else {
      // Write SVG as fallback (Chrome requires PNG, but this helps with development)
      fs.writeFileSync(path.join(ICONS_DIR, `icon${size}.svg`), svg);

      // Also create a simple PNG using raw data (minimal valid PNG)
      createMinimalPNG(size);
      console.log(`  Generated icon${size}.svg + icon${size}.png (placeholder)`);
    }
  }

  console.log('\n✅ Icons generated in icons/\n');
  if (!sharp) {
    console.log('💡 提示: 安装 sharp 可生成高质量 PNG 图标: npm install sharp');
    console.log('   当前使用 SVG + 占位 PNG，发布前请替换为正式图标\n');
  }
}

// Create a minimal valid PNG (solid color) as placeholder
function createMinimalPNG(size) {
  // Minimal 1x1 indigo PNG, scaled conceptually
  // For actual use, replace with real icons
  const { Buffer } = require('buffer');

  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0); // chunk length
  ihdr.write('IHDR', 4);
  ihdr.writeUInt32BE(size, 8); // width
  ihdr.writeUInt32BE(size, 12); // height
  ihdr.writeUInt8(8, 16); // bit depth
  ihdr.writeUInt8(2, 17); // color type (RGB)
  ihdr.writeUInt8(0, 18); // compression
  ihdr.writeUInt8(0, 19); // filter
  ihdr.writeUInt8(0, 20); // interlace
  const ihdrCrc = crc32(ihdr.slice(4, 21));
  ihdr.writeUInt32BE(ihdrCrc >>> 0, 21);

  // IDAT chunk - raw image data (indigo color #4F46E5)
  const rawData = [];
  for (let y = 0; y < size; y++) {
    rawData.push(0); // filter byte
    for (let x = 0; x < size; x++) {
      rawData.push(79, 70, 229); // RGB: #4F46E5
    }
  }

  const zlib = require('zlib');
  const compressed = zlib.deflateSync(Buffer.from(rawData));

  const idat = Buffer.alloc(compressed.length + 12);
  idat.writeUInt32BE(compressed.length, 0);
  idat.write('IDAT', 4);
  compressed.copy(idat, 8);
  const idatCrc = crc32(Buffer.concat([Buffer.from('IDAT'), compressed]));
  idat.writeUInt32BE(idatCrc >>> 0, compressed.length + 8);

  // IEND chunk
  const iend = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);

  const png = Buffer.concat([signature, ihdr, idat, iend]);
  fs.writeFileSync(path.join(ICONS_DIR, `icon${size}.png`), png);
}

// Simple CRC32 implementation for PNG
function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return crc ^ -1;
}

generate().catch((err) => {
  console.error('Icon generation failed:', err);
});

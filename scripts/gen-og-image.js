import sharp from 'sharp';
import { writeFileSync } from 'fs';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0A0E1A"/>
      <stop offset="100%" stop-color="#141B2D"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="0" y="0" width="1200" height="4" fill="#E8002D"/>
  <text x="600" y="260" font-family="Arial,Helvetica,sans-serif" font-size="72" font-weight="900" fill="#FFFFFF" text-anchor="middle" letter-spacing="4">GRIDFEED</text>
  <text x="600" y="330" font-family="Arial,Helvetica,sans-serif" font-size="24" fill="#8B92A5" text-anchor="middle" letter-spacing="6">YOUR DAILY F1 FIX</text>
  <line x1="500" y1="370" x2="700" y2="370" stroke="#E8002D" stroke-width="2"/>
  <text x="600" y="420" font-family="Arial,Helvetica,sans-serif" font-size="18" fill="#5A6178" text-anchor="middle">LIVE TIMING  ·  RACE ANALYSIS  ·  BETTING PICKS</text>
  <text x="600" y="580" font-family="Arial,Helvetica,sans-serif" font-size="16" fill="#3A4158" text-anchor="middle">gridfeed.co</text>
</svg>`;

const buf = await sharp(Buffer.from(svg)).png().toBuffer();
writeFileSync('og-image.png', buf);
console.log('Generated og-image.png (1200x630)');

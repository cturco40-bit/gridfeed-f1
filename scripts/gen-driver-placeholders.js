import sharp from 'sharp';
import { writeFileSync, existsSync } from 'fs';

// Generate PNG placeholders for any driver missing a real headshot.
// Slug, initials, team color (must match DSTATS in index.html)
const drivers = [
  { slug: 'antonelli',  ini: 'ANT', color: '#27F4D2' },
  { slug: 'russell',    ini: 'RUS', color: '#27F4D2' },
  { slug: 'leclerc',    ini: 'LEC', color: '#E8002D' },
  { slug: 'hamilton',   ini: 'HAM', color: '#E8002D' },
  { slug: 'norris',     ini: 'NOR', color: '#FF8000' },
  { slug: 'piastri',    ini: 'PIA', color: '#FF8000' },
  { slug: 'verstappen', ini: 'VER', color: '#3671C6' },
  { slug: 'hadjar',     ini: 'HAD', color: '#3671C6' },
  { slug: 'alonso',     ini: 'ALO', color: '#229971' },
  { slug: 'stroll',     ini: 'STR', color: '#229971' },
  { slug: 'gasly',      ini: 'GAS', color: '#FF87BC' },
  { slug: 'colapinto',  ini: 'COL', color: '#FF87BC' },
  { slug: 'sainz',      ini: 'SAI', color: '#64C4FF' },
  { slug: 'albon',      ini: 'ALB', color: '#64C4FF' },
  { slug: 'ocon',       ini: 'OCO', color: '#B6BABD' },
  { slug: 'bearman',    ini: 'BEA', color: '#B6BABD' },
  { slug: 'lawson',     ini: 'LAW', color: '#6692FF' },
  { slug: 'lindblad',   ini: 'LIN', color: '#6692FF' },
  { slug: 'hulkenberg', ini: 'HUL', color: '#52E252' },
  { slug: 'bortoleto',  ini: 'BOR', color: '#52E252' },
  { slug: 'perez',      ini: 'PER', color: '#CC0000' },
  { slug: 'bottas',     ini: 'BOT', color: '#CC0000' },
];

let written = 0;
for (const d of drivers) {
  const path = 'drivers/' + d.slug + '.png';
  if (existsSync(path)) {
    console.log('  exists:', d.slug);
    continue;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
  <rect width="200" height="200" fill="${d.color}"/>
  <text x="100" y="120" font-family="Arial,Helvetica,sans-serif" font-size="56" font-weight="900" fill="white" text-anchor="middle">${d.ini}</text>
</svg>`;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  writeFileSync(path, buf);
  console.log('  created:', d.slug);
  written++;
}
console.log('\nGenerated', written, 'placeholders');

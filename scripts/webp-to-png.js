// Convert all webp driver portraits to PNG so they work with the existing
// /drivers/{name}.png URL pattern in driverImg() and the canvas function.
import sharp from 'sharp';
import { readdirSync, statSync, writeFileSync, unlinkSync } from 'fs';
import path from 'path';

const dir = 'drivers';
const files = readdirSync(dir).filter(f => f.endsWith('.webp'));

for (const f of files) {
  const src = path.join(dir, f);
  const dst = src.replace(/\.webp$/, '.png');
  try {
    const buf = await sharp(src).png().toBuffer();
    writeFileSync(dst, buf);
    unlinkSync(src);
    console.log('Converted', f, '->', path.basename(dst), '(' + Math.round(buf.length / 1024) + 'KB)');
  } catch (e) {
    console.warn('FAIL', f, e.message);
  }
}

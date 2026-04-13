// Fetch all 22 official F1 driver portraits from media.formula1.com
// These are higher quality than OpenF1 and exist for every driver.
// Run: node scripts/fetch-f1-headshots.js
import { writeFileSync, mkdirSync } from 'fs';

const BASE = 'https://media.formula1.com/image/upload/c_lfill,w_720/q_auto/v1740000001/common/f1';
const YEAR = '2026';

// [team_slug, driver_id, local_filename]
const drivers = [
  ['mercedes', 'georus01', 'russell'],
  ['mercedes', 'andant01', 'antonelli'],
  ['ferrari', 'chalec01', 'leclerc'],
  ['ferrari', 'lewham01', 'hamilton'],
  ['mclaren', 'lannor01', 'norris'],
  ['mclaren', 'oscpia01', 'piastri'],
  ['haasf1team', 'estoco01', 'ocon'],
  ['haasf1team', 'olibea01', 'bearman'],
  ['alpine', 'piegas01', 'gasly'],
  ['alpine', 'fracol01', 'colapinto'],
  ['redbullracing', 'maxver01', 'verstappen'],
  ['redbullracing', 'isahad01', 'hadjar'],
  ['racingbulls', 'lialaw01', 'lawson'],
  ['racingbulls', 'arvlin01', 'lindblad'],
  ['audi', 'nichul01', 'hulkenberg'],
  ['audi', 'gabbor01', 'bortoleto'],
  ['williams', 'carsai01', 'sainz'],
  ['williams', 'alealb01', 'albon'],
  ['cadillac', 'serper01', 'perez'],
  ['cadillac', 'valbot01', 'bottas'],
  ['astonmartin', 'feralo01', 'alonso'],
  ['astonmartin', 'lanstr01', 'stroll'],
];

mkdirSync('drivers', { recursive: true });

let ok = 0, fail = 0;
for (const [team, did, local] of drivers) {
  const url = `${BASE}/${YEAR}/${team}/${did}/${YEAR}${team}${did}right.webp`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn('FAIL', local, 'HTTP', res.status);
      fail++;
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    // Save the webp directly — @napi-rs/canvas can decode webp
    writeFileSync('drivers/' + local + '.webp', buf);
    console.log('OK', local, '(' + Math.round(buf.length / 1024) + 'KB)');
    ok++;
  } catch (e) {
    console.warn('FAIL', local, e.message);
    fail++;
  }
}
console.log(`\n${ok} ok, ${fail} failed`);

import { createCanvas, loadImage } from '@napi-rs/canvas';
import path from 'path';
import { fileURLToPath } from 'url';
import { sb, fetchWT, logSync, json } from './lib/shared.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DRIVER_FILE = {
  'Kimi Antonelli': 'antonelli', 'George Russell': 'russell',
  'Charles Leclerc': 'leclerc', 'Lewis Hamilton': 'hamilton',
  'Lando Norris': 'norris', 'Oscar Piastri': 'piastri',
  'Max Verstappen': 'verstappen', 'Isack Hadjar': 'hadjar',
  'Fernando Alonso': 'alonso', 'Lance Stroll': 'stroll',
  'Pierre Gasly': 'gasly', 'Franco Colapinto': 'colapinto',
  'Carlos Sainz': 'sainz', 'Alexander Albon': 'albon',
  'Esteban Ocon': 'ocon', 'Oliver Bearman': 'bearman',
  'Liam Lawson': 'lawson', 'Arvid Lindblad': 'lindblad',
  'Nico Hulkenberg': 'hulkenberg', 'Gabriel Bortoleto': 'bortoleto',
  'Sergio Perez': 'perez', 'Valtteri Bottas': 'bottas'
};

const TEAM_COLORS = {
  'Mercedes': '#27F4D2', 'Ferrari': '#E8002D', 'McLaren': '#FF8000',
  'Red Bull': '#3671C6', 'Aston Martin': '#229971', 'Alpine': '#FF87BC',
  'Williams': '#64C4FF', 'Racing Bulls': '#6692FF', 'Haas': '#B6BABD',
  'Audi': '#52E252', 'Cadillac': '#CC0000'
};

const DRIVER_TEAMS = {
  'Kimi Antonelli': 'Mercedes', 'George Russell': 'Mercedes',
  'Charles Leclerc': 'Ferrari', 'Lewis Hamilton': 'Ferrari',
  'Lando Norris': 'McLaren', 'Oscar Piastri': 'McLaren',
  'Max Verstappen': 'Red Bull', 'Isack Hadjar': 'Red Bull',
  'Fernando Alonso': 'Aston Martin', 'Lance Stroll': 'Aston Martin',
  'Pierre Gasly': 'Alpine', 'Franco Colapinto': 'Alpine',
  'Carlos Sainz': 'Williams', 'Alexander Albon': 'Williams',
  'Esteban Ocon': 'Haas', 'Oliver Bearman': 'Haas',
  'Liam Lawson': 'Racing Bulls', 'Arvid Lindblad': 'Racing Bulls',
  'Nico Hulkenberg': 'Audi', 'Gabriel Bortoleto': 'Audi',
  'Sergio Perez': 'Cadillac', 'Valtteri Bottas': 'Cadillac'
};

const TAG_COLORS = {
  'RACE': '#E8002D', 'QUALIFYING': '#1E40AF', 'ANALYSIS': '#7C3AED',
  'PREVIEW': '#059669', 'BETTING': '#D97706', 'BREAKING': '#E8002D',
  'RUMOUR': '#EA580C', 'CHAMPIONSHIP': '#E8002D'
};

// Look at title first (most relevant subject), then body. Title hits get priority.
function extractDrivers(title, body) {
  const found = [];
  const seen = new Set();
  const inTitle = (name, last) => (title || '').includes(name) || (title || '').includes(last);
  const inBody = (name, last) => (body || '').includes(name) || (body || '').includes(last);

  // Pass 1: drivers in the title (ordered by first occurrence position in title)
  const titleHits = [];
  for (const name of Object.keys(DRIVER_FILE)) {
    const last = name.split(' ').pop();
    const idx = (title || '').indexOf(last);
    if (idx >= 0 || (title || '').includes(name)) {
      titleHits.push({ name, idx: idx >= 0 ? idx : (title || '').indexOf(name) });
    }
  }
  titleHits.sort((a, b) => a.idx - b.idx);
  for (const t of titleHits) {
    if (found.length >= 2) break;
    found.push(t.name);
    seen.add(t.name);
  }

  // Pass 2: fill remaining slots from body
  if (found.length < 2) {
    for (const name of Object.keys(DRIVER_FILE)) {
      if (seen.has(name)) continue;
      const last = name.split(' ').pop();
      if (inBody(name, last)) {
        found.push(name);
        seen.add(name);
        if (found.length >= 2) break;
      }
    }
  }
  return found;
}

// Returns { image, isReal } — isReal = false when we only have a small
// placeholder PNG (team-colored square with initials), so we know to use a
// typography-forward layout instead of drawing it as a fake portrait
const REAL_PHOTO_MIN_BYTES = 6000; // OpenF1 photos are 11-13KB, placeholders are 2-5KB
async function loadHeadshot(name) {
  const file = DRIVER_FILE[name];
  if (!file) return { image: null, isReal: false };
  const fs = await import('fs/promises');
  const candidates = [
    path.join(HERE, '..', '..', 'drivers', file + '.png'),
    path.join(process.cwd(), 'drivers', file + '.png'),
    path.join(HERE, 'drivers', file + '.png'),
  ];
  for (const p of candidates) {
    try {
      const buf = await fs.readFile(p);
      const isReal = buf.length >= REAL_PHOTO_MIN_BYTES;
      const image = await loadImage(buf);
      return { image, isReal };
    } catch {}
  }
  // Fallback to network fetch
  try {
    const res = await fetchWT('https://gridfeed.co/drivers/' + file + '.png', {}, 8000);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      const isReal = buf.length >= REAL_PHOTO_MIN_BYTES;
      const image = await loadImage(buf);
      return { image, isReal };
    }
  } catch {}
  return { image: null, isReal: false };
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const word of words) {
    const test = cur ? cur + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur); cur = word;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawTagBanner(ctx, tag, tagColor, W, bannerY) {
  ctx.font = '800 18px sans-serif';
  const tagW = ctx.measureText(tag).width;
  const bannerH = 44;
  const skew = 14;
  const padL = 40, padR = 40;
  const endX = padL + tagW + padR;

  // Banner parallelogram
  ctx.beginPath();
  ctx.moveTo(0, bannerY);
  ctx.lineTo(0, bannerY + bannerH);
  ctx.lineTo(endX - skew, bannerY + bannerH);
  ctx.lineTo(endX + skew, bannerY);
  ctx.closePath();
  ctx.fillStyle = tagColor;
  ctx.fill();

  // Pointed end (3D ribbon fold)
  ctx.beginPath();
  ctx.moveTo(endX + skew, bannerY);
  ctx.lineTo(endX + skew + 24, bannerY + bannerH / 2);
  ctx.lineTo(endX - skew, bannerY + bannerH);
  ctx.closePath();
  ctx.fillStyle = tagColor;
  ctx.fill();

  // Subtle dark wedge for depth
  ctx.beginPath();
  ctx.moveTo(endX + skew + 24, bannerY + bannerH / 2);
  ctx.lineTo(endX - skew, bannerY + bannerH);
  ctx.lineTo(endX + skew - 8, bannerY + bannerH);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fill();

  // Tag text
  ctx.font = '900 18px sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.fillText(tag, padL, bannerY + bannerH / 2 + 7);
}

async function uploadToSupabase(filename, buffer) {
  const url = SB_URL + '/storage/v1/object/article-images/' + filename;
  const res = await fetchWT(url, {
    method: 'POST',
    headers: {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY,
      'Content-Type': 'image/png',
      'x-upsert': 'true',
    },
    body: buffer,
  }, 30000);
  if (!res.ok) throw new Error('Storage upload failed: ' + res.status + ' ' + (await res.text()));
  return SB_URL + '/storage/v1/object/public/article-images/' + filename;
}

export default async (req) => {
  const start = Date.now();
  if (req.method !== 'POST') {
    return new Response('POST only', { status: 405 });
  }
  try {
    const body = await req.json();
    const articleId = body.article_id;
    if (!articleId) return json({ error: 'Missing article_id' }, 400);

    const rows = await sb('articles?id=eq.' + articleId + '&select=id,title,tags,body,slug');
    const article = rows[0];
    if (!article) return json({ error: 'Article not found' }, 404);

    const tag = (article.tags || ['ANALYSIS'])[0];
    const tagColor = TAG_COLORS[tag] || TAG_COLORS['ANALYSIS'];
    const drivers = extractDrivers(article.title, article.body);
    const primaryDriver = drivers[0] || null;
    const primaryTeam = primaryDriver ? DRIVER_TEAMS[primaryDriver] : null;
    const teamColor = primaryTeam ? TEAM_COLORS[primaryTeam] : '#E8002D';

    const W = 1080, H = 1080;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#1A1E2E');
    bg.addColorStop(0.4, '#12151E');
    bg.addColorStop(1, '#0A0D14');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Team color ambient glow
    if (primaryTeam) {
      const hex = teamColor.replace('#', '');
      const tr = parseInt(hex.slice(0, 2), 16);
      const tg = parseInt(hex.slice(2, 4), 16);
      const tb = parseInt(hex.slice(4, 6), 16);
      const glow = ctx.createRadialGradient(W * 0.55, H * 0.28, 0, W * 0.55, H * 0.28, W * 0.55);
      glow.addColorStop(0, `rgba(${tr},${tg},${tb},0.15)`);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
    }

    // GridFeed logo (top-left)
    const logoX = 40, logoY = 60;
    const sq = 6;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#FFFFFF' : 'rgba(255,255,255,0.2)';
        ctx.fillRect(logoX + c * sq, logoY - 16 + r * sq, sq, sq);
      }
    }
    ctx.font = '900 26px sans-serif';
    ctx.textAlign = 'left';
    const gridW = ctx.measureText('GRID').width;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('GRID', logoX + 22, logoY);
    ctx.fillStyle = '#E8002D';
    ctx.fillText('FEED', logoX + 22 + gridW, logoY);
    ctx.font = '700 10px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText('YOUR DAILY F1 FIX', logoX + 22, logoY + 18);

    // Primary driver — real photo or typography fallback
    let primaryHeadshot = null;
    if (primaryDriver) {
      primaryHeadshot = await loadHeadshot(primaryDriver);
    }

    if (primaryHeadshot && primaryHeadshot.image && primaryHeadshot.isReal) {
      // REAL PHOTO: draw rectangular with soft fade, no hard circle
      const headshot = primaryHeadshot.image;
      const imgSize = 320;
      const imgX = (W - imgSize) / 2 + 30;
      const imgY = 60;
      const cx = imgX + imgSize / 2;
      const cy = imgY + imgSize / 2;
      const scale = Math.max(imgSize / headshot.width, imgSize / headshot.height);
      const w = headshot.width * scale;
      const h = headshot.height * scale;
      const yOff = -h * 0.12;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, imgSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(headshot, cx - w / 2, cy - h / 2 + yOff, w, h);
      ctx.restore();
      // Soft bottom fade into bg
      const fade = ctx.createLinearGradient(0, imgY + imgSize * 0.6, 0, imgY + imgSize + 20);
      fade.addColorStop(0, 'rgba(18,21,30,0)');
      fade.addColorStop(1, 'rgba(18,21,30,1)');
      ctx.fillStyle = fade;
      ctx.fillRect(0, imgY + imgSize * 0.6, W, imgSize * 0.4 + 30);
    } else if (primaryDriver) {
      // TYPOGRAPHY FALLBACK: big team-colored last name centered upper area
      const lastName = primaryDriver.split(' ').pop().toUpperCase();
      ctx.save();
      // Subtle dark plate
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      // Big driver name in team color, centered
      let nameSize = 130;
      ctx.font = `900 ${nameSize}px sans-serif`;
      while (ctx.measureText(lastName).width > W - 100 && nameSize > 60) {
        nameSize -= 6;
        ctx.font = `900 ${nameSize}px sans-serif`;
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Outer stroke for contrast
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 4;
      ctx.strokeText(lastName, W / 2, 220);
      ctx.fillStyle = teamColor;
      ctx.fillText(lastName, W / 2, 220);
      // Team name underneath
      ctx.font = '700 22px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(primaryTeam || '', W / 2, 220 + nameSize / 2 + 24);
      ctx.restore();
    }

    // Optional second driver — only if we have a real photo
    if (drivers.length > 1) {
      const second = await loadHeadshot(drivers[1]);
      if (second && second.image && second.isReal) {
        const h2 = second.image;
        const sz = 140;
        const x2 = W - sz - 50;
        const y2 = 80;
        const cx = x2 + sz / 2;
        const cy = y2 + sz / 2;
        const scale = Math.max(sz / h2.width, sz / h2.height);
        const w = h2.width * scale;
        const hh = h2.height * scale;
        const yOff = -hh * 0.15;
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(cx, cy, sz / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(h2, cx - w / 2, cy - hh / 2 + yOff, w, hh);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }

    // Diagonal tag banner — moved up to ~42% so headline has more room
    const bannerY = H * 0.42;
    drawTagBanner(ctx, tag, tagColor, W, bannerY);

    // Headline — large white uppercase, auto-fit
    const headlineText = (article.title || 'GRIDFEED').toUpperCase();
    const maxWidth = W - 80;
    const startY = bannerY + 80;
    let fontSize = 68;
    let lines = [];
    while (fontSize >= 32) {
      ctx.font = `900 ${fontSize}px sans-serif`;
      lines = wrapText(ctx, headlineText, maxWidth);
      const totalH = lines.length * (fontSize * 1.08);
      if (startY + totalH < H - 40) break;
      fontSize -= 4;
    }
    ctx.font = `900 ${fontSize}px sans-serif`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    const lineH = fontSize * 1.08;
    lines.forEach((line, i) => {
      ctx.fillText(line, 40, startY + (i + 1) * lineH);
    });

    // Bottom team-color accent
    const accent = ctx.createLinearGradient(0, 0, W * 0.6, 0);
    accent.addColorStop(0, teamColor);
    accent.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = accent;
    ctx.fillRect(0, H - 5, W, 5);

    // Export and upload
    const buffer = canvas.toBuffer('image/png');
    const filename = (article.slug || article.id) + '.png';
    const imageUrl = await uploadToSupabase(filename, buffer);
    await sb('articles?id=eq.' + articleId, 'PATCH', { image_url: imageUrl });

    await logSync('generate-article-image', 'success', 1, `${filename} (${drivers.join('+') || 'no driver'})`, Date.now() - start);
    return json({
      success: true,
      image_url: imageUrl,
      drivers_detected: drivers,
      team_detected: primaryTeam,
      font_size: fontSize,
      lines: lines.length,
    });
  } catch (err) {
    await logSync('generate-article-image', 'error', 0, err.message, Date.now() - start);
    return json({ error: err.message }, 500);
  }
};

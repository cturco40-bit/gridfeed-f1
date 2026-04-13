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

// STRICT: only match drivers explicitly named in the TITLE. Never scan body.
// If no driver in title, returns null and the image uses a typography layout.
function findFocusDriver(title) {
  const t = title || '';
  let best = null;
  let bestIdx = Infinity;
  for (const name of Object.keys(DRIVER_FILE)) {
    const last = name.split(' ').pop();
    let idx = t.indexOf(last);
    if (idx < 0) idx = t.indexOf(name);
    if (idx >= 0 && idx < bestIdx) {
      best = name;
      bestIdx = idx;
    }
  }
  return best;
}

// Detect a team mentioned in the title — used when no specific driver is named
const TEAM_NAMES_IN_TITLE = [
  'Mercedes', 'Ferrari', 'McLaren', 'Red Bull', 'Aston Martin',
  'Alpine', 'Williams', 'Haas', 'Racing Bulls', 'Audi', 'Cadillac',
];
function findFocusTeam(title) {
  const t = title || '';
  let best = null;
  let bestIdx = Infinity;
  for (const team of TEAM_NAMES_IN_TITLE) {
    const idx = t.indexOf(team);
    if (idx >= 0 && idx < bestIdx) {
      best = team;
      bestIdx = idx;
    }
  }
  return best;
}

// Cache logo across invocations within the same warm container
let _logoCache = null;
async function loadLogo() {
  if (_logoCache) return _logoCache;
  const fs = await import('fs/promises');
  const candidates = [
    path.join(HERE, '..', '..', 'logo.png'),
    path.join(process.cwd(), 'logo.png'),
    path.join(HERE, 'logo.png'),
  ];
  for (const p of candidates) {
    try {
      const buf = await fs.readFile(p);
      _logoCache = await loadImage(buf);
      return _logoCache;
    } catch {}
  }
  try {
    const res = await fetchWT('https://gridfeed.co/logo.png', {}, 8000);
    if (res.ok) {
      _logoCache = await loadImage(Buffer.from(await res.arrayBuffer()));
      return _logoCache;
    }
  } catch {}
  return null;
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
    // STRICT matching: driver must be in the TITLE
    const primaryDriver = findFocusDriver(article.title);
    const titleTeam = findFocusTeam(article.title);
    // Team color comes from the title-mentioned team if present, else the
    // primary driver's team, else the GridFeed accent
    const primaryTeam = titleTeam || (primaryDriver ? DRIVER_TEAMS[primaryDriver] : null);
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

    // Primary driver photo OR typography fallback when title has no driver
    // STRICT RULE: image only shows the driver named in the title, never anyone else
    let primaryHeadshot = null;
    if (primaryDriver) primaryHeadshot = await loadHeadshot(primaryDriver);

    if (primaryHeadshot && primaryHeadshot.image && primaryHeadshot.isReal) {
      // REAL PHOTO LAYOUT — fill the full 1080×1080 canvas with the photo,
      // top-anchored cover-fit. F1 photos are 720×2069 (tall full-body) so we
      // slice from the top of the source down to the height that matches the
      // square aspect, keeping the head and shoulders centered.
      const img = primaryHeadshot.image;
      // Source slice: take a square region from the top of the photo so the
      // head + chest fill the frame
      const srcSize = img.width; // square region matching the photo width
      const srcX = 0;
      const srcY = 0; // anchor to the very top
      ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, W, H);
      // Subtle bottom vignette for visual depth (no banner / headline baked in)
      const vg = ctx.createLinearGradient(0, H * 0.7, 0, H);
      vg.addColorStop(0, 'rgba(10,13,20,0)');
      vg.addColorStop(1, 'rgba(10,13,20,0.55)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, H * 0.7, W, H * 0.3);
    } else {
      // TEAM/GENERIC FALLBACK — no driver in title (or no real photo)
      // Show GridFeed car logo + team-themed background
      const logo = await loadLogo();
      // Stronger team-color radial glow as backdrop
      if (primaryTeam) {
        const hex = teamColor.replace('#', '');
        const tr2 = parseInt(hex.slice(0, 2), 16);
        const tg2 = parseInt(hex.slice(2, 4), 16);
        const tb2 = parseInt(hex.slice(4, 6), 16);
        const bigGlow = ctx.createRadialGradient(W / 2, 280, 0, W / 2, 280, W * 0.65);
        bigGlow.addColorStop(0, `rgba(${tr2},${tg2},${tb2},0.32)`);
        bigGlow.addColorStop(0.5, `rgba(${tr2},${tg2},${tb2},0.12)`);
        bigGlow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bigGlow;
        ctx.fillRect(0, 0, W, H);
      }
      // Draw the logo big and centered in the upper area
      if (logo) {
        const targetW = W * 0.7;
        const scale = targetW / logo.width;
        const drawW = logo.width * scale;
        const drawH = logo.height * scale;
        const drawX = (W - drawW) / 2;
        const drawY = 140;
        // Apply a slight team-color tint via globalCompositeOperation
        if (primaryTeam) {
          // Draw logo in team color: first solid team-color rect clipped to logo alpha
          const off = createCanvas(drawW, drawH);
          const offCtx = off.getContext('2d');
          offCtx.drawImage(logo, 0, 0, drawW, drawH);
          offCtx.globalCompositeOperation = 'source-in';
          offCtx.fillStyle = teamColor;
          offCtx.fillRect(0, 0, drawW, drawH);
          // Layer 1: full team-color version at 60% opacity
          ctx.save();
          ctx.globalAlpha = 0.6;
          ctx.drawImage(off, drawX, drawY);
          ctx.restore();
          // Layer 2: original logo at 80% opacity for white text legibility
          ctx.save();
          ctx.globalAlpha = 0.85;
          ctx.drawImage(logo, drawX, drawY, drawW, drawH);
          ctx.restore();
        } else {
          ctx.drawImage(logo, drawX, drawY, drawW, drawH);
        }
      }
      // Team name (or "FORMULA 1" if no team) in big letters under the logo
      const subLabel = (primaryTeam || 'FORMULA 1').toUpperCase();
      ctx.save();
      let subSize = 64;
      ctx.font = `900 ${subSize}px sans-serif`;
      while (ctx.measureText(subLabel).width > W - 100 && subSize > 32) {
        subSize -= 4;
        ctx.font = `900 ${subSize}px sans-serif`;
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 3;
      ctx.strokeText(subLabel, W / 2, 380);
      ctx.fillStyle = teamColor;
      ctx.fillText(subLabel, W / 2, 380);
      ctx.restore();
    }
    // Note: tag banner + headline are rendered as HTML around the card, not on the image

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

    await logSync('generate-article-image', 'success', 1, `${filename} (${primaryDriver || primaryTeam || 'generic'})`, Date.now() - start);
    return json({
      success: true,
      image_url: imageUrl,
      primary_driver: primaryDriver,
      team: primaryTeam,
    });
  } catch (err) {
    await logSync('generate-article-image', 'error', 0, err.message, Date.now() - start);
    return json({ error: err.message }, 500);
  }
};

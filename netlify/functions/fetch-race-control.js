import { fetchWT, sb, logSync, json, getLatestSession } from './lib/shared.js';

const LIVE_TWEET_EVENTS = {
  SafetyCar: { emoji: '🟡', prefix: 'SAFETY CAR' },
  Flag: { emoji: '🔴', prefix: 'RED FLAG' },
  OvertakeMode: { emoji: '⚡', prefix: 'OVERTAKE MODE' },
};

function shouldLiveTweet(m) {
  if (m.category === 'SafetyCar') return LIVE_TWEET_EVENTS.SafetyCar;
  if (m.flag === 'RED') return LIVE_TWEET_EVENTS.Flag;
  const msg = (m.message || '').toUpperCase();
  if (msg.includes('PENALTY') || msg.includes('BLACK AND WHITE') || msg.includes('DISQUALIF')) return { emoji: '⚠️', prefix: 'PENALTY' };
  if (msg.includes('RETIRE') || msg.includes('STOPPED ON TRACK')) return { emoji: '🏁', prefix: 'RETIREMENT' };
  return null;
}

function buildLiveTweet(event, m, session) {
  const meetingName = session.meeting_name || session.circuit_short_name || '';
  const lap = m.lap_number ? `Lap ${m.lap_number}` : '';
  const parts = [`${event.emoji} ${event.prefix}`, m.message || '', lap, meetingName, '', 'gridfeed.co'].filter(Boolean);
  const tweet = parts.join('\n');
  return tweet.length <= 280 ? tweet : tweet.slice(0, 276) + '...';
}

export default async (req, context) => {
  const start = Date.now();
  try {
    const session = await getLatestSession();
    if (!session?.isLive) {
      await logSync('fetch-race-control', 'success', 0, 'No live session', Date.now() - start);
      return json({ ok: true, records: 0 });
    }

    const res = await fetchWT(`https://api.openf1.org/v1/race_control?session_key=${session.session_key}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const messages = await res.json();
    if (!messages?.length) {
      await logSync('fetch-race-control', 'success', 0, 'No race control messages', Date.now() - start);
      return json({ ok: true, records: 0 });
    }

    let inserted = 0;
    for (const m of messages) {
      const existing = await sb(`race_control?session_key=eq.${session.session_key}&date=eq.${encodeURIComponent(m.date)}&limit=1`);
      if (existing.length) continue;
      // Map DRS terminology to 2026 Overtake Mode
      let msg = m.message || '';
      if (msg.includes('DRS')) msg = msg.replace(/DRS Enabled/gi, 'Overtake Mode Active').replace(/DRS Disabled/gi, 'Overtake Mode Inactive').replace(/DRS/gi, 'Overtake Mode');
      let cat = m.category || '';
      if (cat === 'Drs') cat = 'OvertakeMode';
      await sb('race_control', 'POST', {
        session_key: String(session.session_key), date: m.date, lap_number: m.lap_number,
        category: cat, message: msg, flag: m.flag, scope: m.scope, fetched_at: new Date().toISOString(),
      });
      inserted++;

      // Live tweet + push for big events (safety car, red flag, penalties, retirements)
      const liveEvent = shouldLiveTweet(m);
      if (liveEvent) {
        const tweetText = buildLiveTweet(liveEvent, m, session);
        // Live race events tweet immediately — no approval needed
        await sb('tweets', 'POST', { tweet_text: tweetText, status: 'approved' });
        const siteUrl = process.env.URL || 'https://gridfeed.co';
        fetchWT(siteUrl + '/.netlify/functions/post-tweet', { method: 'POST' }, 15000).catch(() => {});
        fetchWT(siteUrl + '/.netlify/functions/send-push', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: `${liveEvent.emoji} ${liveEvent.prefix}`, body: msg, url: '/?tab=live', tag: 'race-control-' + Date.now(), audience: 'public' }),
        }, 5000).catch(() => {});
      }
    }

    await logSync('fetch-race-control', 'success', inserted, `${inserted} new messages`, Date.now() - start);
    return json({ ok: true, records: inserted });
  } catch (err) {
    await logSync('fetch-race-control', 'error', 0, err.message, Date.now() - start, err.stack);
    return json({ error: err.message }, 500);
  }
};

export const config = { schedule: '*/2 * * * *' };

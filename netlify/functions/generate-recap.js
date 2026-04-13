import { sb, fetchWT, logSync, json } from './lib/shared.js';

// Session type → tag + auto-publish flag
const SESSION_CONFIG = {
  'Race':             { tag: 'RACE',       autoPublish: true },
  'Sprint':           { tag: 'RACE',       autoPublish: true },
  'Qualifying':       { tag: 'QUALIFYING', autoPublish: true },
  'Sprint Qualifying':{ tag: 'QUALIFYING', autoPublish: true },
  'Practice 3':       { tag: 'ANALYSIS',   autoPublish: false },
  'Practice 2':       { tag: 'ANALYSIS',   autoPublish: false },
  'Practice 1':       { tag: 'ANALYSIS',   autoPublish: false },
};

function nextSessionHint(type) {
  return {
    'Practice 1':        'FP2 later today',
    'Practice 2':        'FP3 tomorrow',
    'Practice 3':        'Qualifying later today',
    'Sprint Qualifying': 'the Sprint tomorrow',
    'Sprint':            'Qualifying later today',
    'Qualifying':        'the race tomorrow',
    'Race':              'the next round',
  }[type] || 'the next session';
}

async function getCompletedSession() {
  try {
    const windowStart = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const windowEnd = new Date().toISOString();
    const res = await fetchWT(
      `https://api.openf1.org/v1/sessions?date_end>=${windowStart}&date_end<=${windowEnd}`,
      {}, 10000
    );
    if (!res.ok) return null;
    const sessions = await res.json();
    if (!sessions?.length) return null;
    return sessions.sort((a, b) => new Date(b.date_end) - new Date(a.date_end))[0];
  } catch { return null; }
}

async function getResults(sessionKey, sessionType) {
  try {
    const [posRes, drvRes] = await Promise.all([
      fetchWT(`https://api.openf1.org/v1/position?session_key=${sessionKey}`, {}, 10000),
      fetchWT(`https://api.openf1.org/v1/drivers?session_key=${sessionKey}`, {}, 10000),
    ]);
    if (!posRes.ok || !drvRes.ok) return null;
    const positions = await posRes.json();
    const drivers = await drvRes.json();
    if (!positions?.length) return null;

    const driverMap = {};
    (drivers || []).forEach(d => {
      driverMap[d.driver_number] = {
        name: d.full_name || `${d.first_name || ''} ${d.last_name || ''}`.trim() || ('#' + d.driver_number),
        team: d.team_name || 'Unknown',
        abbr: d.name_acronym || '???',
      };
    });

    // Latest position row per driver
    const latest = {};
    positions.forEach(p => {
      const cur = latest[p.driver_number];
      if (!cur || new Date(p.date) > new Date(cur.date)) latest[p.driver_number] = p;
    });

    const classification = Object.values(latest)
      .filter(p => p.position)
      .sort((a, b) => a.position - b.position)
      .map(p => ({
        position: p.position,
        driver: driverMap[p.driver_number]?.name || ('#' + p.driver_number),
        team: driverMap[p.driver_number]?.team || 'Unknown',
        abbr: driverMap[p.driver_number]?.abbr || '???',
        number: p.driver_number,
      }));

    // Fastest lap for race/sprint
    let fastestLap = null;
    if (sessionType === 'Race' || sessionType === 'Sprint') {
      try {
        const lapRes = await fetchWT(
          `https://api.openf1.org/v1/laps?session_key=${sessionKey}&is_pit_out_lap=false`,
          {}, 10000
        );
        const laps = await lapRes.json();
        const fastest = (laps || []).reduce(
          (a, b) => ((a?.lap_duration || 9999) < (b?.lap_duration || 9999) ? a : b),
          null
        );
        if (fastest?.driver_number && fastest.lap_duration) {
          fastestLap = {
            driver: driverMap[fastest.driver_number]?.name || ('#' + fastest.driver_number),
            time: Number(fastest.lap_duration).toFixed(3),
          };
        }
      } catch {}
    }

    // Race-control incidents
    let incidents = [];
    try {
      const rcRes = await fetchWT(
        `https://api.openf1.org/v1/race_control?session_key=${sessionKey}`,
        {}, 10000
      );
      const rc = await rcRes.json();
      incidents = (rc || [])
        .filter(m => {
          const msg = (m.message || '').toLowerCase();
          return m.flag === 'YELLOW' || m.flag === 'RED'
            || m.category === 'SafetyCar' || m.category === 'Flag'
            || msg.includes('incident') || msg.includes('penalty') || msg.includes('retire');
        })
        .slice(0, 5)
        .map(m => m.message);
    } catch {}

    return { classification, fastestLap, incidents };
  } catch { return null; }
}

function buildRecap(session, results) {
  const { classification, fastestLap, incidents } = results;
  const winner = classification[0];
  const podium = classification.slice(0, 3);
  const pointScorers = classification.slice(0, 10);
  const sessionType = session.session_name;
  const raceName = session.meeting_name || 'Grand Prix';
  const circuit = session.circuit_short_name || '';
  const last = (n) => (n || '').split(' ').pop();

  // Headline hook
  let headline;
  const p2 = classification[1];
  if (winner?.team && winner.team === p2?.team) {
    headline = `${winner.team} Lock Out the Front`;
  } else if (last(winner?.driver) === 'Verstappen') {
    headline = 'Red Bull Finally Break Through';
  } else {
    headline = `${podium.map(p => last(p.driver)).join(', ')} Complete the Podium`;
  }

  const isRace = sessionType === 'Race' || sessionType === 'Sprint';
  const isQuali = sessionType === 'Qualifying' || sessionType === 'Sprint Qualifying';

  let title;
  if (isRace) {
    title = `${last(winner.driver)} Wins the ${raceName}${sessionType === 'Sprint' ? ' Sprint' : ''}. ${headline}`;
  } else if (isQuali) {
    title = `${last(winner.driver)} on Pole for the ${raceName}${sessionType.includes('Sprint') ? ' Sprint' : ''}. ${headline}`;
  } else {
    title = `${last(winner.driver)} Tops the Timesheets in ${sessionType} at ${raceName}`;
  }

  // Body — ONLY real data, no inventions
  let body;
  if (isRace) {
    body = `${winner.driver} wins the ${raceName}${sessionType === 'Sprint' ? ' Sprint' : ''} at ${circuit}.

${podium.map((p, i) => `${['First','Second','Third'][i]}: ${p.driver} (${p.team})`).join('. ')}.

${sessionType === 'Sprint' ? 'Sprint classification' : 'Full race classification'}: ${pointScorers.map(p => `P${p.position} ${p.abbr}`).join(', ')}.${classification.length > 10 ? ' ' + (classification.length - 10) + ' more classified.' : ''}

${fastestLap ? `Fastest lap: ${fastestLap.driver} (${fastestLap.time}s).` : ''}

${incidents.length ? 'Key incidents: ' + incidents.join('. ') + '.' : ''}

Championship impact: results will be reflected in updated standings. Next up is ${nextSessionHint(sessionType)}.`;
  } else if (isQuali) {
    const q3 = classification.slice(0, 10);
    const q2 = classification.slice(10, 15);
    const q1 = classification.slice(15);
    body = `${winner.driver} takes pole position for the ${raceName}${sessionType.includes('Sprint') ? ' Sprint' : ''} at ${circuit}.

${winner.driver} starts from P1 ahead of ${classification[1]?.driver || 'unknown'} and ${classification[2]?.driver || 'unknown'}.

Q3 top 10: ${q3.map(p => `P${p.position} ${p.abbr} (${p.team})`).join(', ')}.

${q2.length ? 'Eliminated in Q2: ' + q2.map(p => p.abbr).join(', ') + '.' : ''}

${q1.length ? 'Eliminated in Q1: ' + q1.map(p => p.abbr).join(', ') + '.' : ''}

${incidents.length ? 'Session notes: ' + incidents.join('. ') + '.' : ''}

${sessionType.includes('Sprint') ? 'The Sprint race' : 'The race'} follows ${nextSessionHint(sessionType)}.`;
  } else {
    body = `${winner.driver} tops the timesheets in ${sessionType} at the ${raceName}.

Top 10: ${pointScorers.map(p => `P${p.position} ${p.abbr} (${p.team})`).join(', ')}.

${incidents.length ? 'Session notes: ' + incidents.join('. ') + '.' : ''}

Next up: ${nextSessionHint(sessionType)}.`;
  }

  body = body.split('\n').filter(l => l.trim() !== '').join('\n\n');

  const excerpt = isRace
    ? `${winner.driver} wins ahead of ${last(classification[1]?.driver)} and ${last(classification[2]?.driver)}.`
    : isQuali
      ? `${winner.driver} claims pole with ${last(classification[1]?.driver)} alongside on the front row.`
      : `${winner.driver} leads the ${sessionType} timesheets at ${circuit}.`;

  // Tweet
  const podiumAbbrs = podium.map(p => p.abbr).join(' | ');
  const raceTag = '#' + raceName.replace(/\s+/g, '');
  let tweet;
  if (isRace) {
    tweet = `${last(winner.driver)} wins the ${raceName}${sessionType === 'Sprint' ? ' Sprint' : ''}!\n\n🏆 ${podiumAbbrs}\n\n#F1 ${raceTag}`;
  } else if (isQuali) {
    tweet = `POLE: ${last(winner.driver)} for the ${raceName}${sessionType.includes('Sprint') ? ' Sprint' : ''}!\n\nFront row: ${classification[0]?.abbr} | ${classification[1]?.abbr}\n\n#F1 ${raceTag}`;
  } else {
    tweet = `${sessionType} complete at ${circuit}.\n\nP1 ${winner.abbr} | P2 ${classification[1]?.abbr} | P3 ${classification[2]?.abbr}\n\n#F1`;
  }

  return { title, body, excerpt, tweet };
}

function makeSlug(title) {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 80)
    + '-' + Date.now().toString(36);
}

// Dedup check: have we already logged a successful recap for this session key?
async function alreadyRecapped(sessionKey) {
  const since = new Date(Date.now() - 48 * 36e5).toISOString();
  const rows = await sb(`sync_log?function_name=eq.generate-recap&status=eq.success&created_at=gt.${since}&message=ilike.*session:${sessionKey}*&limit=1`);
  return (rows || []).length > 0;
}

export default async (req) => {
  const start = Date.now();
  try {
    const session = await getCompletedSession();
    if (!session) {
      return json({ ok: true, message: 'No recent session ended' });
    }

    const sessionKey = session.session_key;
    const sessionType = session.session_name;
    const config = SESSION_CONFIG[sessionType];
    if (!config) {
      return json({ ok: true, message: 'Unknown session type: ' + sessionType });
    }

    if (await alreadyRecapped(sessionKey)) {
      return json({ ok: true, message: 'Already recapped session ' + sessionKey });
    }

    const results = await getResults(sessionKey, sessionType);
    if (!results?.classification?.length) {
      await logSync('generate-recap', 'error', 0, `No results for session:${sessionKey} (${sessionType})`, Date.now() - start);
      return json({ error: 'No results available' }, 404);
    }

    const recap = buildRecap(session, results);
    const slug = makeSlug(recap.title);
    const siteUrl = process.env.URL || 'https://gridfeed.co';

    if (config.autoPublish) {
      // Insert the published article directly
      const inserted = await sb('articles', 'POST', {
        title: recap.title,
        slug,
        body: recap.body,
        excerpt: recap.excerpt,
        tags: [config.tag],
        author: 'GridFeed',
        status: 'published',
        published_at: new Date().toISOString(),
      });
      const articleId = Array.isArray(inserted) ? inserted[0]?.id : inserted?.id;
      if (!articleId) {
        await logSync('generate-recap', 'error', 0, `Publish failed session:${sessionKey} (${sessionType})`, Date.now() - start);
        return json({ error: 'Publish failed' }, 500);
      }

      // Generate the article image — awaited so we don't lose it to Netlify
      // killing outbound requests once this function returns
      try {
        await fetchWT(siteUrl + '/.netlify/functions/generate-article-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ article_id: articleId }),
        }, 25000);
      } catch {}

      // Queue the tweet as approved so post-tweet cron picks it up
      await sb('tweets', 'POST', {
        article_id: articleId,
        tweet_text: recap.tweet,
        tweet_type: 'recap',
        status: 'approved',
      }).catch(() => {});

      // Push notification to public subscribers (fire and forget)
      fetchWT(siteUrl + '/.netlify/functions/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '🏁 ' + sessionType + ' results',
          body: recap.title,
          url: '/article/' + slug,
          tag: 'recap-' + articleId,
          audience: 'public',
        }),
      }, 8000).catch(() => {});

      await logSync('generate-recap', 'success', 1, `Auto-published session:${sessionKey} (${sessionType}): ${recap.title}`, Date.now() - start);
      return json({ ok: true, published: true, title: recap.title, slug });
    }

    // Non-auto-publish sessions (practice) → draft for review
    await sb('content_drafts', 'POST', {
      title: recap.title,
      body: recap.body,
      excerpt: recap.excerpt,
      tags: [config.tag],
      content_type: 'analysis',
      review_status: 'pending',
      source_context: { recap_session_key: sessionKey, session_type: sessionType },
      priority_score: 7,
      generation_model: 'GridFeed Recap',
    });

    await logSync('generate-recap', 'success', 1, `Draft created session:${sessionKey} (${sessionType}): ${recap.title}`, Date.now() - start);
    return json({ ok: true, published: false, title: recap.title });
  } catch (err) {
    await logSync('generate-recap', 'error', 0, err.message, Date.now() - start);
    return json({ error: err.message }, 500);
  }
};

export const config = { schedule: '*/5 * * * *' };

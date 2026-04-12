import { fetchWT, sb, logSync, json, hashContent } from './lib/shared.js';
import { buildSystemPrompt, validateArticle, buildLiveContext, fixEncoding, TODAY } from './lib/accuracy.js';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const WORD_TARGETS = {
  breaking: '150-200', race_recap: '450-500', qualifying_recap: '350-400', practice_analysis: '300-350',
  preview: '400-450', strategy_analysis: '350-400', championship_update: '250-300', morning_briefing: '300-350', analysis: '400-500',
};

function parseAIResponse(data) {
  const content = data.content || [];
  const textBlocks = content.filter(b => b.type === 'text');
  const lastText = textBlocks[textBlocks.length - 1];
  if (!lastText) throw new Error('No text response from AI');
  const text = lastText.text.trim();
  const clean = text.replace(/```json\s?|```/g, '').trim();
  const jsonMatch = clean.match(/\{[\s\S]*"title"[\s\S]*"body"[\s\S]*\}/);
  if (jsonMatch) return JSON.parse(jsonMatch[0]);
  const anyJson = clean.match(/\{[\s\S]*\}/);
  if (anyJson) return JSON.parse(anyJson[0]);
  throw new Error('No valid JSON in response');
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < Math.min(str.length, 200); i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return 'h' + Math.abs(hash).toString(36);
}

function makeSlug(title) {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 80) + '-' + Date.now().toString(36);
}

export default async (req, context) => {
  const start = Date.now();
  try {
    if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY not set');

    // Rate limit: max 3 drafts per hour
    const recentDrafts = await sb(`content_drafts?select=id&created_at=gt.${new Date(Date.now() - 36e5).toISOString()}`);
    if (recentDrafts.length >= 8) {
      await logSync('generate-content', 'success', 0, `Rate limit: ${recentDrafts.length} drafts in last hour`, Date.now() - start);
      return json({ ok: true, generated: 0, reason: 'rate_limit' });
    }

    // Get pending topics (fetch a few for diversity filtering)
    // Priority DESC first, then fresh topics before retries, then oldest first
    const allPending = await sb('content_topics?status=eq.pending&order=priority.desc,retry_count.asc,created_at.asc&limit=5');
    if (!allPending.length) {
      await logSync('generate-content', 'success', 0, 'No pending topics', Date.now() - start);
      return json({ ok: true, generated: 0 });
    }

    // ── Subject dedup: check drafts AND published articles ──
    const DRIVER_NAMES = ['Antonelli','Russell','Leclerc','Hamilton','Norris','Piastri','Verstappen','Hadjar','Alonso','Stroll','Gasly','Colapinto','Sainz','Albon','Ocon','Bearman','Lawson','Lindblad','Hulkenberg','Bortoleto','Perez','Bottas'];
    const SUBJECT_KEYWORDS = ['contract','transfer','penalty','crash','engine','retirement','regulation','budget cap','wind tunnel','sprint','qualifying','practice','safety car','red flag','overtake mode','active aero','miami','monaco','silverstone','monza','spa'];
    function extractDrivers(text) { return DRIVER_NAMES.filter(d => text.toLowerCase().includes(d.toLowerCase())); }
    function extractSubjects(text) { const t = text.toLowerCase(); return SUBJECT_KEYWORDS.filter(k => t.includes(k)); }
    function topicOverlaps(titleA, titleB) {
      const drA = extractDrivers(titleA), drB = extractDrivers(titleB);
      const subA = extractSubjects(titleA), subB = extractSubjects(titleB);
      const sharedDrivers = drA.filter(d => drB.includes(d));
      const sharedSubjects = subA.filter(s => subB.includes(s));
      // Same driver AND same subject = duplicate topic
      if (sharedDrivers.length > 0 && sharedSubjects.length > 0) return true;
      // No drivers but same subject keywords (2+) = duplicate
      if (drA.length === 0 && drB.length === 0 && sharedSubjects.length >= 2) return true;
      return false;
    }

    const recentDrafts24h = await sb(`content_drafts?select=title&order=created_at.desc&limit=20&created_at=gt.${new Date(Date.now() - 24 * 36e5).toISOString()}`);
    const recentArticles24h = await sb(`articles?select=title&order=published_at.desc&limit=20&published_at=gt.${new Date(Date.now() - 24 * 36e5).toISOString()}`);
    const allRecentTitles = [...recentDrafts24h, ...recentArticles24h].map(r => r.title || '');

    // Pick a topic that doesn't duplicate existing content
    let topic = null;
    let isUpdate = false;
    let priorTitle = null;
    for (const candidate of allPending) {
      const cText = candidate.topic || '';
      const match = allRecentTitles.find(t => topicOverlaps(cText, t));
      if (!match) {
        topic = candidate;
        break;
      }
      // If this is high priority (breaking), allow as UPDATE
      if (!topic && (candidate.priority || 0) >= 8) {
        topic = candidate;
        isUpdate = true;
        priorTitle = match;
      }
    }
    if (!topic) {
      // All topics overlap — skip lowest priority ones, take highest as update
      topic = allPending[0];
      const match = allRecentTitles.find(t => topicOverlaps(topic.topic || '', t));
      if (match) { isUpdate = true; priorTitle = match; }
    }

    const contentType = topic.content_type || 'analysis';
    const topicText = topic.topic || 'F1 2026 Season Analysis';
    const wordTarget = WORD_TARGETS[contentType] || '400-500';

    // Mark topic as processing immediately to prevent re-pick
    if (topic.id) await sb(`content_topics?id=eq.${topic.id}`, 'PATCH', { status: 'processing' });

    try {
      // ── Fetch source article content ──
      let sourceContent = '';
      let sourcePublication = '';

      if (topic.source_url) {
        try {
          const srcRes = await fetchWT(topic.source_url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GridFeedBot/1.0; +https://gridfeed.co)' },
          }, 10000);
          if (srcRes.ok) {
            const html = await srcRes.text();
            sourceContent = html
              .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
              .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
              .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
              .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 6000);

            const url = new URL(topic.source_url);
            const host = url.hostname.replace('www.', '');
            const PUB_MAP = {
              'autosport.com': 'Autosport', 'motorsport.com': 'Motorsport.com',
              'the-race.com': 'The Race', 'racefans.net': 'RaceFans',
              'planetf1.com': 'PlanetF1', 'skysports.com': 'Sky Sports F1',
              'bbc.co.uk': 'BBC Sport', 'bbc.com': 'BBC Sport',
              'formula1.com': 'Formula1.com', 'espn.com': 'ESPN',
              'gpblog.com': 'GPblog', 'wtf1.com': 'WTF1',
              'crash.net': 'Crash.net', 'gpfans.com': 'GPFans',
              'gptoday.net': 'GPToday', 'f1chronicle.com': 'F1 Chronicle',
            };
            sourcePublication = PUB_MAP[host] || host;
            console.log('[generate-content] Source fetched from', sourcePublication, '—', sourceContent.length, 'chars');
          }
        } catch (e) {
          console.warn('[generate-content] Source fetch failed:', e.message);
        }
      }

      // No source: still write but keep it short and fact-based to avoid hallucination
      const noSource = !sourceContent && ['breaking', 'analysis'].includes(contentType);

      // Build context
      const picks = await sb('betting_picks?status=eq.active&order=created_at.desc&limit=10');
      const picksContext = picks.length ? 'CURRENT PICKS:\n' + picks.map(p => `${p.pick_type}: ${p.driver_name} ${p.odds} — ${p.analysis || ''}`).join('\n') : '';
      const liveContext = await buildLiveContext();
      const board = await sb('leaderboard?order=fetched_at.desc,position.asc&limit=10');
      const boardText = board.length ? 'LATEST SESSION:\n' + board.map(r => `P${r.position}: ${r.driver_name} (${r.team_name})`).join('\n') : '';
      const fullContext = [picksContext, liveContext, boardText].filter(Boolean).join('\n\n');

      const extraGuards = `CRITICAL ACCURACY GUARDS — AI WILL BE VALIDATED AGAINST THESE:
Antonelli is 19 years old (born August 25, 2006). NEVER call him 20, 21, or any other age.
NEVER write "Antinelli" — the correct spelling is "Antonelli" (with two l's).
The 2025 World Champion is Lando Norris. He is the ONLY driver who can be called "defending champion".
Verstappen is a 4x champion (2021-2024) but is NOT defending in 2026.
Hamilton drives for FERRARI. Russell drives for MERCEDES. They are NOT teammates.
Miami is a semi-permanent circuit at Hard Rock Stadium, NOT a street circuit.
The only true street circuits in 2026 are Monaco, Singapore, and Baku.
Avoid vague references like "defending champion's former teammate" — use actual names.
Your lead sentence MUST contain a driver surname AND a number. No exceptions.
BANNED WORDS — using any of these will cause automatic rejection: fascinating, incredible, stunning, masterclass, wheelhouse, showcase, monumental, seismic, sensational, breathtaking, unraveling.`;

      let systemPrompt = buildSystemPrompt(
        extraGuards,
        `OUTPUT: Return ONLY valid JSON with no markdown fences:\n{"title":"...","excerpt":"first 150 chars","body":"full article","tags":["RACE"],"content_type":"${contentType}"}`
      );

      // Feed previous validation error back to Claude on retry
      if (topic.last_error && (topic.retry_count || 0) > 0) {
        systemPrompt += '\n\nRETRY ATTEMPT ' + topic.retry_count + ' OF 3.';
        systemPrompt += '\nYour previous draft was REJECTED for this reason: ' + topic.last_error;
        systemPrompt += '\nFix this exact issue and produce a valid draft. Do NOT repeat the same mistake.';
      }

      // If this is an UPDATE to a prior article, instruct Claude
      if (isUpdate && priorTitle) {
        systemPrompt += '\n\nUPDATE ARTICLE: We already published "' + priorTitle + '" on this subject.';
        systemPrompt += '\nYour title MUST start with "UPDATE:" — e.g. "UPDATE: New Development in..."';
        systemPrompt += '\nOpen with a one-sentence summary of the original story, then explain what is new.';
        systemPrompt += '\nDo NOT repeat the same analysis. Focus on what changed since the prior article.';
      }

      // Build user prompt — source-grounded when available, conservative fallback otherwise
      let userPrompt;
      if (sourceContent) {
        userPrompt = `Source article from ${sourcePublication}:\n"""\n${sourceContent}\n"""\n\nRewrite this story in GridFeed voice for our readers.\n\nCRITICAL RULES:\n- Only use facts that appear in the source above\n- Only quote text that appears verbatim in the source above\n- Every direct quote MUST be attributed: "Speaking to ${sourcePublication}, [driver] said..."\n- Do not invent quotes, briefings, or statements\n- Do not add analysis that is not grounded in the source facts\n- If the source mentions specific numbers, use those exact numbers\n- Lead sentence must contain a specific driver name AND a specific number\n- Match the GridFeed voice (sharp, authoritative, data-backed)\n- Word count: ${wordTarget}\n\n${fullContext}\n\nReturn ONLY valid JSON:\n{"title":"...","excerpt":"...","body":"...","tags":["ANALYSIS"],"content_type":"${contentType}"}`;
      } else {
        userPrompt = `Topic: ${topicText}\n\nWrite an F1 ${noSource ? 'hot take' : 'news update'} on this topic in GridFeed voice.\n\nCRITICAL RULES:\n- Do NOT include any direct quotes — no source available\n- Do NOT invent statements or briefings\n- Stick to verifiable facts about the 2026 season from the context below\n- You CAN speculate and give opinions — frame as analysis ("This suggests...", "The numbers point to...")\n- Lead sentence must contain a specific driver name AND a specific number\n- ${noSource ? 'Maximum 200 words' : 'Word count: ' + wordTarget}\n\n${fullContext}\n\nReturn ONLY valid JSON:\n{"title":"...","excerpt":"...","body":"...","tags":["ANALYSIS"],"content_type":"${contentType}"}`;
      }

      const response = await fetchWT('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2048, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] }),
      }, 45000);

      const rJson = await response.json();
      let parsed;
      try { parsed = parseAIResponse(rJson); } catch {
        const anyText = (rJson.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
        parsed = { title: topicText, body: anyText || '', excerpt: (anyText || '').slice(0, 150), tags: ['ANALYSIS'], content_type: contentType };
      }

      parsed.title = fixEncoding(parsed.title);
      parsed.body = fixEncoding(parsed.body);
      parsed.excerpt = fixEncoding(parsed.excerpt);

      // Validation — retry up to 3 times with error feedback
      console.log('[generate-content] Calling validateArticle for:', (parsed.title || '').slice(0, 60));
      const validation = validateArticle(parsed);
      console.log('[generate-content] validateArticle returned:', JSON.stringify(validation));
      if (!validation.valid) {
        const newRetryCount = (topic.retry_count || 0) + 1;
        if (topic.id) {
          if (newRetryCount >= 3) {
            await sb(`content_topics?id=eq.${topic.id}`, 'PATCH', { status: 'failed', retry_count: newRetryCount, last_error: validation.reason });
            await logSync('generate-content', 'validation_failed', 0, `Topic failed after 3 retries: ${validation.reason}`, Date.now() - start);
          } else {
            await sb(`content_topics?id=eq.${topic.id}`, 'PATCH', { status: 'pending', retry_count: newRetryCount, last_error: validation.reason });
            await logSync('generate-content', 'validation_retry', 0, `Validation failed (attempt ${newRetryCount}/3): ${topicText.slice(0,40)}: ${validation.reason}`, Date.now() - start);
          }
        }
        return json({ ok: true, generated: 0, reason: validation.reason, retry: newRetryCount });
      }

      // Title dedup
      const titleCheck = await sb(`content_drafts?title=eq.${encodeURIComponent(parsed.title)}&limit=1`);
      if (titleCheck.length) {
        if (topic.id) await sb(`content_topics?id=eq.${topic.id}`, 'PATCH', { status: 'drafted' });
        await logSync('generate-content', 'success', 0, 'Duplicate title skipped: ' + parsed.title.slice(0, 50), Date.now() - start);
        return json({ ok: true, generated: 0, reason: 'duplicate_title' });
      }

      // Content hash dedup
      const h = simpleHash(parsed.body || '');
      const hashCheck = await sb(`content_hashes?hash=eq.${h}&limit=1`);
      if (hashCheck.length) {
        if (topic.id) await sb(`content_topics?id=eq.${topic.id}`, 'PATCH', { status: 'drafted' });
        await logSync('generate-content', 'success', 0, 'Duplicate content hash', Date.now() - start);
        return json({ ok: true, generated: 0, reason: 'duplicate_hash' });
      }

      // Insert draft
      console.log('[generate-content] About to insert draft, validation result was:', validation.valid, '— title:', parsed.title.slice(0, 60));
      await sb('content_drafts', 'POST', {
        title: parsed.title, body: parsed.body, excerpt: parsed.excerpt,
        tags: parsed.tags || ['ANALYSIS'], content_type: parsed.content_type || contentType,
        review_status: 'pending', source_context: { topic: topicText },
        priority_score: topic.priority || 5, generation_model: 'GridFeed Pipeline',
        race_id: topic.race_id || null,
      });

      // Record hash + mark topic drafted
      await sb('content_hashes', 'POST', { hash: h, type: contentType, source: 'generate-content' });
      if (topic.id) await sb(`content_topics?id=eq.${topic.id}`, 'PATCH', { status: 'drafted' });

      // Notify
      fetchWT('/.netlify/functions/notify-draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: parsed.title, content_type: contentType, priority_score: topic.priority || 5, excerpt: (parsed.excerpt || '').slice(0, 200) }) }, 5000).catch(() => {});

      await logSync('generate-content', 'success', 1, `Draft: "${parsed.title}"`, Date.now() - start);
      return json({ ok: true, generated: 1, title: parsed.title });

    } catch (e) {
      // On error, mark topic back to pending so it can be retried
      if (topic.id) await sb(`content_topics?id=eq.${topic.id}`, 'PATCH', { status: 'pending' });
      await logSync('generate-content', 'topic_error', 0, `${topicText.slice(0,50)}: ${e.message}`, Date.now() - start);
      return json({ error: e.message }, 500);
    }
  } catch (err) {
    await logSync('generate-content', 'error', 0, err.message, Date.now() - start, err.stack);
    return json({ error: err.message }, 500);
  }
};

export const config = { schedule: '*/5 * * * *' };

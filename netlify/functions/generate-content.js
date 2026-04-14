import { fetchWT, sb, logSync, json, hashContent } from './lib/shared.js';
import { buildSystemPrompt, validateArticle, buildLiveContext, fixEncoding, TODAY } from './lib/accuracy.js';
import { qualityCheck } from './lib/quality-check.js';

// INLINED subject key extractor + registry helpers (matches monitor-f1.js,
// approve-draft.js, seed-subjects.js, generate-editorial.js). Bypasses the
// Netlify function bundle cache.
function getSubjectKeyLocal(title) {
  const h = (title || '').toLowerCase();
  if (!h) return null;
  if (h.includes('aduo')) return 'aduo:engine';
  if (h.includes('bahrain')) return 'bahrain:calendar';
  if (h.includes('saudi')) return 'saudi:calendar';
  if (h.includes('goodwood')) return 'goodwood:general';
  if (h.includes('formula 2')) return 'f2:calendar';
  if (h.includes('formula 3')) return 'f3:calendar';
  if (h.includes('overtake mode')) return 'f1:regulation';
  if (h.includes('active aero')) return 'f1:regulation';
  if (/power.*rank|champion.*(stand|check)|all.*drivers/i.test(h)) return 'f1:standings';
  const drivers = ['antonelli','russell','hamilton','leclerc','norris','piastri','verstappen','bearman','gasly','alonso','stroll','sainz','albon','ocon','lawson','lindblad','hadjar','hulkenberg','bortoleto','perez','bottas','colapinto'];
  const teams = ['mercedes','ferrari','mclaren','red bull','aston martin','alpine','haas','williams','audi','cadillac','racing bulls'];
  const entity = drivers.find(d => h.includes(d)) || teams.find(t => h.includes(t)) || '';
  if (!entity) return null;
  const NOISE = new Set(['the','a','an','in','at','of','for','and','is','has','with','from','after','how','why','what','not','his','her','f1','formula','grand','prix','race','driver','team','season','championship','points','2026']);
  const SYNONYMS = { leads:'leads',lead:'leads',leading:'leads',extends:'leads',dominates:'leads',dominant:'leads',dominance:'leads',standings:'leads', crash:'crash',crashes:'crash',incident:'crash',collision:'crash', contract:'contract',signs:'contract',deal:'contract',extension:'contract', departs:'departs',leaves:'departs',exit:'departs',departure:'departs',fired:'departs',sacked:'departs', start:'start',launch:'start',getaway:'start',clutch:'start', penalty:'penalty',penalised:'penalty',stewards:'penalty', upgrade:'upgrade',development:'upgrade',floor:'upgrade', engine:'engine',power:'engine',unit:'engine',reliability:'engine', hire:'hire',hires:'hire',recruit:'hire',appoint:'hire', pace:'pace',speed:'pace',fastest:'pace',performance:'pace',deficit:'pace', wins:'wins',win:'wins',victory:'wins',winner:'wins', pole:'pole',qualifying:'pole',qualified:'pole', preview:'preview',expect:'preview',watch:'preview',prediction:'preview',predict:'preview', rankings:'rankings',ranked:'rankings',rating:'rankings', rookie:'rookie',debut:'rookie',youngest:'rookie',teenager:'rookie' };
  const words = h.split(/[\s\-:,.']+/).filter(w => w.length > 3 && !NOISE.has(w) && w !== entity);
  const sorted = words.sort((a, b) => b.length - a.length);
  const angle = SYNONYMS[sorted[0]] || sorted[0] || 'general';
  return entity + ':' + angle;
}
async function isSubjectPublishedLocal(key) {
  if (!key) return false;
  const now = new Date().toISOString();
  try {
    const rows = await sb(`published_subjects?subject=eq.${encodeURIComponent(key)}&or=(expires_at.is.null,expires_at.gt.${now})&select=id&limit=1`);
    return (rows || []).length > 0;
  } catch { return false; }
}

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

    // No hourly cap — the subject registry is the rate limiter. If 15 new
    // stories break that all resolve to different entity:angle keys, we
    // write 15 drafts. The stale-60m window in monitor-f1 and the
    // published_subjects check in step 5 below keep volume sane.

    // Get pending topics (fetch a few for diversity filtering)
    // Priority DESC first, then fresh topics before retries, then oldest first
    const allPending = await sb('content_topics?status=eq.pending&order=priority.desc,retry_count.asc,created_at.asc&limit=5');
    if (!allPending.length) {
      await logSync('generate-content', 'success', 0, 'No pending topics', Date.now() - start);
      return json({ ok: true, generated: 0 });
    }

    // ── Subject dedup: check drafts AND published articles ──
    const DRIVER_NAMES = ['Antonelli','Russell','Leclerc','Hamilton','Norris','Piastri','Verstappen','Hadjar','Alonso','Stroll','Gasly','Colapinto','Sainz','Albon','Ocon','Bearman','Lawson','Lindblad','Hulkenberg','Bortoleto','Perez','Bottas'];
    const TEAM_NAMES = ['mercedes','ferrari','mclaren','red bull','redbull','aston martin','alpine','williams','haas','racing bulls','audi','cadillac','sauber'];
    const STOPWORDS = new Set(['the','a','an','and','or','but','of','to','in','on','for','with','at','by','from','as','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','must','can','this','that','these','those','it','its','his','her','their','our','my','your','about','after','before','during','past','three','two','one','first','last','new','how','why','what','when','where','who','which','left','behind','over','years','year','also','still','just','like','than','then','very','so','if','because','more','most','some','any','all','no','not','out','up','down','off','only','own','same']);
    function extractDrivers(text) { return DRIVER_NAMES.filter(d => text.toLowerCase().includes(d.toLowerCase())); }
    function extractTeams(text) { const t = text.toLowerCase(); return TEAM_NAMES.filter(n => t.includes(n)); }
    function significantWords(text) {
      return (text || '').toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 4 && !STOPWORDS.has(w));
    }
    function topicOverlaps(titleA, titleB) {
      const drA = extractDrivers(titleA), drB = extractDrivers(titleB);
      const tmA = extractTeams(titleA), tmB = extractTeams(titleB);
      const sharedDrivers = drA.filter(d => drB.includes(d));
      const sharedTeams = tmA.filter(t => tmB.includes(t));
      const wordsA = new Set(significantWords(titleA));
      const wordsB = significantWords(titleB);
      const sharedWords = wordsB.filter(w => wordsA.has(w));
      // Same driver = duplicate
      if (sharedDrivers.length > 0) return true;
      // Same team + 1+ shared theme word
      if (sharedTeams.length > 0 && sharedWords.length >= 1) return true;
      // 3+ shared significant words = same story
      if (sharedWords.length >= 3) return true;
      return false;
    }

    // Subject-level dedup window tightened from 24h -> 6h
    const recentDrafts24h = await sb(`content_drafts?select=title&order=created_at.desc&limit=20&created_at=gt.${new Date(Date.now() - 6 * 36e5).toISOString()}`);
    const recentArticles24h = await sb(`articles?select=title&order=published_at.desc&limit=20&published_at=gt.${new Date(Date.now() - 6 * 36e5).toISOString()}`);
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

      // If a source_url was provided but fetch returned essentially nothing,
      // mark the topic failed immediately instead of sending empty text to
      // Claude (which would otherwise hallucinate to fill the void)
      if (topic.source_url && (!sourceContent || sourceContent.length < 200)) {
        if (topic.id) await sb(`content_topics?id=eq.${topic.id}`, 'PATCH', { status: 'failed', last_error: 'Empty source content' }).catch(() => {});
        await logSync('generate-content', 'success', 0, `Empty source skipped: ${topicText.slice(0, 50)}`, Date.now() - start);
        return json({ ok: true, generated: 0, reason: 'empty_source' });
      }

      // Paywall detection — common indicator strings that mean we got the
      // marketing wrapper instead of the article body
      if (sourceContent) {
        const lc = sourceContent.toLowerCase();
        if (lc.includes('subscribe to read') || lc.includes('premium content')
          || lc.includes('create an account to continue') || lc.includes('sign in to read more')
          || lc.includes('become a subscriber')) {
          if (topic.id) await sb(`content_topics?id=eq.${topic.id}`, 'PATCH', { status: 'failed', last_error: 'Paywalled source' }).catch(() => {});
          await logSync('generate-content', 'success', 0, `Paywalled source skipped: ${topicText.slice(0, 50)}`, Date.now() - start);
          return json({ ok: true, generated: 0, reason: 'paywalled' });
        }
      }

      // Subject registry check — reject topics whose subject key is already
      // blocked. This catches topics that were queued before the registry
      // was seeded but would produce duplicate content.
      const topicKey = getSubjectKeyLocal(topicText);
      if (topicKey && await isSubjectPublishedLocal(topicKey)) {
        if (topic.id) await sb(`content_topics?id=eq.${topic.id}`, 'PATCH', { status: 'failed', last_error: 'Subject already published: ' + topicKey }).catch(() => {});
        await logSync('generate-content', 'success', 0, `Subject blocked (${topicKey}): ${topicText.slice(0, 50)}`, Date.now() - start);
        return json({ ok: true, generated: 0, reason: 'subject_blocked', key: topicKey });
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

      // Translated-source note — headline/summary came from a foreign-language
      // feed and were machine-translated. Tell Claude so it doesn't mistake
      // translation artifacts for facts.
      if (topic.source_language && topic.source_language !== 'en') {
        const LANG_NAME = { it: 'Italian', de: 'German', es: 'Spanish', pt: 'Portuguese', nl: 'Dutch' };
        const langName = LANG_NAME[topic.source_language] || topic.source_language;
        systemPrompt += `\n\nThis story originated from a ${langName} source. The headline and summary have been translated. Write the article in English.`;
      }

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
        userPrompt = `Source article from ${sourcePublication}:\n"""\n${sourceContent}\n"""\n\nRewrite this story completely in GridFeed voice for our readers.\n\nPLAGIARISM RULES (ENFORCED BY AUTOMATED CHECK — VIOLATION = AUTO-REJECT):\n- NEVER copy any 6+ consecutive words from the source verbatim\n- Rewrite every sentence from scratch in your own words\n- Change sentence structure, word order, and vocabulary\n- Do not paraphrase one-to-one; restructure the narrative\n- Use the source ONLY as a fact reference, never as a text template\n\nCRITICAL RULES:\n- Only use facts that appear in the source above\n- Every direct quote MUST be attributed: "Speaking to ${sourcePublication}, [driver] said..."\n- Do not invent quotes, briefings, or statements\n- Do not add analysis that is not grounded in the source facts\n- If the source mentions specific numbers, use those exact numbers\n- Lead sentence must contain a specific driver name AND a specific number\n- Match the GridFeed voice (sharp, authoritative, data-backed)\n- Word count: ${wordTarget}\n\n${fullContext}\n\nReturn ONLY valid JSON:\n{"title":"...","excerpt":"...","body":"...","tags":["ANALYSIS"],"content_type":"${contentType}"}`;
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

      // Plagiarism gates removed — drafts are reviewed/rewritten by Claude before publish

      // Title dedup (exact match)
      const titleCheck = await sb(`content_drafts?title=eq.${encodeURIComponent(parsed.title)}&limit=1`);
      if (titleCheck.length) {
        if (topic.id) await sb(`content_topics?id=eq.${topic.id}`, 'PATCH', { status: 'drafted' });
        await logSync('generate-content', 'success', 0, 'Duplicate title skipped: ' + parsed.title.slice(0, 50), Date.now() - start);
        return json({ ok: true, generated: 0, reason: 'duplicate_title' });
      }

      // Subject-level dedup on the GENERATED title — re-check against all recent content
      // (catches case where Claude wrote about same subject from a different topic)
      const freshDrafts = await sb(`content_drafts?select=title&order=created_at.desc&limit=20&created_at=gt.${new Date(Date.now() - 6 * 36e5).toISOString()}`);
      const freshArticles = await sb(`articles?select=title&order=published_at.desc&limit=20&published_at=gt.${new Date(Date.now() - 6 * 36e5).toISOString()}`);
      const freshTitles = [...freshDrafts, ...freshArticles].map(r => r.title || '');
      const overlapMatch = freshTitles.find(t => topicOverlaps(parsed.title, t));
      if (overlapMatch && !parsed.title.toLowerCase().startsWith('update')) {
        if (topic.id) await sb(`content_topics?id=eq.${topic.id}`, 'PATCH', { status: 'skipped', last_error: 'Subject already covered: ' + overlapMatch.slice(0, 60) });
        await logSync('generate-content', 'success', 0, `Subject overlap skipped: "${parsed.title.slice(0, 40)}" vs "${overlapMatch.slice(0, 40)}"`, Date.now() - start);
        return json({ ok: true, generated: 0, reason: 'subject_overlap', existing: overlapMatch });
      }

      // Content hash dedup
      const h = simpleHash(parsed.body || '');
      const hashCheck = await sb(`content_hashes?hash=eq.${h}&limit=1`);
      if (hashCheck.length) {
        if (topic.id) await sb(`content_topics?id=eq.${topic.id}`, 'PATCH', { status: 'drafted' });
        await logSync('generate-content', 'success', 0, 'Duplicate content hash', Date.now() - start);
        return json({ ok: true, generated: 0, reason: 'duplicate_hash' });
      }

      // Quality check — catches runaway generation, leaked metadata, orphan
      // fragments, empty markers, bad title length
      const qc = qualityCheck(parsed.title, parsed.body);
      if (!qc.valid) {
        if (topic.id) await sb(`content_topics?id=eq.${topic.id}`, 'PATCH', { status: 'failed', last_error: 'Quality: ' + qc.errors.join('; ') }).catch(() => {});
        await logSync('generate-content', 'quality_failed', 0, `Quality failed: ${qc.errors.join('; ')} — "${(parsed.title || '').slice(0, 40)}"`, Date.now() - start);
        return json({ ok: true, generated: 0, reason: 'quality_failed', errors: qc.errors });
      }

      // Insert draft
      console.log('[generate-content] About to insert draft, validation result was:', validation.valid, '— title:', parsed.title.slice(0, 60));
      // Force BREAKING tag for breaking content type so it shows in article cards
      let finalTags = parsed.tags || ['ANALYSIS'];
      if (contentType === 'breaking' && !finalTags.includes('BREAKING')) {
        finalTags = ['BREAKING', ...finalTags.filter(t => t !== 'ANALYSIS')];
      }
      await sb('content_drafts', 'POST', {
        title: parsed.title, body: parsed.body, excerpt: parsed.excerpt,
        tags: finalTags, content_type: parsed.content_type || contentType,
        review_status: 'pending', source_context: { topic: topicText },
        priority_score: topic.priority || 5, generation_model: 'GridFeed Pipeline',
        race_id: topic.race_id || null,
      });

      // Record hash + mark topic drafted
      await sb('content_hashes', 'POST', { hash: h, type: contentType, source: 'generate-content' });
      if (topic.id) await sb(`content_topics?id=eq.${topic.id}`, 'PATCH', { status: 'drafted' });

      // Register subject in the registry with 48h expiry so follow-up
      // angles on the same driver/team are blocked from drafting again
      const savedKey = getSubjectKeyLocal(parsed.title) || topicKey;
      if (savedKey) {
        await sb('published_subjects', 'POST', {
          subject: savedKey,
          article_id: null,
          expires_at: new Date(Date.now() + 48 * 36e5).toISOString(),
        }).catch(() => {});
      }

      // Notify
      const siteUrl = process.env.URL || 'https://gridfeed.co';
      fetchWT(siteUrl + '/.netlify/functions/notify-draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: parsed.title, content_type: contentType, priority_score: topic.priority || 5, excerpt: (parsed.excerpt || '').slice(0, 200) }) }, 5000).catch(() => {});

      // Self-chain: kick another generate-content so the queue drains in one cron tick
      // (fire and forget — won't extend this function's runtime)
      fetchWT(siteUrl + '/.netlify/functions/generate-content', { method: 'POST' }, 60000).catch(() => {});

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


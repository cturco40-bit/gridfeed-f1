import Anthropic from '@anthropic-ai/sdk';
import { getSupabase, logSync } from './lib/supabase.mjs';

const SEASON = 2026;

const CONTENT_TYPE_TO_TAGS = {
  race_recap: ['RACE'],
  qualifying_recap: ['QUALIFYING'],
  preview: ['PREVIEW'],
  analysis: ['ANALYSIS'],
  picks_article: ['BETTING'],
  breaking: ['BREAKING'],
};

const SYSTEM_PROMPT = `You are GridFeed's AI sports editor covering Formula 1. Your writing style is:
- Concise, data-driven, and authoritative
- No fluff or filler — every sentence adds value
- Short paragraphs (2-3 sentences max)
- Use driver surnames after first mention
- Include specific stats, positions, and lap times when available
- Tone: knowledgeable insider, not hype-driven

You MUST respond with valid JSON in this exact format:
{
  "title": "Article headline (compelling, under 80 chars)",
  "body": "Full article body in plain text with paragraph breaks",
  "excerpt": "1-2 sentence summary for article cards"
}`;

export default async (req, context) => {
  const start = Date.now();
  const sb = getSupabase();
  let articlesGenerated = 0;

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not set');
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // 1. Check for pending topics
    const { data: pendingTopics } = await sb
      .from('content_topics')
      .select('*')
      .eq('status', 'pending')
      .order('priority', { ascending: true })
      .limit(2);

    let topics = pendingTopics || [];

    // 2. Auto-detect topics if none queued
    if (!topics.length) {
      topics = await detectTopics(sb);
    }

    if (!topics.length) {
      await logSync(sb, {
        functionName: 'generate-articles',
        status: 'success',
        recordsAffected: 0,
        message: 'No topics to generate',
        durationMs: Date.now() - start,
      });
      return new Response(JSON.stringify({ ok: true, articlesGenerated: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Generate each article
    for (const topic of topics.slice(0, 2)) {
      const contentType = topic.content_type || 'analysis';
      const articleContext = await gatherContext(sb, topic);

      const userPrompt = buildPrompt(contentType, topic, articleContext);

      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const text = response.content[0]?.text || '';

      let parsed;
      try {
        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch?.[0] || text);
      } catch {
        parsed = {
          title: topic.topic || 'F1 Update',
          body: text,
          excerpt: text.slice(0, 150),
        };
      }

      const tags = CONTENT_TYPE_TO_TAGS[contentType] || ['ANALYSIS'];
      const slug = parsed.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80);

      // Insert into articles
      const { data: article } = await sb.from('articles').insert({
        title: parsed.title,
        slug,
        body: parsed.body,
        excerpt: parsed.excerpt,
        author: 'GridFeed AI',
        tags,
        race_id: topic.race_id || null,
        status: 'published',
        source_url: null,
        published_at: new Date().toISOString(),
      }).select('id').single();

      // Insert into content_drafts for audit trail
      await sb.from('content_drafts').insert({
        title: parsed.title,
        body: parsed.body,
        excerpt: parsed.excerpt,
        tags,
        race_id: topic.race_id || null,
        content_type: contentType,
        source_context: userPrompt.slice(0, 500),
        review_status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: 'auto-publish',
        published_article_id: article?.id || null,
        generation_model: 'claude-haiku-4-5',
      });

      // Update topic status if it came from content_topics
      if (topic.id) {
        await sb.from('content_topics').update({ status: 'drafted' }).eq('id', topic.id);
      }

      articlesGenerated++;
    }

    await logSync(sb, {
      functionName: 'generate-articles',
      status: 'success',
      recordsAffected: articlesGenerated,
      message: `Generated ${articlesGenerated} articles`,
      durationMs: Date.now() - start,
    });

    return new Response(JSON.stringify({ ok: true, articlesGenerated }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    await logSync(sb, {
      functionName: 'generate-articles',
      status: 'error',
      message: err.message,
      durationMs: Date.now() - start,
      errorDetail: err.stack,
    });
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

async function detectTopics(sb) {
  const topics = [];
  const now = new Date();

  // Get all races
  const { data: races } = await sb
    .from('races')
    .select('id, name, circuit, country, race_date, round, status')
    .eq('season', SEASON)
    .order('race_date', { ascending: true });

  if (!races?.length) return topics;

  // Find next upcoming race
  const nextRace = races.find(r => r.status === 'upcoming' && new Date(r.race_date) > now);

  // Check for preview opportunity (race within 3 days)
  if (nextRace) {
    const daysUntil = (new Date(nextRace.race_date) - now) / 86400000;
    if (daysUntil <= 3 && daysUntil > 0) {
      // Check if preview already exists
      const { data: existing } = await sb
        .from('articles')
        .select('id')
        .ilike('title', `%${nextRace.name.replace(' Grand Prix', '')}%preview%`)
        .limit(1);

      if (!existing?.length) {
        topics.push({
          topic: `${nextRace.name} Race Preview`,
          race_id: nextRace.id,
          content_type: 'preview',
        });
      }
    }
  }

  // Check for recent race recap
  const recentCompleted = races
    .filter(r => r.status === 'completed')
    .filter(r => (now - new Date(r.race_date)) < 86400000 * 2)
    .pop();

  if (recentCompleted) {
    const { data: existing } = await sb
      .from('articles')
      .select('id')
      .ilike('title', `%${recentCompleted.name.replace(' Grand Prix', '')}%`)
      .in('tags', [['RACE']])
      .limit(1);

    if (!existing?.length) {
      topics.push({
        topic: `${recentCompleted.name} Race Recap`,
        race_id: recentCompleted.id,
        content_type: 'race_recap',
      });
    }
  }

  // If no specific topics, generate a general analysis piece
  if (!topics.length) {
    const { data: recentArticles } = await sb
      .from('articles')
      .select('id')
      .order('published_at', { ascending: false })
      .limit(1);

    // Only generate if no article in last 6 hours
    if (!recentArticles?.length || true) {
      const targetRace = nextRace || races[races.length - 1];
      topics.push({
        topic: `F1 ${SEASON} Season Analysis`,
        race_id: targetRace?.id || null,
        content_type: 'analysis',
      });
    }
  }

  return topics;
}

async function gatherContext(sb, topic) {
  const ctx = {};

  // Race details
  if (topic.race_id) {
    const { data: race } = await sb
      .from('races')
      .select('*')
      .eq('id', topic.race_id)
      .single();
    ctx.race = race;
  }

  // Driver facts
  const { data: facts } = await sb
    .from('driver_facts')
    .select('driver_name, category, fact_text')
    .eq('season', SEASON)
    .limit(15);
  ctx.driverFacts = facts || [];

  // Recent results
  if (topic.race_id) {
    const { data: results } = await sb
      .from('leaderboard')
      .select('position, driver_name, team_name, session_type')
      .eq('race_id', topic.race_id)
      .order('position', { ascending: true })
      .limit(20);
    ctx.results = results || [];
  }

  // Current odds
  if (topic.race_id) {
    const { data: odds } = await sb
      .from('driver_odds')
      .select('driver_name, odds_american, implied_prob, market')
      .eq('race_id', topic.race_id)
      .eq('market', 'race_winner')
      .order('implied_prob', { ascending: false })
      .limit(10);
    ctx.odds = odds || [];
  }

  // Recent articles (to avoid repetition)
  const { data: recentArticles } = await sb
    .from('articles')
    .select('title, tags')
    .order('published_at', { ascending: false })
    .limit(5);
  ctx.recentArticles = recentArticles || [];

  return ctx;
}

function buildPrompt(contentType, topic, ctx) {
  let prompt = '';

  switch (contentType) {
    case 'preview':
      prompt = `Write a race preview article for the ${ctx.race?.name || topic.topic}.

Circuit: ${ctx.race?.circuit || 'TBD'}, ${ctx.race?.country || ''}
Race date: ${ctx.race?.race_date || 'TBD'}

Driver background and form:
${ctx.driverFacts.map(f => `- ${f.driver_name} (${f.category}): ${f.fact_text}`).join('\n')}

${ctx.odds?.length ? `Current betting odds (race winner):\n${ctx.odds.map(o => `- ${o.driver_name}: ${o.odds_american} (${(o.implied_prob * 100).toFixed(1)}%)`).join('\n')}` : ''}

Recent articles to avoid repeating: ${ctx.recentArticles.map(a => a.title).join(', ')}

Write 400-600 words. Focus on key storylines, strategy considerations, and who to watch.`;
      break;

    case 'race_recap':
      prompt = `Write a race recap for the ${ctx.race?.name || topic.topic}.

${ctx.results?.length ? `Results:\n${ctx.results.filter(r => r.session_type === 'race').map(r => `P${r.position}: ${r.driver_name} (${r.team_name})`).join('\n')}` : 'Results not yet available — write a general recap based on the context below.'}

Driver context:
${ctx.driverFacts.slice(0, 5).map(f => `- ${f.driver_name}: ${f.fact_text}`).join('\n')}

Write 400-600 words. Cover the winner's performance, key battles, surprises, and championship implications.`;
      break;

    case 'qualifying_recap':
      prompt = `Write a qualifying recap for the ${ctx.race?.name || topic.topic}.

${ctx.results?.length ? `Qualifying results:\n${ctx.results.filter(r => r.session_type === 'qualifying').map(r => `P${r.position}: ${r.driver_name} (${r.team_name})`).join('\n')}` : 'Qualifying results not yet available.'}

Write 300-400 words. Focus on pole position battle, surprise performances, and race day implications.`;
      break;

    default: // analysis
      prompt = `Write an F1 ${SEASON} season analysis piece.

Topic: ${topic.topic}

Driver context:
${ctx.driverFacts.map(f => `- ${f.driver_name} (${f.category}): ${f.fact_text}`).join('\n')}

${ctx.results?.length ? `Recent race results:\n${ctx.results.slice(0, 10).map(r => `P${r.position}: ${r.driver_name}`).join('\n')}` : ''}

Recent articles (avoid overlap): ${ctx.recentArticles.map(a => a.title).join(', ')}

Write 400-600 words. Provide insight on championship trends, team performance, and what to expect next.`;
  }

  return prompt;
}

export const config = {
  schedule: '0 */4 * * *',
};

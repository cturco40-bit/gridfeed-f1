import { getSupabase, logSync, jsonResponse } from './lib/supabase.js';

// TODO: Wire up an F1 news source (RSS, newsapi.org, etc.)
// For now this is a placeholder that logs each run

export default async (req, context) => {
  const start = Date.now();
  const sb = getSupabase();

  try {
    await logSync(sb, {
      functionName: 'fetch-news',
      status: 'success',
      recordsAffected: 0,
      message: 'Stub — no news source configured yet',
      durationMs: Date.now() - start,
    });
    return jsonResponse({ ok: true, articles: 0, message: 'No news source configured yet' });
  } catch (err) {
    await logSync(sb, { functionName: 'fetch-news', status: 'error', message: err.message, durationMs: Date.now() - start, errorDetail: err.stack });
    return jsonResponse({ error: err.message }, 500);
  }
};

export const config = {
  schedule: '*/10 * * * *',
};

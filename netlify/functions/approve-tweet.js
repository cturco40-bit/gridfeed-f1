import { sb, fetchWT, logSync, json } from './lib/shared.js';

export default async (req) => {
  const start = Date.now();
  try {
    const body = await req.json();
    const { id, tweet_text, postAt } = body;
    if (!id) return json({ error: 'Missing tweet id' }, 400);

    if (tweet_text) await sb(`tweets?id=eq.${id}`, 'PATCH', { tweet_text });

    // Scheduled mode — if postAt is a valid future timestamp (>10s from now),
    // set scheduled_post_at and mark approved. post-tweet.js already filters on
    // `scheduled_post_at.is.null OR lte.now()`, so the scheduler cron will pick
    // it up on the first tick after the timestamp passes.
    const postTs = postAt ? Date.parse(postAt) : NaN;
    const isScheduled = Number.isFinite(postTs) && postTs > Date.now() + 10_000;
    if (isScheduled) {
      await sb(`tweets?id=eq.${id}`, 'PATCH', {
        status: 'approved',
        scheduled_post_at: new Date(postTs).toISOString(),
      });
      await logSync('approve-tweet', 'success', 1, `Scheduled tweet ${id} for ${new Date(postTs).toISOString()}`, Date.now() - start);
      return json({ ok: true, scheduled: true, scheduled_post_at: new Date(postTs).toISOString() });
    }

    await sb(`tweets?id=eq.${id}`, 'PATCH', { status: 'approved', scheduled_post_at: null });

    // Fire post-tweet immediately to push it out (don't wait for cron)
    const siteUrl = process.env.URL || 'https://gridfeed.co';
    try {
      const postRes = await fetchWT(siteUrl + '/.netlify/functions/post-tweet', { method: 'POST' }, 20000);
      const postData = await postRes.json().catch(() => ({}));
      await logSync('approve-tweet', 'success', 1, `Approved + posted tweet ${id} (${postData.posted || 0} sent)`, Date.now() - start);
      return json({ ok: true, posted: postData.posted || 0, tweetId: postData.tweetId });
    } catch (postErr) {
      await logSync('approve-tweet', 'success', 1, `Approved tweet ${id} (post failed: ${postErr.message})`, Date.now() - start);
      return json({ ok: true, posted: 0, postError: postErr.message });
    }
  } catch (err) {
    await logSync('approve-tweet', 'error', 0, err.message, Date.now() - start);
    return json({ error: err.message }, 500);
  }
};

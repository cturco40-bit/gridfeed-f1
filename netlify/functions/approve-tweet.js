import { sb, fetchWT, logSync, json } from './lib/shared.js';

export default async (req) => {
  const start = Date.now();
  try {
    const body = await req.json();
    const { id, tweet_text } = body;
    if (!id) return json({ error: 'Missing tweet id' }, 400);

    if (tweet_text) await sb(`tweets?id=eq.${id}`, 'PATCH', { tweet_text });
    await sb(`tweets?id=eq.${id}`, 'PATCH', { status: 'approved' });

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

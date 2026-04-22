import { fetchWT } from './shared.js';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM = `You are a duplicate-detection classifier for an F1 news site. Given a candidate article topic and a list of already-covered subjects, decide whether the candidate would produce the same story as any blocked subject.

Block-match means: the candidate's angle/thesis is the same as a blocked subject, even if the wording differs. Example: "Mercedes extend constructors' lead to 50 points" matches the blocked subject "mercedes:dominance" — both articles would be about Mercedes running away with the constructors championship.

Do NOT block for loose topical overlap. Both articles must be about the SAME angle/story. A piece about Mercedes' pit-stop crew does NOT match mercedes:dominance.

Return JSON only, no markdown fences:
{"blocked": true|false, "matched": "subject:key or null", "reason": "short explanation under 80 chars"}`;

// Classify whether `candidate` (a prompt/topic/headline) semantically overlaps
// with any of the `blockedSubjects` (an array of "entity:angle" slugs from
// published_subjects). Permits on any error — a classifier outage must never
// block the pipeline. Returns { blocked, matched, reason, source }.
export async function classifySemanticallyBlocked(candidate, blockedSubjects, opts = {}) {
  const { timeoutMs = 5000, source = 'classifier' } = opts;
  if (!ANTHROPIC_KEY) return { blocked: false, reason: 'no_api_key', source };
  const subjects = (blockedSubjects || []).filter(Boolean).slice(0, 50);
  if (!candidate || !subjects.length) return { blocked: false, reason: 'no_input', source };

  const userMsg = `Candidate: ${String(candidate).slice(0, 400)}\n\nBlocked subjects:\n${subjects.map(s => '- ' + s).join('\n')}\n\nIs the candidate semantically the same story as any blocked subject?`;

  try {
    const res = await fetchWT('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 120,
        system: SYSTEM,
        messages: [{ role: 'user', content: userMsg }],
      }),
    }, timeoutMs);

    if (!res.ok) return { blocked: false, reason: 'classifier_http_' + res.status, source };

    const data = await res.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    const cleaned = text.replace(/```json\s?|```/g, '').trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart < 0 || jsonEnd < 0) return { blocked: false, reason: 'classifier_no_json', source };
    const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));

    return {
      blocked: !!parsed.blocked,
      matched: parsed.matched && parsed.matched !== 'null' ? parsed.matched : null,
      reason: (parsed.reason || '').slice(0, 120),
      source,
    };
  } catch (e) {
    return {
      blocked: false,
      reason: 'classifier_error:' + ((e && e.message) || 'unknown').slice(0, 60),
      source,
    };
  }
}

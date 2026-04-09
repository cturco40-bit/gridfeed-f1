// HTTP trigger wrapper for sync-odds (manual invocation)
import handler from './sync-odds.mjs';
export default handler;
export const config = { path: '/api/sync-odds' };

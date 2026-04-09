// HTTP trigger wrapper for sync-results (manual invocation)
import handler from './sync-results.mjs';
export default handler;
export const config = { path: '/api/sync-results' };

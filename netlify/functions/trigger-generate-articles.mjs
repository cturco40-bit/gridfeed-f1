// HTTP trigger wrapper for generate-articles (manual invocation)
import handler from './generate-articles.mjs';
export default handler;
export const config = { path: '/api/generate-articles' };

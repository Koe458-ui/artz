import { onRequestPost, onRequestGet } from './functions/api/ored.js';
import { notFound } from './functions/lib/ored-http.js';

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    if (pathname === '/config.js') {
      const config = {
        AUTH_URL: String(env.ORED_AUTH_URL || '').trim().replace(/\/$/, ''),
        AUTH_KEY: String(env.ORED_AUTH_KEY || '').trim(),
        SITE_URL: String(env.ORED_SITE_URL || 'https://digiartz.net').trim().replace(/\/$/, ''),
      };
      return new Response('window.ORED_CONFIG = ' + JSON.stringify(config) + ';\n', {
        headers: {
          'content-type': 'text/javascript; charset=utf-8',
          'cache-control': 'public, max-age=300, must-revalidate',
          'x-robots-tag': 'noindex, nofollow',
        },
      });
    }

    if (pathname === '/api/ored') {
      if (request.method === 'POST') return onRequestPost({ request, env, ctx });
      if (request.method === 'GET' || request.method === 'HEAD') return onRequestGet({ request, env, ctx });
      return new Response('Method not allowed', {
        status: 405,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', allow: 'POST' },
      });
    }

    if (pathname === '/api' || pathname.startsWith('/api/')) return notFound();
    if (pathname === '/ored/model' || pathname.startsWith('/ored/model/')) return notFound();

    return env.ASSETS.fetch(request);
  },
};

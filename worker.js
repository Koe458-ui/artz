import { onRequestPost, onRequestGet } from './functions/api/ored.js';
import { notFound } from './functions/lib/ored-http.js';

const BASELINE = {
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), usb=(), magnetometer=(), payment=(), interest-cohort=()',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'x-permitted-cross-domain-policies': 'none',
  'x-robots-tag': 'noindex, nofollow',
};

const sealed = (response) => {
  const out = new Response(response.body, response);
  for (const name of Object.keys(BASELINE)) out.headers.set(name, BASELINE[name]);
  return out;
};

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    if (pathname === '/config.js') {
      const config = {
        AUTH_URL: String(env.ORED_AUTH_URL || '').trim().replace(/\/$/, ''),
        AUTH_KEY: String(env.ORED_AUTH_KEY || '').trim(),
        SITE_URL: String(env.ORED_SITE_URL || 'https://digiartz.net').trim().replace(/\/$/, ''),
      };
      return sealed(new Response('window.ORED_CONFIG = ' + JSON.stringify(config) + ';\n', {
        headers: {
          'content-type': 'text/javascript; charset=utf-8',
          'cache-control': 'public, max-age=300, must-revalidate',
        },
      }));
    }

    if (pathname === '/api/ored') {
      if (request.method === 'POST') return sealed(await onRequestPost({ request, env, ctx }));
      if (request.method === 'GET' || request.method === 'HEAD') return sealed(await onRequestGet({ request, env, ctx }));
      return sealed(new Response('Method not allowed', {
        status: 405,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', allow: 'POST' },
      }));
    }

    if (pathname === '/api' || pathname.startsWith('/api/')) return sealed(notFound());
    if (pathname === '/ored/model' || pathname.startsWith('/ored/model/')) return sealed(notFound());

    return env.ASSETS.fetch(request);
  },
};

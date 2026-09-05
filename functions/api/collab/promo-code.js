import { handle } from '../collab.js';

export const onRequestPost = async (ctx) => {
  let op = 'stats';
  try {
    const body = await ctx.request.clone().json();
    if (body && body.op) op = String(body.op);
  } catch {   }
  return handle(op === 'create' ? 'promo-create' : 'promo-mine', ctx);
};

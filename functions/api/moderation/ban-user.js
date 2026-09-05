import { handle } from '../collab.js';

export const onRequestPost = async (ctx) => {
  let unban = false;
  try {
    const body = await ctx.request.clone().json();
    unban = !!(body && body.unban);
  } catch {   }
  return handle(unban ? 'unban' : 'ban', ctx);
};

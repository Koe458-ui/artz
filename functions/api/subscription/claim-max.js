import { handle } from '../collab.js';
export const onRequestPost = (ctx) => handle('claim-max', ctx);

import { createD1Store } from './d1Store';
import { handle } from './handler';
import { parseAllowedOrigins } from './logic/cors';

interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS: string;
  IP_SALT: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, {
      store: createD1Store(env.DB),
      allowedOrigins: parseAllowedOrigins(env.ALLOWED_ORIGINS),
      ipSalt: env.IP_SALT,
      now: () => Date.now(),
    });
  },
};

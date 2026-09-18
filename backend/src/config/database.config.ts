import { registerAs } from '@nestjs/config';
import { env } from './env.validation.js';

/** Conexión a PostgreSQL con pgvector. */
export default registerAs('database', () => ({
  url: env().DATABASE_URL,
}));

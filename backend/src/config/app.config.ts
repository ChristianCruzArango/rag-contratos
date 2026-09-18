import { registerAs } from '@nestjs/config';
import { env } from './env.validation.js';

/** Configuración del servidor HTTP. */
export default registerAs('app', () => ({
  port: env().PORT,
  corsOrigin: env().CORS_ORIGIN,
}));

import { registerAs } from '@nestjs/config';
import { env } from './env.validation.js';

/**
 * Generación de respuestas vía OpenRouter.
 *
 * Sólo chat/completions: OpenRouter no expone `/v1/embeddings`, por eso los
 * embeddings tienen su propia configuración.
 */
export default registerAs('openrouter', () => ({
  apiKey: env().OPENROUTER_API_KEY,
  baseUrl: env().OPENROUTER_BASE_URL,
  model: env().OPENROUTER_MODEL,
  siteUrl: env().OPENROUTER_SITE_URL,
  siteName: env().OPENROUTER_SITE_NAME,
}));

import { registerAs } from '@nestjs/config';
import { env } from './env.validation.js';

/**
 * Reconocimiento óptico de caracteres para los PDF escaneados.
 *
 * `mode`: auto = sólo las páginas sin capa de texto aprovechable,
 * force = todas (útil si el PDF trae una capa de texto basura), never = nunca.
 */
export default registerAs('ocr', () => ({
  enabled: env().OCR_ENABLED,
  mode: env().OCR_MODE as 'auto' | 'force' | 'never',
  engine: env().OCR_ENGINE as 'tesseract' | 'vision',
  langs: env().OCR_LANGS,
  cachePath: env().OCR_CACHE_PATH,
  minChars: env().OCR_MIN_CHARS,
  scale: env().OCR_SCALE,
  concurrency: env().OCR_CONCURRENCY,
  minConfidence: env().OCR_MIN_CONFIDENCE,
  maxPages: env().OCR_MAX_PAGES,
  visionModel: env().OCR_VISION_MODEL,
}));

import { registerAs } from '@nestjs/config';
import { env } from './env.validation.js';

/**
 * Generación de vectores. Dos proveedores posibles: un modelo local sin coste
 * o cualquier endpoint compatible con la API de OpenAI.
 */
export default registerAs('embeddings', () => ({
  provider: env().EMBEDDING_PROVIDER,
  localModel: env().EMBEDDING_LOCAL_MODEL,
  baseUrl: env().EMBEDDING_BASE_URL,
  apiKey: env().EMBEDDING_API_KEY,
  model: env().EMBEDDING_MODEL,
  dimensions: env().EMBEDDING_DIMENSIONS,
  batchSize: env().EMBEDDING_BATCH_SIZE,
}));

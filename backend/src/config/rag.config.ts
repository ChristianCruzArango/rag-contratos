import { registerAs } from '@nestjs/config';
import { env } from './env.validation.js';

/** Troceo y recuperación. */
export default registerAs('rag', () => ({
  chunkSize: env().CHUNK_SIZE,
  chunkOverlap: env().CHUNK_OVERLAP,
  topK: env().RAG_TOP_K,
  minScore: env().RAG_MIN_SCORE,
}));

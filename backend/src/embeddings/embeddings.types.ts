/** Tipos del servicio de embeddings. */

export type Provider = 'local' | 'openai';

/** Progreso de un lote, para poder mostrar el avance de la indexación. */
export interface EmbeddingBatchInfo {
  lote: number;
  lotes: number;
  hechos: number;
  total: number;
  ms: number;
  vectores: number[][];
}

export type EmbeddingProgress = (info: EmbeddingBatchInfo) => void;

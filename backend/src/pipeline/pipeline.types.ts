/**
 * Contrato de eventos del pipeline RAG.
 *
 * El backend lo emite paso a paso mientras trabaja; el frontend lo consume para
 * animar lo que está ocurriendo de verdad. Nada aquí es decorativo: cada campo
 * sale de una medición real (caracteres extraídos, confianza del OCR, rango en
 * cada buscador, dimensiones del vector…).
 */

/** Estado de una página del PDF tras leer su capa de texto. */
export interface PaginaInfo {
  n: number;
  caracteres: number;
  /** No llega a OCR_MIN_CHARS: es una foto, hay que reconocerla. */
  vacia: boolean;
}

/** Fragmento de muestra que se envía para poder dibujarlo. */
export interface ChunkMuestra {
  index: number;
  seccion: string | null;
  tipo_seccion: string;
  pagina: number;
  ocr: boolean;
  caracteres: number;
  tokens: number;
  texto: string;
}

export interface HitRecuperado {
  chunk_id: string;
  title: string;
  doc_type: string | null;
  seccion: string | null;
  pagina: number | null;
  ocr: boolean;
  excerpt: string;
  /** Posición en el ranking de este buscador (1 = el mejor). */
  rank: number;
  /** Coseno para el buscador vectorial, ts_rank_cd para el léxico. */
  valor: number;
}

export interface FilaFusion {
  chunk_id: string;
  title: string;
  seccion: string | null;
  pagina: number | null;
  ocr: boolean;
  excerpt: string;
  rank_semantico: number | null;
  rank_lexico: number | null;
  aporte_semantico: number;
  aporte_lexico: number;
  score: number;
  /** Entra en el contexto que se manda al modelo. */
  elegido: boolean;
}

export interface Cita {
  n: number;
  documentId: string;
  title: string;
  docType: string | null;
  seccion: string | null;
  pagina: number | null;
  score: number;
  excerpt: string;
  ocr: boolean;
}

export interface InformeOcr {
  aplicado: boolean;
  motor: string | null;
  modo: string;
  paginas_ocr: number[];
  paginas_totales: number;
  confianza_media: number | null;
  paginas_baja_confianza: number[];
  duracion_ms: number;
  omitidas_por_limite: number;
}

export type PipelineEvent =
  // ─────────────── Ingesta ───────────────
  /** 01 · Llega el archivo por multipart/form-data. */
  | {
      fase: 'recepcion';
      archivo: string;
      bytes: number;
      formato: 'pdf' | 'imagen' | 'texto';
    }
  /** 02 · unpdf lee la capa de texto, página a página. */
  | {
      fase: 'extraccion';
      paginas: PaginaInfo[];
      caracteres: number;
      vacias: number;
      ms: number;
    }
  /** 03 · El OCR decide qué páginas hay que rasterizar y reconocer. */
  | {
      fase: 'ocr-plan';
      modo: string;
      motor: string | null;
      minChars: number;
      objetivo: number[];
      omitidas: number;
      /** No hay nada que reconocer: el PDF ya traía texto. */
      innecesario: boolean;
    }
  /** 03b · Una página reconocida (llega en vivo, según se procesa). */
  | {
      fase: 'ocr-pagina';
      pagina: number;
      confianza: number | null;
      caracteres: number;
      ms: number;
      muestra: string;
    }
  | { fase: 'ocr-resumen'; informe: InformeOcr }
  /** 04 · El texto se parte por cláusula y por tamaño. */
  | {
      fase: 'troceo';
      total: number;
      chunkSize: number;
      overlap: number;
      secciones: number;
      conOcr: number;
      muestras: ChunkMuestra[];
      ms: number;
    }
  /** 05 · Cada lote de fragmentos se convierte en vectores. */
  | {
      fase: 'embeddings-lote';
      lote: number;
      lotes: number;
      hechos: number;
      total: number;
      modelo: string;
      dimensiones: number;
      ms: number;
      /** Primeras dimensiones del primer vector del lote, para dibujarlo. */
      muestra: number[];
    }
  /** 06 · Las filas entran en pgvector con su índice HNSW. */
  | {
      fase: 'almacenado';
      documentId: string;
      filas: number;
      tabla: string;
      indice: string;
      dimensiones: number;
      ms: number;
    }
  | {
      fase: 'ingesta-lista';
      documentId: string;
      titulo: string;
      fragmentos: number;
      omitido: boolean;
      ms: number;
    }
  // ─────────────── Consulta ───────────────
  | { fase: 'consulta'; texto: string; topK: number; docType: string | null }
  | {
      fase: 'consulta-embedding';
      modelo: string;
      dimensiones: number;
      ms: number;
      muestra: number[];
    }
  | {
      fase: 'busqueda-vectorial';
      ms: number;
      candidatos: number;
      hits: HitRecuperado[];
    }
  | {
      fase: 'busqueda-lexica';
      ms: number;
      candidatos: number;
      tsquery: string;
      lexemas: string[];
      hits: HitRecuperado[];
    }
  | { fase: 'fusion'; k: number; elegidos: number; filas: FilaFusion[] }
  | {
      fase: 'prompt';
      modelo: string;
      sistemaChars: number;
      contextoChars: number;
      fragmentos: number;
      tokensAprox: number;
      sistema: string;
      contexto: string;
    }
  | { fase: 'citas'; citas: Cita[] }
  | { fase: 'token'; texto: string }
  | { fase: 'respuesta-lista'; ms: number; caracteres: number }
  // ─────────────── Control ───────────────
  | { fase: 'error'; mensaje: string };

/** Quien quiera observar el pipeline pasa una función de este tipo. */
export type PipelineReporter = (evento: PipelineEvent) => void;

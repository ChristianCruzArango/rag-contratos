/**
 * Espejo del contrato de eventos del backend (`backend/src/pipeline`).
 *
 * Cada evento llega mientras el trabajo ocurre de verdad: no hay tiempos
 * simulados. Si el OCR tarda 2,4 s en una página, el evento llega a los 2,4 s
 * y trae la confianza que midió el motor.
 */

export interface PaginaInfo {
  n: number;
  caracteres: number;
  /** No llega a OCR_MIN_CHARS: es una foto, hay que reconocerla. */
  vacia: boolean;
}

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
  rank: number;
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
  elegido: boolean;
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

export type PipelineEvent =
  | { fase: 'recepcion'; archivo: string; bytes: number; formato: 'pdf' | 'imagen' | 'texto' }
  | { fase: 'extraccion'; paginas: PaginaInfo[]; caracteres: number; vacias: number; ms: number }
  | {
      fase: 'ocr-plan';
      modo: string;
      motor: string | null;
      minChars: number;
      objetivo: number[];
      omitidas: number;
      innecesario: boolean;
    }
  | {
      fase: 'ocr-pagina';
      pagina: number;
      confianza: number | null;
      caracteres: number;
      ms: number;
      muestra: string;
    }
  | { fase: 'ocr-resumen'; informe: InformeOcr }
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
  | {
      fase: 'embeddings-lote';
      lote: number;
      lotes: number;
      hechos: number;
      total: number;
      modelo: string;
      dimensiones: number;
      ms: number;
      muestra: number[];
    }
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
  | { fase: 'consulta'; texto: string; topK: number; docType: string | null }
  | {
      fase: 'consulta-embedding';
      modelo: string;
      dimensiones: number;
      ms: number;
      muestra: number[];
    }
  | { fase: 'busqueda-vectorial'; ms: number; candidatos: number; hits: HitRecuperado[] }
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
  | { fase: 'error'; mensaje: string };

export type Fase = PipelineEvent['fase'];

/** Extrae el evento concreto de una fase, para tipar los campos sin castear. */
export type EventoDe<F extends Fase> = Extract<PipelineEvent, { fase: F }>;

// ── Espacio vectorial ───────────────────────────────────────────────────────

export interface PuntoVectorial {
  id: string;
  x: number;
  y: number;
  titulo: string;
  tipo: string | null;
  seccion: string | null;
  pagina: number | null;
  ocr: boolean;
  similitud: number | null;
  elegido: boolean;
  /** Cayó fuera del encuadre: se dibuja pegado al borde y hueco. */
  fuera: boolean;
  excerpt: string;
}

export interface EspacioVectorial {
  modelo: string;
  dimensiones: number;
  totalFragmentos: number;
  muestra: number;
  varianza: [number, number];
  puntos: PuntoVectorial[];
  consulta: { x: number; y: number; texto: string } | null;
  fueraDeCuadro: number;
}

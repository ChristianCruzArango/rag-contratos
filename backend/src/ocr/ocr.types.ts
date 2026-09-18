import type { PipelineReporter } from '../pipeline/pipeline.types.js';

/** Resultado del reconocimiento de una página o imagen. */
export interface OcrPageResult {
  page: number;
  text: string;
  /** 0–100. Los motores de visión no la reportan: se marca como null. */
  confidence: number | null;
  engine: 'tesseract' | 'vision';
  durationMs: number;
}

export interface OcrEngine {
  readonly name: 'tesseract' | 'vision';
  recognize(image: Buffer, page: number): Promise<OcrPageResult>;
  dispose?(): Promise<void>;
}

/** Resumen del OCR aplicado a un documento, se guarda en su metadata. */
export interface OcrReport {
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

export interface OcrPdfInput {
  /** PDF original, necesario para rasterizar las páginas. */
  buffer: Buffer;
  /** Texto ya extraído de la capa de texto, una entrada por página. */
  pages: string[];
  /** Observador opcional: recibe el plan y cada página según se reconoce. */
  report?: PipelineReporter;
}

export interface OcrPdfOutput {
  pages: string[];
  report: OcrReport;
}

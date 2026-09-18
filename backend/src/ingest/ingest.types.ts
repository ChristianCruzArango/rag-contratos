/**
 * Tipos de la ingesta: lo que entra, en qué se parte y qué queda guardado.
 */

export interface Chunk {
  index: number;
  content: string;
  metadata: Record<string, unknown>;
}

export interface Section {
  heading: string | null;
  kind: 'clausula' | 'anexo' | 'preambulo';
  content: string;
  offset: number;
}

export interface PdfContent {
  text: string;
  pages: number;
  info: Record<string, unknown>;
  /** Texto de cada página por separado (necesario para decidir el OCR). */
  pageTexts: string[];
}

export interface IngestResult {
  documentId: string;
  title: string;
  chunks: number;
  skipped: boolean;
}

/** Forma mínima del archivo que entrega Multer (evita depender de tipos globales). */
export interface UploadedTextFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

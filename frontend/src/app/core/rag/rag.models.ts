/** Un documento del índice, tal como lo lista la API. */
export interface DocumentRow {
  id: string;
  title: string;
  doc_type: string | null;
  source: string | null;
  chunk_count: number;
  created_at: string;
  paginas: string | null;
  ocr_aplicado: boolean | null;
  ocr_motor: string | null;
  ocr_confianza: number | null;
  ocr_paginas: number | null;
}

/** Estado del índice: lo que hay guardado ahora mismo. */
export interface RagStats {
  documentos: number;
  fragmentos: number;
  fragmentosConEmbedding: number;
  fragmentosOcr: number;
  tiposDeDocumento: number;
  /** Tamaño del vector que usa el índice ahora mismo. */
  dimensiones: number;
  modeloEmbeddings: string;
}

/** Una columna de la tabla, tal como la describe el catálogo de Postgres. */
export interface ColumnaTabla {
  nombre: string;
  tipo: string;
  noNulo: boolean;
  /** Valor por defecto, o la expresión si la columna es generada. */
  defecto: string | null;
  /** Postgres la calcula sola: nadie la escribe nunca. */
  generada: boolean;
}

/** Un índice de la tabla, con su definición literal. */
export interface IndiceTabla {
  nombre: string;
  definicion: string;
  /** Método de acceso: btree, gin, hnsw… */
  metodo: string;
}

/**
 * Lo que se puede saber del índice HNSW desde SQL.
 *
 * El grafo interno no se puede leer, pero su **estructura** se deriva de estos
 * parámetros: con `m` vecinos por nodo, cada capa tiene aproximadamente `m`
 * veces menos nodos que la de abajo, y el número de capas sale de log_m(filas).
 */
export interface IndiceHnsw {
  nombre: string;
  m: number;
  efConstruction: number;
  /** Candidatos que la búsqueda mantiene vivos en cada capa. */
  efSearch: number | null;
  filas: number;
  tamano: string;
  definicion: string;
}

/** El esquema de `chunks` leído del catálogo, no escrito a mano. */
export interface EsquemaTabla {
  tabla: string;
  columnas: ColumnaTabla[];
  indices: IndiceTabla[];
  ddl: string;
  hnsw: IndiceHnsw | null;
}

/** Lo que el backend devuelve por cada documento que indexa. */
export interface IngestResult {
  documentId: string;
  title: string;
  chunks: number;
  /** Ya estaba indexado: su checksum coincidía. */
  skipped: boolean;
}

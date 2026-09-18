/**
 * Tipos de la recuperación y la respuesta, y de la proyección a 2D del
 * espacio vectorial.
 */

/** Fila cruda de hybrid_search_explain(). */
export interface FilaExplicada extends RetrievedChunk {
  rank_semantico: number | null;
  similitud: number | null;
  rank_lexico: number | null;
  peso_lexico: number | null;
}

/** Un punto del espacio vectorial, listo para dibujar. */
export interface PuntoVectorial {
  id: string;
  x: number;
  y: number;
  titulo: string;
  tipo: string | null;
  seccion: string | null;
  pagina: number | null;
  ocr: boolean;
  /** Coseno con la consulta, si se pasó una. */
  similitud: number | null;
  /** Está entre los topK que alimentarían la respuesta. */
  elegido: boolean;
  /**
   * Cayó fuera del encuadre y se pegó al borde. Se marca para que el dibujo
   * no lo muestre como un punto normal: si no, todos los recortados forman
   * una línea recta contra el margen que parece un dato y no lo es.
   */
  fuera: boolean;
  excerpt: string;
}

export interface EspacioVectorial {
  modelo: string;
  dimensiones: number;
  totalFragmentos: number;
  muestra: number;
  /** Cuánta información conserva cada eje del dibujo (0–1). */
  varianza: [number, number];
  puntos: PuntoVectorial[];
  consulta: { x: number; y: number; texto: string } | null;
  /** Cuántos puntos quedaron fuera del encuadre. */
  fueraDeCuadro: number;
}

export interface RetrievedChunk {
  chunk_id: string;
  document_id: string;
  title: string;
  doc_type: string | null;
  chunk_index: number;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
}

export interface AskResult {
  answer: string;
  citations: Citation[];
  usedChunks: number;
}

export interface Citation {
  n: number;
  documentId: string;
  title: string;
  docType: string | null;
  seccion: string | null;
  pagina: number | null;
  score: number;
  excerpt: string;
  /** El fragmento proviene de OCR: puede contener errores de lectura. */
  ocr: boolean;
}

export interface Punto2D {
  x: number;
  y: number;
}

export interface Base2D {
  media: Float64Array;
  eje1: Float64Array;
  eje2: Float64Array;
  /** Proporción de la varianza total que conserva cada eje (0–1). */
  varianza: [number, number];
}

/** Una columna de una tabla, tal como la describe el catálogo de Postgres. */
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
 * El esquema de `chunks` leído del catálogo, no escrito a mano.
 *
 * La interfaz lo enseña tal cual: si alguien cambia la tabla o el índice, lo
 * que se ve en pantalla cambia con ella.
 */
export interface EsquemaTabla {
  tabla: string;
  columnas: ColumnaTabla[];
  indices: IndiceTabla[];
  /** El `CREATE TABLE` reconstruido a partir de las columnas de arriba. */
  ddl: string;
  /** Parámetros reales del índice vectorial, si la tabla tiene uno. */
  hnsw: IndiceHnsw | null;
}

/**
 * Lo que se puede saber del índice HNSW desde SQL.
 *
 * El grafo interno no se puede leer —pgvector no lo expone—, pero su
 * **estructura** se deriva de estos parámetros: con `m` vecinos por nodo, cada
 * capa tiene aproximadamente `m` veces menos nodos que la de abajo, y el número
 * de capas sale de log_m(filas).
 */
export interface IndiceHnsw {
  nombre: string;
  /** Vecinos por nodo. Determina cuánto se estrecha cada capa. */
  m: number;
  efConstruction: number;
  /** Candidatos que la búsqueda mantiene vivos en cada capa. */
  efSearch: number | null;
  /** Filas con vector en la tabla. */
  filas: number;
  /** Lo que ocupa el índice en disco. */
  tamano: string;
  definicion: string;
}

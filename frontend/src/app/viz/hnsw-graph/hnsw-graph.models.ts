/** Una capa del grafo, con lo que se sabe de ella. */
export interface Capa {
  /** 0 es la capa de abajo: la que tiene todos los nodos. */
  nivel: number;
  y: number;
  /** Nodos que HNSW espera en esta capa, derivados de las filas y de `m`. */
  nodosReales: number;
  /** Los que caben en el dibujo: una muestra, nunca todos. */
  nodos: { x: number; id: string }[];
  /** Nodos por los que pasa el descenso de la búsqueda. */
  ruta: string[];
}

/** Una columna de la fila que se escribe en `chunks`. */
export interface Columna {
  nombre: string;
  tipo: string;
  valor: string;
  /** La escribe Postgres, no el backend. */
  generada: boolean;
  /** Es el vector: se pinta con la tira de barras. */
  esVector: boolean;
}

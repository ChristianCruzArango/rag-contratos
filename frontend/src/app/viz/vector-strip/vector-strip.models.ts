/** Una dimensión del embedding, lista para dibujarse como barra. */
export interface Barra {
  /** Valor real que devolvió el modelo. */
  v: number;
  /** Altura en % de media caja, medida desde la línea del cero. */
  alto: number;
  positivo: boolean;
}
